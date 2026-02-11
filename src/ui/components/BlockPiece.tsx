/**
 * BlockPiece — Draggable Block with Pan Gesture
 *
 * Drag feel:
 * - Piece scales up to match board cell size (like Block Blast)
 * - Small Y offset (-35px) to keep piece visible above finger
 * - Quick spring response for snappy feel
 * - Drop shadow while dragging
 * - Ghost preview updates only on grid-position change
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Canvas, RoundedRect, Group } from '@shopify/react-native-skia';

import { PALETTE } from '../shaders/PatternShaders';
import { computeBoardGeometry } from './Board';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TRAY_CELL_SIZE = 24;
const TRAY_GAP = 3;
const TRAY_CORNER_RADIUS = 5;

const DRAG_OFFSET_Y = -35; // Small lift — keeps piece visible above finger
const SNAP_SPRING = { damping: 14, stiffness: 280, mass: 0.6 };
const SCALE_SPRING = { damping: 12, stiffness: 250, mass: 0.5 };

const BOARD_PADDING = 16;
const INNER_PAD = 8; // Must match Board.tsx INNER_PAD

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

export interface BlockPieceProps {
  index: number;
  shape: ReadonlyArray<ReadonlyArray<0 | 1>>;
  width: number;
  height: number;
  colorId: number;
  placed: boolean;
  boardTopY: number;
  onDragUpdate: (blockIndex: number, row: number, col: number) => void;
  onDragEnd: () => void;
  onPlace: (blockIndex: number, row: number, col: number) => void;
  canPlace: (blockIndex: number, row: number, col: number) => boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function BlockPiece({
  index,
  shape,
  width: blockWidth,
  height: blockHeight,
  colorId,
  placed,
  boardTopY,
  onDragUpdate,
  onDragEnd,
  onPlace,
  canPlace: canPlaceAt,
}: BlockPieceProps) {
  const { width: screenWidth } = useWindowDimensions();
  const { cellSize, gap } = computeBoardGeometry(screenWidth);

  // Scale factor: piece grows to match board cell size during drag
  const dragScale = (cellSize + gap) / (TRAY_CELL_SIZE + TRAY_GAP);

  // Track last grid position to avoid redundant ghost updates
  const lastGridPosRef = useRef<string>('');

  // Animation shared values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(placed ? 0 : 1);
  const isDragging = useSharedValue(false);
  const zIndex = useSharedValue(0);

  // Reset when piece is recycled
  useEffect(() => {
    if (!placed) {
      opacity.value = 1;
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      zIndex.value = 0;
      lastGridPosRef.current = '';
    }
  }, [placed, opacity, scale, translateX, translateY, zIndex]);

  // Piece pixel dimensions in tray
  const pieceWidth = blockWidth * (TRAY_CELL_SIZE + TRAY_GAP) - TRAY_GAP;
  const pieceHeight = blockHeight * (TRAY_CELL_SIZE + TRAY_GAP) - TRAY_GAP;

  // Color as hex string for Skia
  const colorHex = useMemo(() => {
    if (colorId < 1 || colorId > 7) return '#FFFFFF';
    const [r, g, b] = PALETTE[colorId - 1];
    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }, [colorId]);

  // Darker color for shadow effect on tray piece cells
  const colorHexDark = useMemo(() => {
    if (colorId < 1 || colorId > 7) return '#CCCCCC';
    const [r, g, b] = PALETTE[colorId - 1];
    const toHex = (v: number) =>
      Math.round(Math.max(0, v * 0.7) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }, [colorId]);

  // Lighter color for highlight
  const colorHexLight = useMemo(() => {
    if (colorId < 1 || colorId > 7) return '#FFFFFF';
    const [r, g, b] = PALETTE[colorId - 1];
    const lr = Math.min(1, r + (1 - r) * 0.45);
    const lg = Math.min(1, g + (1 - g) * 0.45);
    const lb = Math.min(1, b + (1 - b) * 0.45);
    return `rgba(${Math.round(lr * 255)}, ${Math.round(lg * 255)}, ${Math.round(lb * 255)}, 0.45)`;
  }, [colorId]);

  // Compute grid position from screen coordinates (JS thread only)
  const computeGridPos = (absX: number, absY: number): [number, number] => {
    const boardLeft = BOARD_PADDING + INNER_PAD;
    const boardTop = boardTopY + INNER_PAD;
    const stride = cellSize + gap;
    const localX = absX - boardLeft - (blockWidth * stride) / 2;
    const localY = absY - boardTop - (blockHeight * stride) / 2 + DRAG_OFFSET_Y;
    const col = Math.round(localX / stride);
    const row = Math.round(localY / stride);
    return [row, col];
  };

  // Only fire ghost update when grid position actually changes
  const handleDragUpdate = (absX: number, absY: number) => {
    const [row, col] = computeGridPos(absX, absY);
    const key = `${row},${col}`;
    if (key !== lastGridPosRef.current) {
      lastGridPosRef.current = key;
      onDragUpdate(index, row, col);
    }
  };

  const handleDragEnd = (absX: number, absY: number) => {
    lastGridPosRef.current = '';
    onDragEnd();
    const [row, col] = computeGridPos(absX, absY);
    if (canPlaceAt(index, row, col)) {
      opacity.value = withTiming(0, { duration: 120 });
      scale.value = withTiming(0.85, { duration: 120 });
      onPlace(index, row, col);
    }
  };

  // ── Pan Gesture ──────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      isDragging.value = true;
      scale.value = withSpring(dragScale, SCALE_SPRING);
      zIndex.value = 100;
    })
    .onUpdate((event) => {
      'worklet';
      translateX.value = event.translationX;
      translateY.value = event.translationY + DRAG_OFFSET_Y;
      runOnJS(handleDragUpdate)(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      'worklet';
      isDragging.value = false;
      runOnJS(handleDragEnd)(event.absoluteX, event.absoluteY);
      translateX.value = withSpring(0, SNAP_SPRING);
      translateY.value = withSpring(0, SNAP_SPRING);
      scale.value = withSpring(1, SNAP_SPRING);
      zIndex.value = 0;
    })
    .enabled(!placed);

  // ── Animated Style ───────────────────────────────────────────────────────
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
    zIndex: zIndex.value,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: isDragging.value ? 10 : 0 },
    shadowOpacity: isDragging.value ? 0.5 : 0,
    shadowRadius: isDragging.value ? 16 : 0,
    elevation: isDragging.value ? 12 : 0,
  }));

  if (placed) {
    return null;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.container,
          { width: pieceWidth + 8, height: pieceHeight + 8 },
          animatedStyle,
        ]}
      >
        <Canvas
          style={{
            width: pieceWidth,
            height: pieceHeight,
          }}
        >
          <Group>
            {shape.flatMap((row, r) =>
              row.map((cell, c) => {
                if (cell === 0) return null;
                const cx = c * (TRAY_CELL_SIZE + TRAY_GAP);
                const cy = r * (TRAY_CELL_SIZE + TRAY_GAP);
                return (
                  <Group key={`${r}-${c}`}>
                    {/* Shadow */}
                    <RoundedRect
                      x={cx + 0.5}
                      y={cy + 1.5}
                      width={TRAY_CELL_SIZE}
                      height={TRAY_CELL_SIZE}
                      r={TRAY_CORNER_RADIUS}
                      color={colorHexDark}
                    />
                    {/* Main */}
                    <RoundedRect
                      x={cx}
                      y={cy}
                      width={TRAY_CELL_SIZE}
                      height={TRAY_CELL_SIZE}
                      r={TRAY_CORNER_RADIUS}
                      color={colorHex}
                    />
                    {/* Highlight */}
                    <RoundedRect
                      x={cx + 2}
                      y={cy + 1.5}
                      width={TRAY_CELL_SIZE - 4}
                      height={TRAY_CELL_SIZE * 0.3}
                      r={TRAY_CORNER_RADIUS * 0.5}
                      color={colorHexLight}
                    />
                  </Group>
                );
              }),
            )}
          </Group>
        </Canvas>
      </Animated.View>
    </GestureDetector>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
});
