/**
 * GameOverModal — Blur overlay with score and actions
 *
 * Appears when the game ends. Shows final score, high score status,
 * and buttons to restart or return home.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

export interface GameOverModalProps {
  visible: boolean;
  score: number;
  highScore: number;
  isNewHighScore: boolean;
  linesCleared: number;
  mode: 'classic' | 'daily';
  onRestart: () => void;
  onHome: () => void;
  /** Optional: opens Game Center leaderboard (iOS only) */
  onShowLeaderboard?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function GameOverModal({
  visible,
  score,
  highScore,
  isNewHighScore,
  linesCleared,
  mode,
  onRestart,
  onHome,
  onShowLeaderboard,
}: GameOverModalProps) {
  if (!visible) return null;

  return (
    <Animated.View
      style={StyleSheet.absoluteFill}
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
    >
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

      <View style={styles.overlay}>
        <Animated.View
          style={styles.card}
          entering={SlideInDown.springify().damping(14).stiffness(120)}
        >
          {/* Header */}
          <Text style={styles.title}>
            {mode === 'daily' ? 'Daily Complete' : 'Game Over'}
          </Text>

          {/* New High Score Badge */}
          {isNewHighScore && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>NEW HIGH SCORE!</Text>
            </View>
          )}

          {/* Score */}
          <Text style={styles.scoreLabel}>Score</Text>
          <Text style={styles.scoreValue}>{score.toLocaleString()}</Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{linesCleared}</Text>
              <Text style={styles.statLabel}>Lines</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {highScore.toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Best</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={onRestart}
            >
              <Text style={styles.buttonText}>
                {mode === 'daily' ? 'View Board' : 'Play Again'}
              </Text>
            </Pressable>

            {onShowLeaderboard != null && (
              <Pressable
                style={[styles.button, styles.leaderboardButton]}
                onPress={onShowLeaderboard}
              >
                <Text style={[styles.buttonText, styles.leaderboardText]}>
                  Ver clasificación
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={onHome}
            >
              <Text style={[styles.buttonText, styles.secondaryText]}>
                Home
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: SCREEN_WIDTH - 64,
    backgroundColor: 'rgba(20, 18, 35, 0.95)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 1,
  },
  badge: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  badgeText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  scoreLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  stat: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: 'rgba(140, 230, 205, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(140, 230, 205, 0.3)',
  },
  leaderboardButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  leaderboardText: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8CE6CD',
    letterSpacing: 0.5,
  },
  secondaryText: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
});
