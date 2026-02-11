/**
 * BlockZen Block Definitions
 *
 * 23 unique block shapes. Blocks CANNOT be rotated (like Block Blast).
 * Each shape is a 2D ReadonlyArray where 1=filled, 0=empty.
 * Pre-computed width, height, and cellCount for zero runtime overhead.
 */

import type { BlockDef, ShapeMatrix } from './types';

// ── Factory ─────────────────────────────────────────────────────────────────

let nextId = 0;

function def(shape: (0 | 1)[][]): BlockDef {
  const height = shape.length;
  const width = shape[0].length;
  let cellCount = 0;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (shape[r][c] === 1) cellCount++;
    }
  }

  return {
    id: nextId++,
    shape: shape as ShapeMatrix,
    width,
    height,
    cellCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK CATALOGUE — 23 unique shapes
// ═══════════════════════════════════════════════════════════════════════════

// ── 1-cell ──────────────────────────────────────────────────────────────────

export const SINGLE = def([[1]]);

// ── 2-cell (Dominos) ────────────────────────────────────────────────────────

export const DOMINO_H = def([[1, 1]]);
export const DOMINO_V = def([[1], [1]]);

// ── 3-cell (Trominos) ───────────────────────────────────────────────────────

export const LINE_3H = def([[1, 1, 1]]);
export const LINE_3V = def([[1], [1], [1]]);

export const L_3_A = def([
  [1, 1],
  [1, 0],
]);
export const L_3_B = def([
  [1, 1],
  [0, 1],
]);
export const L_3_C = def([
  [0, 1],
  [1, 1],
]);
export const L_3_D = def([
  [1, 0],
  [1, 1],
]);

// ── 4-cell (Tetrominoes) ────────────────────────────────────────────────────

export const LINE_4H = def([[1, 1, 1, 1]]);
export const LINE_4V = def([[1], [1], [1], [1]]);

export const SQUARE_2X2 = def([
  [1, 1],
  [1, 1],
]);

export const Z_4_A = def([
  [1, 1, 0],
  [0, 1, 1],
]);
export const Z_4_B = def([
  [0, 1, 1],
  [1, 1, 0],
]);

export const L_4_A = def([
  [1, 1, 1],
  [1, 0, 0],
]);
export const L_4_B = def([
  [1, 1, 1],
  [0, 0, 1],
]);
export const L_4_C = def([
  [1, 0],
  [1, 0],
  [1, 1],
]);
export const L_4_D = def([
  [0, 1],
  [0, 1],
  [1, 1],
]);

export const T_4 = def([
  [1, 1, 1],
  [0, 1, 0],
]);

// ── 5-cell (Pentominoes) ────────────────────────────────────────────────────

export const LINE_5H = def([[1, 1, 1, 1, 1]]);
export const LINE_5V = def([[1], [1], [1], [1], [1]]);

// ── Large blocks ────────────────────────────────────────────────────────────

export const RECT_2X3 = def([
  [1, 1, 1],
  [1, 1, 1],
]);
export const SQUARE_3X3 = def([
  [1, 1, 1],
  [1, 1, 1],
  [1, 1, 1],
]);

// ═══════════════════════════════════════════════════════════════════════════
// ALL BLOCKS ARRAY — used by RNG to pick random pieces
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_BLOCKS: readonly BlockDef[] = [
  SINGLE,
  DOMINO_H,
  DOMINO_V,
  LINE_3H,
  LINE_3V,
  L_3_A,
  L_3_B,
  L_3_C,
  L_3_D,
  LINE_4H,
  LINE_4V,
  SQUARE_2X2,
  Z_4_A,
  Z_4_B,
  L_4_A,
  L_4_B,
  L_4_C,
  L_4_D,
  T_4,
  LINE_5H,
  LINE_5V,
  RECT_2X3,
  SQUARE_3X3,
];

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHTED SELECTION — difficulty balancing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Block weights for random selection.
 * Higher weight = more likely to appear.
 * Large blocks (3x3, 5-line) are rarer to increase challenge.
 *
 * Index matches ALL_BLOCKS array.
 */
export const BLOCK_WEIGHTS: readonly number[] = [
  8, // SINGLE — common
  7, // DOMINO_H
  7, // DOMINO_V
  6, // LINE_3H
  6, // LINE_3V
  5, // L_3_A
  5, // L_3_B
  5, // L_3_C
  5, // L_3_D
  4, // LINE_4H
  4, // LINE_4V
  5, // SQUARE_2X2
  3, // Z_4_A
  3, // Z_4_B
  4, // L_4_A
  4, // L_4_B
  4, // L_4_C
  4, // L_4_D
  4, // T_4
  2, // LINE_5H — rare
  2, // LINE_5V — rare
  3, // RECT_2X3
  1, // SQUARE_3X3 — very rare
];

/**
 * Pre-computed cumulative weights for O(log n) weighted random selection.
 */
export const CUMULATIVE_WEIGHTS: readonly number[] = (() => {
  const cumulative: number[] = [];
  let total = 0;
  for (let i = 0; i < BLOCK_WEIGHTS.length; i++) {
    total += BLOCK_WEIGHTS[i];
    cumulative.push(total);
  }
  return cumulative;
})();

export const TOTAL_WEIGHT = CUMULATIVE_WEIGHTS[CUMULATIVE_WEIGHTS.length - 1];

/**
 * Pick a random block using weighted selection.
 * Uses binary search on cumulative weights for O(log n).
 *
 * @param random - A number in [0, 1) from the PRNG
 */
export function pickWeightedBlock(random: number): BlockDef {
  const target = random * TOTAL_WEIGHT;

  // Binary search for the first cumulative weight > target
  let lo = 0;
  let hi = CUMULATIVE_WEIGHTS.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (CUMULATIVE_WEIGHTS[mid] <= target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return ALL_BLOCKS[lo];
}
