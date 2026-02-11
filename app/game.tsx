/**
 * Game Screen — Classic Mode
 *
 * Visual features:
 * - Animated score counter with roll-up and scale bump
 * - Floating "+N" points text on placement
 * - Block Blast-style combo overlay ("Excellent!", "Amazing!") on the board
 * - Board + ParticleCanvas overlay
 * - Premium BlockTray
 * - Game Over modal with blur
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSpring,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

import { useGame } from '../src/state/useGame';
import { useHighScore } from '../src/state/useHighScore';
import { Board, computeBoardGeometry } from '../src/ui/components/Board';
import { ParticleCanvas } from '../src/ui/components/ParticleCanvas';
import { BlockTray } from '../src/ui/components/BlockTray';
import { GameOverModal } from '../src/ui/components/GameOverModal';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const HUD_HEIGHT = 72;

// Combo → glow color mapping
const COMBO_COLORS: Record<number, string> = {
  2: '#4CE69C',
  3: '#4CB8E6',
  4: '#FFD700',
  5: '#FF8C00',
  6: '#FF4444',
  7: '#FF00FF',
  8: '#FF00FF',
  9: '#FF00FF',
};

function getComboColor(level: number): string {
  return COMBO_COLORS[Math.min(level, 9)] || '#FFD700';
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATED SCORE — rolls up smoothly with scale bump
// ═══════════════════════════════════════════════════════════════════════════

function AnimatedScore({ score }: { score: number }) {
  const displayValue = useSharedValue(0);
  const scaleValue = useSharedValue(1);
  const [displayText, setDisplayText] = useState('0');

  const updateText = useCallback((val: number) => {
    setDisplayText(Math.round(val).toLocaleString());
  }, []);

  useEffect(() => {
    displayValue.value = withTiming(score, {
      duration: 350,
      easing: Easing.out(Easing.cubic),
    });
    scaleValue.value = withSequence(
      withTiming(1.18, { duration: 100 }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
  }, [score, displayValue, scaleValue]);

  useAnimatedReaction(
    () => displayValue.value,
    (current) => {
      runOnJS(updateText)(current);
    },
  );

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <Animated.View style={scaleStyle}>
      <Text style={styles.scoreValue}>{displayText}</Text>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD COMBO OVERLAY — "Excellent!", "Amazing!" etc. centered on board
// ═══════════════════════════════════════════════════════════════════════════

function BoardComboOverlay({
  label,
  level,
  points,
  id,
}: {
  label: string;
  level: number;
  points: number;
  id: number;
}) {
  const color = getComboColor(level);
  const isHigh = level >= 4;
  const fontSize = isHigh ? 36 : 30;

  return (
    <Animated.View
      key={id}
      style={styles.comboOverlay}
      entering={ZoomIn.springify().damping(10).stiffness(150)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
    >
      {/* Glow background */}
      <View
        style={[
          styles.comboGlow,
          {
            backgroundColor: color,
            opacity: 0.12,
            transform: [{ scale: isHigh ? 2.5 : 1.8 }],
          },
        ]}
      />
      {/* Points */}
      <Text
        style={[
          styles.comboPoints,
          { color, textShadowColor: color },
        ]}
      >
        +{points.toLocaleString()}
      </Text>
      {/* Label */}
      <Text
        style={[
          styles.comboLabel,
          {
            color: '#FFFFFF',
            fontSize,
            textShadowColor: color,
          },
        ]}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function GameScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { boardSize, cellSize, gap } = computeBoardGeometry(screenWidth);
  const boardRef = useRef<View>(null);
  const [boardTopY, setBoardTopY] = useState(0);

  // Game state
  const game = useGame('classic');
  const { highScore, isNewHighScore, submitScore } = useHighScore('classic');

  // Floating points state
  const [floatingPoints, setFloatingPoints] = useState<{
    points: number;
    id: number;
  } | null>(null);
  const prevScoreRef = useRef(0);
  const floatingIdRef = useRef(0);

  // Combo overlay state
  const [comboOverlay, setComboOverlay] = useState<{
    label: string;
    level: number;
    points: number;
    id: number;
  } | null>(null);
  const comboIdRef = useRef(0);

  // Track score changes for floating "+N" and combo overlay
  useEffect(() => {
    const delta = game.score - prevScoreRef.current;
    if (delta > 0 && prevScoreRef.current > 0) {
      floatingIdRef.current += 1;
      setFloatingPoints({ points: delta, id: floatingIdRef.current });
      const timer = setTimeout(() => setFloatingPoints(null), 800);
      return () => clearTimeout(timer);
    }
    prevScoreRef.current = game.score;
  }, [game.score]);

  // Track combo changes for board overlay
  useEffect(() => {
    if (game.comboLabel && game.combo >= 2) {
      comboIdRef.current += 1;
      const delta = game.score - prevScoreRef.current;
      setComboOverlay({
        label: game.comboLabel,
        level: game.combo,
        points: delta > 0 ? delta : game.score,
        id: comboIdRef.current,
      });
      const timer = setTimeout(() => setComboOverlay(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [game.comboLabel, game.combo, game.score]);

  // Submit score when game ends
  const prevGameOver = useRef(false);
  if (game.isGameOver && !prevGameOver.current) {
    prevGameOver.current = true;
    submitScore(game.score);
  }
  if (!game.isGameOver && prevGameOver.current) {
    prevGameOver.current = false;
  }

  // Board layout measurement
  const onBoardLayout = useCallback(() => {
    boardRef.current?.measure((_x, _y, _w, _h, _px, pageY) => {
      setBoardTopY(pageY);
    });
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={styles.container} entering={FadeIn.duration(400)}>
        {/* HUD */}
        <View style={styles.hud}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{'<'} Home</Text>
          </Pressable>

          <View style={styles.scoreSection}>
            <Text style={styles.scoreLabel}>S C O R E</Text>
            <AnimatedScore score={game.score} />
          </View>

          <View style={styles.hudRight}>
            <Text style={styles.bestLabel}>BEST</Text>
            <Text style={styles.bestValue}>
              {Math.max(highScore, game.score).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Board + Particles + Combo Overlay */}
        <View
          ref={boardRef}
          onLayout={onBoardLayout}
          style={styles.boardContainer}
        >
          <Board
            gridDisplay={game.gridDisplay}
            clearingCells={game.clearingCells}
            ghostGrid={game.ghostGrid}
            ghostColorId={game.ghostColorId}
            ghostValid={game.ghostValid}
          />
          <ParticleCanvas
            clearingCells={game.clearingCells}
            gridDisplay={game.gridDisplay}
            boardSize={boardSize}
            cellSize={cellSize}
            gap={gap}
          />

          {/* Combo overlay — centered on board */}
          {comboOverlay && (
            <BoardComboOverlay
              label={comboOverlay.label}
              level={comboOverlay.level}
              points={comboOverlay.points}
              id={comboOverlay.id}
            />
          )}

          {/* Floating "+N" score on board */}
          {floatingPoints && (
            <Animated.Text
              key={floatingPoints.id}
              style={styles.floatingPoints}
              entering={FadeInUp.springify()}
              exiting={FadeOut.duration(250)}
            >
              +{floatingPoints.points.toLocaleString()}
            </Animated.Text>
          )}
        </View>

        {/* Block Tray */}
        <BlockTray
          pieces={game.tray}
          trayGen={game.trayGen}
          boardTopY={boardTopY}
          onDragUpdate={game.updateGhostPreview}
          onDragEnd={game.clearGhostPreview}
          onPlace={game.handleBlockPlaced}
          canPlace={game.canPlaceAt}
        />

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <Text style={styles.statText}>
            Lines: {game.linesCleared}
          </Text>
        </View>
      </Animated.View>

      {/* Game Over Modal */}
      <GameOverModal
        visible={game.isGameOver}
        score={game.score}
        highScore={Math.max(highScore, game.score)}
        isNewHighScore={isNewHighScore}
        linesCleared={game.linesCleared}
        mode="classic"
        onRestart={() => game.restart()}
        onHome={() => router.replace('/')}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B0B1E',
  },
  container: {
    flex: 1,
  },
  // ── HUD ──
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: HUD_HEIGHT,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
    minWidth: 70,
  },
  backText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: '600',
  },
  scoreSection: {
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    letterSpacing: 4,
    fontWeight: '700',
  },
  scoreValue: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  hudRight: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  bestLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.25)',
    letterSpacing: 2,
    fontWeight: '700',
  },
  bestValue: {
    fontSize: 16,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  // ── Board ──
  boardContainer: {
    alignSelf: 'center',
    marginTop: 4,
  },
  // ── Combo overlay (centered on board) ──
  comboOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  comboGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  comboPoints: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    marginBottom: 2,
  },
  comboLabel: {
    fontWeight: '900',
    letterSpacing: 2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    textTransform: 'uppercase',
  },
  // ── Floating Points ──
  floatingPoints: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
    textShadowColor: 'rgba(255, 255, 255, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    zIndex: 40,
  },
  // ── Stats ──
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 6,
  },
  statText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.2)',
    fontWeight: '600',
  },
});
