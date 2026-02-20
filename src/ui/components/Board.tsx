/**
 * Board — GPU-Rendered 8x8 Grid via Skia Declarative API
 *
 * Visual features:
 * - 3D "candy" cells: shadow underneath, highlight on top for depth
 * - Board frame: dark background with subtle border
 * - Ghost preview with valid/invalid tint
 * - Clearing glow overlay
 * - Rescue shield visual
 *
 * Performance:
 * - Single <Canvas> with ~192 Skia draw nodes (3 per cell), GPU-batched
 * - useDerivedValue runs on the UI thread as Reanimated worklets
 * - Zero JS-thread involvement during gameplay rendering
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, RoundedRect, Group, Circle } from '@shopify/react-native-skia';
import Animated, { useDerivedValue, useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { PALETTE } from '../shaders/PatternShaders';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const GRID_SIZE = 8;
const GAP = 3;
const BOARD_PADDING = 16;
const INNER_PAD = 8; // visual breathing room inside the board frame
const CELL_COUNT = GRID_SIZE * GRID_SIZE;

const CELL_INDICES = Array.from({ length: CELL_COUNT }, (_, i) => i);

// ── Hex color helpers ────────────────────────────────────────────────────

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

// Main palette (0=empty, 1-7=colors)
const PALETTE_HEX: string[] = [
  'transparent',
  ...PALETTE.map(([r, g, b]) => `#${toHex(r * 255)}${toHex(g * 255)}${toHex(b * 255)}`),
];

// 25% darker — shadow beneath each filled cell
const PALETTE_HEX_DARK: string[] = [
  'transparent',
  ...PALETTE.map(
    ([r, g, b]) =>
      `#${toHex(r * 0.7 * 255)}${toHex(g * 0.7 * 255)}${toHex(b * 0.7 * 255)}`,
  ),
];

// Lighter highlight — top shine on filled cells (embedded alpha)
const PALETTE_HEX_LIGHT: string[] = [
  'transparent',
  ...PALETTE.map(([r, g, b]) => {
    const lr = Math.min(255, (r + (1 - r) * 0.45) * 255);
    const lg = Math.min(255, (g + (1 - g) * 0.45) * 255);
    const lb = Math.min(255, (b + (1 - b) * 0.45) * 255);
    return `rgba(${Math.round(lr)}, ${Math.round(lg)}, ${Math.round(lb)}, 0.4)`;
  }),
];

const EMPTY_CELL_COLOR = 'rgba(50, 46, 72, 0.7)';
const CLEARING_GLOW_COLOR = 'rgba(255, 255, 255, 0.75)';
const GHOST_VALID_COLOR = 'rgba(140, 230, 205, 0.35)';
const GHOST_INVALID_COLOR = 'rgba(255, 100, 100, 0.15)';
const RESCUE_SHIELD_COLOR = 'rgba(255, 235, 115, 0.30)';

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

export interface BoardProps {
  gridDisplay: SharedValue<number[]>;
  clearingCells: SharedValue<number[]>;
  ghostGrid: SharedValue<number[]>;
  ghostColorId: SharedValue<number>;
  ghostValid: SharedValue<number>;
  patternsEnabled?: boolean;
  rivalScore?: SharedValue<number>;
  currentScore?: SharedValue<number>;
  rivalAlias?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function Board({
  gridDisplay,
  clearingCells,
  ghostGrid,
  ghostColorId,
  ghostValid,
  rivalScore,
  currentScore,
  rivalAlias,
}: BoardProps) {
  const { width: screenWidth } = useWindowDimensions();

  const geometry = useMemo(() => {
    const containerSize = screenWidth - BOARD_PADDING * 2;
    const gridArea = containerSize - INNER_PAD * 2;
    const cellSize = (gridArea - (GRID_SIZE - 1) * GAP) / GRID_SIZE;
    const cornerRadius = cellSize * 0.22;
    const stride = cellSize + GAP;
    return { containerSize, cellSize, cornerRadius, stride };
  }, [screenWidth]);

  const { containerSize, cellSize, cornerRadius, stride } = geometry;
  const hasRival = rivalScore != null && currentScore != null;

  return (
    <View style={[styles.container, { width: containerSize, height: containerSize }]}>
      <Canvas style={{ width: containerSize, height: containerSize }}>
        {CELL_INDICES.map((i) => (
          <CellNode
            key={i}
            index={i}
            cellSize={cellSize}
            cornerRadius={cornerRadius}
            stride={stride}
            offsetX={INNER_PAD}
            offsetY={INNER_PAD}
            gridDisplay={gridDisplay}
            clearingCells={clearingCells}
            ghostGrid={ghostGrid}
            ghostColorId={ghostColorId}
            ghostValid={ghostValid}
          />
        ))}
        {hasRival && (
          <RivalGhostMarker
            rivalScore={rivalScore}
            currentScore={currentScore}
            containerSize={containerSize}
          />
        )}
      </Canvas>
      {hasRival && rivalAlias != null && (
        <RivalAliasLabel
          rivalScore={rivalScore}
          currentScore={currentScore}
          containerSize={containerSize}
          alias={rivalAlias}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CELL NODE — 3D Candy Cell with shadow + highlight
// ═══════════════════════════════════════════════════════════════════════════

interface CellNodeProps {
  index: number;
  cellSize: number;
  cornerRadius: number;
  stride: number;
  offsetX: number;
  offsetY: number;
  gridDisplay: SharedValue<number[]>;
  clearingCells: SharedValue<number[]>;
  ghostGrid: SharedValue<number[]>;
  ghostColorId: SharedValue<number>;
  ghostValid: SharedValue<number>;
}

function CellNode({
  index,
  cellSize,
  cornerRadius,
  stride,
  offsetX,
  offsetY,
  gridDisplay,
  clearingCells,
  ghostGrid,
  ghostColorId,
  ghostValid,
}: CellNodeProps) {
  const row = Math.floor(index / 8);
  const col = index % 8;
  const x = offsetX + col * stride;
  const y = offsetY + row * stride;

  // ── Main color ──────────────────────────────────────────────────────────
  const cellColor = useDerivedValue(() => {
    const val = gridDisplay.value[index] || 0;
    const colorId = val & 7;

    // Clearing glow override
    const clearList = clearingCells.value;
    for (let i = 0; i < clearList.length; i++) {
      if (clearList[i] === index) return CLEARING_GLOW_COLOR;
    }

    if (colorId === 0) {
      const ghostVal = ghostGrid.value[index] || 0;
      if (ghostVal > 0.5) {
        return ghostValid.value > 0.5 ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
      }
      return EMPTY_CELL_COLOR;
    }

    const isRescue = (val & 8) !== 0;
    if (isRescue) return RESCUE_SHIELD_COLOR;

    return PALETTE_HEX[colorId] || EMPTY_CELL_COLOR;
  });

  // ── Shadow color (darker, only for filled cells) ────────────────────────
  const shadowColor = useDerivedValue(() => {
    const val = gridDisplay.value[index] || 0;
    const colorId = val & 7;
    if (colorId === 0) return 'transparent';

    const clearList = clearingCells.value;
    for (let i = 0; i < clearList.length; i++) {
      if (clearList[i] === index) return 'transparent';
    }
    if ((val & 8) !== 0) return 'transparent';

    return PALETTE_HEX_DARK[colorId] || 'transparent';
  });

  // ── Highlight color (lighter, only for filled cells) ────────────────────
  const highlightColor = useDerivedValue(() => {
    const val = gridDisplay.value[index] || 0;
    const colorId = val & 7;
    if (colorId === 0) return 'transparent';

    const clearList = clearingCells.value;
    for (let i = 0; i < clearList.length; i++) {
      if (clearList[i] === index) return 'transparent';
    }
    if ((val & 8) !== 0) return 'transparent';

    return PALETTE_HEX_LIGHT[colorId] || 'transparent';
  });

  return (
    <Group>
      <RoundedRect
        x={x + 0.5}
        y={y + 1.5}
        width={cellSize}
        height={cellSize}
        r={cornerRadius}
        color={shadowColor}
      />
      <RoundedRect
        x={x}
        y={y}
        width={cellSize}
        height={cellSize}
        r={cornerRadius}
        color={cellColor}
      />
      <RoundedRect
        x={x + 3}
        y={y + 2}
        width={cellSize - 6}
        height={cellSize * 0.32}
        r={cornerRadius * 0.6}
        color={highlightColor}
      />
    </Group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RIVAL GHOST MARKER — Skia indicator on right edge of board
// ═══════════════════════════════════════════════════════════════════════════

const RIVAL_DASH_COUNT = 4;
const RIVAL_DASH_W = 7;
const RIVAL_DASH_GAP = 5;
const RIVAL_DOT_R = 4.5;

interface RivalGhostMarkerProps {
  rivalScore: SharedValue<number>;
  currentScore: SharedValue<number>;
  containerSize: number;
}

function RivalGhostMarker({
  rivalScore,
  currentScore,
  containerSize,
}: RivalGhostMarkerProps) {
  const gridArea = containerSize - INNER_PAD * 2;
  const dotCX = containerSize - INNER_PAD - RIVAL_DOT_R - 1;

  const dotCY = useDerivedValue(() => {
    if (rivalScore.value <= 0) return -100;
    const progress = Math.min(1, currentScore.value / rivalScore.value);
    const raw = INNER_PAD + gridArea * (1 - progress);
    return Math.max(INNER_PAD + RIVAL_DOT_R, Math.min(INNER_PAD + gridArea - RIVAL_DOT_R, raw));
  });

  const dashY = useDerivedValue(() => {
    if (rivalScore.value <= 0) return -100;
    const progress = Math.min(1, currentScore.value / rivalScore.value);
    const raw = INNER_PAD + gridArea * (1 - progress);
    return Math.max(INNER_PAD + RIVAL_DOT_R, Math.min(INNER_PAD + gridArea - RIVAL_DOT_R, raw)) - 0.75;
  });

  const dotColor = useDerivedValue(() => {
    if (rivalScore.value <= 0) return 'transparent';
    const progress = Math.min(1, currentScore.value / rivalScore.value);
    const alpha = progress > 0.8 ? 0.65 : 0.35;
    return `rgba(255, 215, 0, ${alpha})`;
  });

  const lineColor = useDerivedValue(() => {
    if (rivalScore.value <= 0) return 'transparent';
    const progress = Math.min(1, currentScore.value / rivalScore.value);
    const alpha = progress > 0.8 ? 0.4 : 0.18;
    return `rgba(255, 215, 0, ${alpha})`;
  });

  return (
    <Group>
      <Circle cx={dotCX} cy={dotCY} r={RIVAL_DOT_R} color={dotColor} />
      {Array.from({ length: RIVAL_DASH_COUNT }, (_, i) => (
        <RoundedRect
          key={`rd${i}`}
          x={dotCX - RIVAL_DOT_R - 4 - i * (RIVAL_DASH_W + RIVAL_DASH_GAP)}
          y={dashY}
          width={RIVAL_DASH_W}
          height={1.5}
          r={0.75}
          color={lineColor}
        />
      ))}
    </Group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RIVAL ALIAS LABEL — RN overlay showing rival initial on board right edge
// ═══════════════════════════════════════════════════════════════════════════

interface RivalAliasLabelProps {
  rivalScore: SharedValue<number>;
  currentScore: SharedValue<number>;
  containerSize: number;
  alias: string;
}

function RivalAliasLabel({
  rivalScore,
  currentScore,
  containerSize,
  alias,
}: RivalAliasLabelProps) {
  const gridArea = containerSize - INNER_PAD * 2;
  const labelSize = 18;

  const animatedStyle = useAnimatedStyle(() => {
    if (rivalScore.value <= 0) {
      return { opacity: 0, transform: [{ translateY: -100 }] };
    }
    const progress = Math.min(1, currentScore.value / rivalScore.value);
    const raw = INNER_PAD + gridArea * (1 - progress);
    const clamped = Math.max(INNER_PAD + RIVAL_DOT_R, Math.min(INNER_PAD + gridArea - RIVAL_DOT_R, raw));
    const opacity = progress > 0.8 ? 0.9 : 0.6;
    return {
      opacity,
      transform: [{ translateY: clamped - labelSize / 2 }],
    };
  });

  return (
    <Animated.View
      style={[styles.rivalLabel, { width: labelSize, height: labelSize, borderRadius: labelSize / 2 }, animatedStyle]}
      pointerEvents="none"
    >
      <Text style={styles.rivalLabelText}>{alias.charAt(0).toUpperCase()}</Text>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(18, 16, 32, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  rivalLabel: {
    position: 'absolute',
    right: 2,
    top: 0,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rivalLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255, 215, 0, 0.8)',
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// COORDINATE UTILITIES (exported for gesture handlers)
// ═══════════════════════════════════════════════════════════════════════════

export { BOARD_PADDING, INNER_PAD };

export function screenToGrid(
  localX: number,
  localY: number,
  cellSize: number,
  gap: number = GAP,
): [row: number, col: number] {
  const stride = cellSize + gap;
  const col = Math.floor(localX / stride);
  const row = Math.floor(localY / stride);
  if (col < 0 || col > 7 || row < 0 || row > 7) return [-1, -1];
  return [row, col];
}

export function gridToScreen(
  row: number,
  col: number,
  cellSize: number,
  gap: number = GAP,
): [x: number, y: number] {
  const stride = cellSize + gap;
  return [col * stride + cellSize / 2, row * stride + cellSize / 2];
}

export function computeBoardGeometry(screenWidth: number) {
  const containerSize = screenWidth - BOARD_PADDING * 2;
  const gridArea = containerSize - INNER_PAD * 2;
  const cellSize = (gridArea - (GRID_SIZE - 1) * GAP) / GRID_SIZE;
  return { boardSize: containerSize, cellSize, gap: GAP, padding: BOARD_PADDING };
}
