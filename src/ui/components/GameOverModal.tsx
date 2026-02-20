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
import { useTranslation } from 'react-i18next';

import { formatScore } from '../../core/formatters';

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
  /** Friend surpassed this game — enables challenge button */
  rivalDefeated?: { alias: string; playerId: string } | null;
  /** Send vengeance challenge to the defeated rival */
  onSendChallenge?: () => void;
  /** Open Apple's native friend picker to challenge anyone — shown on new high score */
  onIssueChallenge?: () => void;
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
  rivalDefeated,
  onSendChallenge,
  onIssueChallenge,
}: GameOverModalProps) {
  const { t, i18n } = useTranslation();

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
            {mode === 'daily' ? t('game_over.daily_title') : t('game_over.title')}
          </Text>

          {/* New High Score Badge */}
          {isNewHighScore && (
            <View style={styles.badge}>
              <Text
                style={styles.badgeText}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t('game_over.new_high_score')}
              </Text>
            </View>
          )}

          {/* Challenge Friends — only on new high score, only if Game Center is wired */}
          {isNewHighScore && onIssueChallenge != null && (
            <Pressable
              style={styles.challengeFriendsButton}
              onPress={onIssueChallenge}
              accessibilityRole="button"
              accessibilityLabel={t('game_over.challenge_friends')}
            >
              <Text
                style={styles.challengeFriendsText}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {'⚔️  '}{t('game_over.challenge_friends')}
              </Text>
            </Pressable>
          )}

          {/* Score */}
          <Text style={styles.scoreLabel}>{t('game_over.score_label')}</Text>
          <Text style={styles.scoreValue}>{formatScore(score, i18n.language)}</Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{linesCleared}</Text>
              <Text style={styles.statLabel}>{t('game_over.lines_label')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {formatScore(highScore, i18n.language)}
              </Text>
              <Text style={styles.statLabel}>{t('game_over.best_label')}</Text>
            </View>
          </View>

          {/* Rival Defeated — Vengeance challenge */}
          {rivalDefeated != null && onSendChallenge != null && (
            <View style={styles.vengeanceSection}>
              <Text style={styles.vengeanceText}>
                {t('game_over.vengeance', { alias: rivalDefeated.alias })}
              </Text>
              <Pressable
                style={[styles.button, styles.vengeanceButton]}
                onPress={onSendChallenge}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.send_challenge_to', { alias: rivalDefeated.alias })}
              >
                <Text
                  style={styles.vengeanceButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {t('game_over.send_challenge', { alias: rivalDefeated.alias })}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={onRestart}
              accessibilityRole="button"
              accessibilityLabel={
                mode === 'daily' ? t('a11y.view_board') : t('a11y.play_again')
              }
            >
              <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit>
                {mode === 'daily' ? t('game_over.view_board') : t('game_over.play_again')}
              </Text>
            </Pressable>

            {onShowLeaderboard != null && (
              <Pressable
                style={[styles.button, styles.leaderboardButton]}
                onPress={onShowLeaderboard}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.open_game_center_leaderboard')}
              >
                <Text
                  style={[styles.buttonText, styles.leaderboardText]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {t('game_over.leaderboard')}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={onHome}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.go_home')}
            >
              <Text
                style={[styles.buttonText, styles.secondaryText]}
                numberOfLines={1}
              >
                {t('game_over.home')}
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
  vengeanceSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  vengeanceText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD700',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  vengeanceButton: {
    width: '100%',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.35)',
  },
  vengeanceButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: 0.5,
  },
  challengeFriendsButton: {
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.45)',
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  challengeFriendsText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 215, 0, 0.85)',
    letterSpacing: 0.5,
  },
});
