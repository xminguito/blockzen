/**
 * BlockTray — 3-Slot Tray for Draggable Block Pieces
 *
 * Renders 3 BlockPiece components in a horizontal row below the board.
 * Spring-in animation when new pieces appear.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';

import type { TrayPiece } from '../../core/types';
import { BlockPiece } from './BlockPiece';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SPRING_CONFIG = { damping: 10, stiffness: 120, mass: 0.7 };
const STAGGER_DELAY = 80; // ms between each piece appearing

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

export interface BlockTrayProps {
  pieces: TrayPiece[];
  trayGen: number; // generation counter — forces remount on new tray set
  screenToGrid: (sx: number, sy: number, bw: number, bh: number) => [number, number];
  onDragUpdate: (blockIndex: number, row: number, col: number) => void;
  onDragEnd: () => void;
  onPlace: (blockIndex: number, row: number, col: number) => void;
  canPlace: (blockIndex: number, row: number, col: number) => boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function BlockTray({
  pieces,
  trayGen,
  screenToGrid,
  onDragUpdate,
  onDragEnd,
  onPlace,
  canPlace,
}: BlockTrayProps) {
  return (
    <View style={styles.trayOuter}>
      <View style={styles.tray}>
        {pieces.map((piece, i) => (
          <TraySlot key={`gen${trayGen}-${i}`} index={i}>
            <BlockPiece
            index={i}
            shape={piece.block.shape}
            width={piece.block.width}
            height={piece.block.height}
            colorId={piece.colorId}
            placed={piece.placed}
            screenToGrid={screenToGrid}
            onDragUpdate={onDragUpdate}
            onDragEnd={onDragEnd}
            onPlace={onPlace}
            canPlace={canPlace}
            />
          </TraySlot>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAY SLOT — Spring-in animation per slot
// ═══════════════════════════════════════════════════════════════════════════

function TraySlot({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const scale = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    scale.value = withDelay(
      index * STAGGER_DELAY,
      withSpring(1, SPRING_CONFIG),
    );
    translateY.value = withDelay(
      index * STAGGER_DELAY,
      withSpring(0, SPRING_CONFIG),
    );
  }, [index, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <Animated.View style={[styles.slot, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  trayOuter: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(18, 16, 32, 0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  tray: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 8,
    minHeight: 110,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
