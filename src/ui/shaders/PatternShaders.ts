/**
 * BlockZen Grid Board Shader + Pattern Definitions
 *
 * Single SkSL RuntimeEffect that renders the entire 8x8 grid in ONE draw call.
 * Per-pixel pipeline: cell lookup → SDF rounded rect → color → pattern → effects.
 *
 * Uniform budget: ~219 floats = 55 vec4 = 22% of GPU minimum (256 vec4).
 * No texture samplers. All patterns are procedural math.
 */

// ═══════════════════════════════════════════════════════════════════════════
// COLOR PALETTE — Vivid saturated, Block Blast style
// ═══════════════════════════════════════════════════════════════════════════

export const PALETTE: readonly [number, number, number][] = [
  [0.18, 0.80, 0.55], // 1: Emerald Green
  [0.93, 0.28, 0.28], // 2: Vivid Red
  [0.55, 0.35, 0.95], // 3: Royal Purple
  [0.20, 0.55, 0.98], // 4: Bright Blue
  [0.98, 0.65, 0.12], // 5: Vivid Orange
  [0.30, 0.85, 0.20], // 6: Bright Green
  [0.98, 0.82, 0.10], // 7: Bright Yellow
];

/** Flattened palette for `uniform float colorsPacked[21]` */
export const PALETTE_FLAT: number[] = PALETTE.flat();

/** Pre-allocated empty grid (64 zeros) for SharedValue initialization */
export const EMPTY_GRID_64: number[] = new Array(64).fill(0);

// ═══════════════════════════════════════════════════════════════════════════
// SkSL SHADER SOURCE
//
// Renders the complete board as a fragment shader applied to a <Fill>.
// Each pixel determines its cell via a single division, reads one value
// from cells[64], and renders in a single pass.
//
// Uniform breakdown:
//   cells[64]        = 64 floats  (grid cell values, bit-encoded)
//   clearing[64]     = 64 floats  (glow flags for clearing animation)
//   ghost[64]        = 64 floats  (ghost preview overlay)
//   colorsPacked[21] = 21 floats  (7 RGB triplets)
//   geometry + meta  = 8 floats   (cellSize, gap, cornerRadius, boardSize, ghostColorIdx, ghostValid, time, patternsOn)
//   TOTAL            = ~221 floats = 56 vec4 (22% of 256 vec4 minimum)
// ═══════════════════════════════════════════════════════════════════════════

export const GRID_BOARD_SKSL = `
// ── Grid Data ───────────────────────────────────────────────────────────────
uniform float cells[64];
uniform float clearing[64];
uniform float ghost[64];

// ── Color Palette (7 colors × RGB, flat packed) ─────────────────────────────
uniform float colorsPacked[21];

// ── Geometry ────────────────────────────────────────────────────────────────
uniform float cellSize;
uniform float gap;
uniform float cornerRadius;
uniform float boardSize;

// ── Ghost Metadata ──────────────────────────────────────────────────────────
uniform float ghostColorIdx;
uniform float ghostValid;

// ── Visual Toggles ──────────────────────────────────────────────────────────
uniform float patternsOn;

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

float3 getPaletteColor(int idx) {
  int base = idx * 3;
  return float3(colorsPacked[base], colorsPacked[base + 1], colorsPacked[base + 2]);
}

// SDF for axis-aligned rounded rectangle centered at origin.
// Returns negative inside, positive outside.
float roundedRectSDF(float2 p, float2 halfSize, float r) {
  float2 d = abs(p) - halfSize + r;
  return length(max(d, float2(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

// ═════════════════════════════════════════════════════════════════════════════
// COLORBLIND PATTERNS — procedural, per-pixel, zero texture lookups
//
// Each function takes UV in [0,1] within a cell and returns 0.0 or 1.0.
// Applied as an 18% white blend over the base color.
// ═════════════════════════════════════════════════════════════════════════════

// Color 1 (Mint): regular dot grid
float patternDots(float2 uv) {
  float2 g = fract(uv * 4.0) - 0.5;
  return 1.0 - step(0.18, length(g));
}

// Color 2 (Coral): horizontal stripes
float patternHStripes(float2 uv) {
  return step(0.65, fract(uv.y * 5.0));
}

// Color 3 (Lavender): vertical stripes
float patternVStripes(float2 uv) {
  return step(0.65, fract(uv.x * 5.0));
}

// Color 4 (Sky Blue): 45-degree diagonal lines
float patternDiagonal(float2 uv) {
  return step(0.72, fract((uv.x + uv.y) * 4.0));
}

// Color 5 (Peach): crosshatch (H + V stripes combined)
float patternCrosshatch(float2 uv) {
  float h = step(0.72, fract(uv.y * 5.0));
  float v = step(0.72, fract(uv.x * 5.0));
  return max(h, v);
}

// Color 6 (Lime): double border (inset frame)
float patternDoubleBorder(float2 uv) {
  float2 d = min(uv, 1.0 - uv);
  float outer = step(min(d.x, d.y), 0.14);
  float inner = step(min(d.x, d.y), 0.06);
  return outer - inner;
}

// Color 7 (Gold): diamond / rotated squares
float patternDiamond(float2 uv) {
  float2 g = abs(fract(uv * 3.0) - 0.5);
  return 1.0 - step(0.22, g.x + g.y);
}

// Pattern dispatcher — maps colorId (1-7) to pattern function
float getPattern(int colorId, float2 uv) {
  if (colorId == 1) return patternDots(uv);
  if (colorId == 2) return patternHStripes(uv);
  if (colorId == 3) return patternVStripes(uv);
  if (colorId == 4) return patternDiagonal(uv);
  if (colorId == 5) return patternCrosshatch(uv);
  if (colorId == 6) return patternDoubleBorder(uv);
  if (colorId == 7) return patternDiamond(uv);
  return 0.0;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN — processes ONE pixel
//
// 1. Compute which cell this pixel belongs to (O(1) division)
// 2. Read cell value from cells[idx] (O(1) array lookup)
// 3. SDF rounded rect for anti-aliased edges
// 4. Apply color + pattern + clearing glow + rescue visual + ghost overlay
// ═════════════════════════════════════════════════════════════════════════════

half4 main(float2 pos) {
  float stride = cellSize + gap;

  // ── Step 1: Cell identification ──────────────────────────────────────────
  int col = int(floor(pos.x / stride));
  int row = int(floor(pos.y / stride));

  // Grid bounds check
  if (col < 0 || col > 7 || row < 0 || row > 7) {
    return half4(0.0);
  }

  // Local position within the cell tile (cell area + gap area)
  float2 cellOrigin = float2(float(col), float(row)) * stride;
  float2 localPos = pos - cellOrigin;

  // Pixel is in the gap between cells → transparent
  if (localPos.x > cellSize || localPos.y > cellSize) {
    return half4(0.0);
  }

  // ── Step 2: SDF rounded rectangle ───────────────────────────────────────
  float2 center = float2(cellSize * 0.5);
  float sdf = roundedRectSDF(localPos - center, center, cornerRadius);

  // Outside rounded rect → transparent
  if (sdf > 0.5) {
    return half4(0.0);
  }

  // Anti-aliased alpha (smooth edge over 1px)
  float aa = 1.0 - smoothstep(-0.5, 0.5, sdf);

  // ── Step 3: Read cell data ──────────────────────────────────────────────
  // NOTE: SkSL does NOT support bitwise operators (&, |, ^).
  // We extract bits using integer division + modulo arithmetic instead.
  int idx = row * 8 + col;
  int cellVal = int(cells[idx]);
  int colorId  = cellVal - (cellVal / 8) * 8;            // bits 0-2: mod 8
  bool isRescue = ((cellVal / 8) - (cellVal / 16) * 2) != 0;  // bit 3
  bool isHit    = ((cellVal / 16) - (cellVal / 32) * 2) != 0;  // bit 4

  float clearVal = clearing[idx];
  float ghostVal = ghost[idx];

  // Normalized UV within cell [0, 1]
  float2 uv = localPos / cellSize;

  // ── Step 4a: Empty cell ─────────────────────────────────────────────────
  if (colorId == 0) {
    // Ghost preview on empty cell
    if (ghostVal > 0.5) {
      int gIdx = int(ghostColorIdx) - 1;
      if (gIdx >= 0 && gIdx < 7) {
        float3 gc = getPaletteColor(gIdx);
        float gAlpha = ghostValid > 0.5 ? 0.35 : 0.15;
        return half4(half3(gc * gAlpha), half(gAlpha * aa));
      }
    }
    // Subtle dark background grid
    return half4(0.14, 0.13, 0.20, 0.45 * aa);
  }

  // ── Step 4b: Filled cell ────────────────────────────────────────────────
  float3 baseColor = getPaletteColor(colorId - 1);

  // Clearing glow: white flash blend
  if (clearVal > 0.5) {
    baseColor = mix(baseColor, float3(1.0), 0.65);
  }

  // Rescue block visuals
  if (isRescue && !isHit) {
    // Active shield: golden shimmer
    float shimmer = 0.25 + 0.08 * sin(pos.x * 0.15 + pos.y * 0.12);
    baseColor = mix(baseColor, float3(1.0, 0.92, 0.45), shimmer);
  } else if (isRescue && isHit) {
    // Cracked shield: dimmed
    baseColor *= 0.6;
  }

  // Colorblind pattern overlay (togglable)
  if (patternsOn > 0.5) {
    float pval = getPattern(colorId, uv);
    baseColor = mix(baseColor, float3(1.0), pval * 0.18);
  }

  // Subtle inner catch-light (top-left corner highlight)
  float highlight = smoothstep(0.55, 0.0, uv.x) * smoothstep(0.55, 0.0, uv.y) * 0.10;
  baseColor += highlight;

  return half4(half3(baseColor), half(aa));
}
`;
