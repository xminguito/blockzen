/**
 * Daily Challenge Screen
 *
 * Same as Classic but:
 * - Uses daily seed for deterministic block generation
 * - One attempt per day (gate check)
 * - Shows "already played" state if completed
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
import { useDaily } from '../src/state/useDaily';
import { Board, computeBoardGeometry } from '../src/ui/components/Board';
import { ParticleCanvas } from '../src/ui/components/ParticleCanvas';
import { BlockTray } from '../src/ui/components/BlockTray';
import { GameOverModal } from '../src/ui/components/GameOverModal';

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATED SCORE
// ═══════════════════════════════════════════════════════════════════════════

function AnimatedDailyScore({ score }: { score: number }) {
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
      withTiming(1.15, { duration: 100 }),
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
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function DailyScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { boardSize, cellSize, gap } = computeBoardGeometry(screenWidth);
  const boardRef = useRef<View>(null);
  const [boardTopY, setBoardTopY] = useState(0);

  // Daily challenge state
  const {
    dailySeedLabel,
    hasPlayedToday,
    recordDailyResult,
    isLoading,
  } = useDaily();

  // Game state (daily mode)
  const game = useGame('daily');
  const { highScore, isNewHighScore, submitScore } = useHighScore('daily');

  // Handle game over: submit score + record daily result
  const prevGameOver = useRef(false);
  if (game.isGameOver && !prevGameOver.current) {
    prevGameOver.current = true;
    submitScore(game.score);
    recordDailyResult(game.score);
  }
  if (!game.isGameOver && prevGameOver.current) {
    prevGameOver.current = false;
  }

  const onBoardLayout = useCallback(() => {
    boardRef.current?.measure((_x, _y, _w, _h, _px, pageY) => {
      setBoardTopY(pageY);
    });
  }, []);

  // Gate: if already played today, show results instead
  if (!isLoading && hasPlayedToday && !game.isGameOver) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.playedContainer}>
          <Text style={styles.playedTitle}>Daily Complete</Text>
          <Text style={styles.playedSeed}>{dailySeedLabel}</Text>
          <Text style={styles.playedLabel}>Your Score</Text>
          <Text style={styles.playedScore}>
            {game.score > 0
              ? game.score.toLocaleString()
              : 'Played today'}
          </Text>
          <Text style={styles.playedHint}>
            Come back tomorrow for a new challenge
          </Text>
          <Pressable
            style={styles.homeButton}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.homeButtonText}>Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.playedContainer}>
          <Text style={styles.playedHint}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={styles.container} entering={FadeIn.duration(400)}>
        {/* HUD */}
        <View style={styles.hud}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{'<'} Home</Text>
          </Pressable>

          <View style={styles.centerHud}>
            <Text style={styles.dailyBadge}>DAILY</Text>
            <Text style={styles.dailySeed}>{dailySeedLabel}</Text>
          </View>

          <View style={styles.scoreSection}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <AnimatedDailyScore score={game.score} />
          </View>
        </View>

        {/* Combo */}
        {game.comboLabel && (
          <View style={styles.comboContainer}>
            <Animated.Text
              style={styles.comboText}
              entering={FadeIn.springify()}
            >
              {game.comboLabel}
            </Animated.Text>
          </View>
        )}

        {/* Board + Particles */}
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
      </Animated.View>

      {/* Game Over Modal */}
      <GameOverModal
        visible={game.isGameOver}
        score={game.score}
        highScore={Math.max(highScore, game.score)}
        isNewHighScore={isNewHighScore}
        linesCleared={game.linesCleared}
        mode="daily"
        onRestart={() => router.replace('/')}
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
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 72,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
  },
  centerHud: {
    alignItems: 'center',
  },
  dailyBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F5D76E',
    letterSpacing: 3,
  },
  dailySeed: {
    fontSize: 12,
    color: 'rgba(245, 215, 110, 0.5)',
    marginTop: 2,
  },
  scoreSection: {
    alignItems: 'flex-end',
  },
  scoreLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
    letterSpacing: 2,
    fontWeight: '700',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  comboContainer: {
    alignItems: 'center',
    height: 24,
  },
  comboText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 1,
  },
  boardContainer: {
    alignSelf: 'center',
    marginTop: 8,
  },
  // ── Already Played State ──
  playedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  playedTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  playedSeed: {
    fontSize: 14,
    color: 'rgba(245, 215, 110, 0.6)',
    marginBottom: 32,
    letterSpacing: 1,
  },
  playedLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  playedScore: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 32,
  },
  playedHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 24,
  },
  homeButton: {
    backgroundColor: 'rgba(140, 230, 205, 0.15)',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(140, 230, 205, 0.25)',
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8CE6CD',
  },
});
