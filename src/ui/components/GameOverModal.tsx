/**
 * GameOverModal — Blur overlay with score and actions
 *
 * Appears when the game ends. Shows final score, high score status,
 * and buttons to restart or return home.
 */

import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { formatScore } from '../../core/formatters';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const BUTTON_SPRING = { damping: 10, stiffness: 120, mass: 0.7 };

/** 4-stop metallic gold palette — simulates brushed metal highlight */
const GOLD_GRADIENT = ['#FDB931', '#F7941E', '#FDB931', '#E87C1E'] as const;

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
  /** Number of friends whose score the user beat this game */
  friendsSurpassedCount?: number;
  /** True while friends scores are being refreshed from Game Center */
  isLoadingFriends?: boolean;
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
  friendsSurpassedCount,
  isLoadingFriends,
}: GameOverModalProps) {
  const { t, i18n } = useTranslation();

  // ── Spring entrance: vengeanceButton pops in 400ms after modal ──
  const buttonScale = useSharedValue(0);

  // ── Diagonal shimmer ray across golden buttons (3s loop) ──
  const shimmerX = useSharedValue(-140);

  useEffect(() => {
    if (!visible) {
      buttonScale.value = 0;
      return;
    }
    buttonScale.value = withDelay(400, withSpring(1, BUTTON_SPRING));
  }, [visible]);

  useEffect(() => {
    shimmerX.value = withRepeat(
      withTiming(SCREEN_WIDTH, { duration: 3000 }),
      -1,
      false,
    );
  }, []);

  const vengeanceButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  // ── Haptic handlers — fire before native action ──
  const handleSendChallenge = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSendChallenge?.();
  }, [onSendChallenge]);

  const handleIssueChallenge = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onIssueChallenge?.();
  }, [onIssueChallenge]);

  if (!visible) return null;

  const showFriendsSurpassed = (friendsSurpassedCount ?? 0) > 0;

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
              <Text style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit>
                {t('game_over.new_high_score')}
              </Text>
            </View>
          )}

          {/* Challenge Friends — only on new high score, only if Game Center is wired */}
          {isNewHighScore && onIssueChallenge != null && (
            <View style={styles.goldButtonGlow}>
              <Pressable
                style={styles.challengeFriendsButton}
                onPress={handleIssueChallenge}
                accessibilityRole="button"
                accessibilityLabel={t('game_over.share_victory')}
              >
                <LinearGradient
                  colors={GOLD_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={[StyleSheet.absoluteFill, styles.gradientFill]}
                />
                <Animated.View
                  style={[styles.shimmerRay, shimmerStyle]}
                  pointerEvents="none"
                >
                  <LinearGradient
                    colors={['transparent', 'rgba(255,255,255,0.30)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <Text style={styles.challengeFriendsText} numberOfLines={1} adjustsFontSizeToFit>
                  <Text style={styles.buttonIcon}>⚔️  </Text>
                  {t('game_over.share_victory')}
                </Text>
              </Pressable>
            </View>
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

          {/* Social context — friends surpassed this game */}
          {showFriendsSurpassed && (
            <View style={styles.socialContextRow}>
              {isLoadingFriends && (
                <ActivityIndicator size="small" color="rgba(255, 215, 0, 0.75)" />
              )}
              <Text style={styles.socialContextText}>
                {t('game_over.friends_surpassed', { count: friendsSurpassedCount })}
              </Text>
            </View>
          )}

          {/* Rival Defeated — Vengeance challenge (Gold Trophy button) */}
          {rivalDefeated != null && onSendChallenge != null && (
            <View style={styles.vengeanceSection}>
              <Text style={styles.vengeanceText}>
                {t('game_over.vengeance', { alias: rivalDefeated.alias })}
              </Text>

              {/*
               * Two-layer structure:
               * 1. Outer Animated.View  — carries spring scale + iOS glow shadow (no overflow:hidden)
               * 2. Inner Pressable      — clips the shimmer ray (overflow:hidden)
               */}
              <Animated.View style={[styles.goldButtonGlow, vengeanceButtonAnimStyle]}>
                <Pressable
                  style={styles.vengeanceButtonInner}
                  onPress={handleSendChallenge}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.send_challenge_to', { alias: rivalDefeated.alias })}
                >
                  {/* Metallic gradient fill */}
                  <LinearGradient
                    colors={GOLD_GRADIENT}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[StyleSheet.absoluteFill, styles.gradientFill]}
                  />
                  {/* Diagonal shimmer ray */}
                  <Animated.View
                    style={[styles.shimmerRay, shimmerStyle]}
                    pointerEvents="none"
                  >
                    <LinearGradient
                      colors={['transparent', 'rgba(255,255,255,0.30)', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </Animated.View>
                  {/* Label — icon 20% brighter than text */}
                  <Text
                    style={styles.vengeanceButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    <Text style={styles.buttonIcon}>⚔️  </Text>
                    {t('game_over.send_challenge', { alias: rivalDefeated.alias })}
                  </Text>
                </Pressable>
              </Animated.View>
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
  socialContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  socialContextText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 215, 0, 0.75)',
    letterSpacing: 0.3,
    textAlign: 'center',
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
    overflow: 'hidden',
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
    backgroundColor: 'rgba(255, 215, 0, 0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.18)',
  },
  vengeanceText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD700',
    marginBottom: 10,
    letterSpacing: 0.5,
  },

  // ── Gold Trophy button — outer glow wrapper (no overflow:hidden so shadow renders) ──
  goldButtonGlow: {
    width: '100%',
    borderRadius: 14,
    // iOS glow
    ...Platform.select({
      ios: {
        shadowColor: '#F7941E',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  // ── Gold Trophy button — inner clip container ──
  vengeanceButtonInner: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    overflow: 'hidden',
    // Explicit transparent prevents Android Pressable system background from
    // rendering on top of the LinearGradient fill.
    backgroundColor: 'transparent',
    // Two-tone border: gold base + white material rim overlay (applied via borderColor).
    // The white at 0.5 opacity over the gold gives the appearance of a lit metal edge.
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },

  // ── Challenge Friends button (same metallic treatment, compact) ──
  challengeFriendsButton: {
    width: '100%',
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  challengeFriendsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A2800',
    letterSpacing: 0.5,
  },

  // ── Shared label styles ──
  vengeanceButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4A2800',
    letterSpacing: 0.6,
  },
  /** Icon rendered ~20% brighter than surrounding text via near-white gold tint */
  buttonIcon: {
    color: '#FFFDE0',
  },

  // ── Gradient fill: explicit borderRadius + transparent base so Android never
  //    renders a system opaque background underneath the gradient layer ──
  gradientFill: {
    borderRadius: 14,
    backgroundColor: 'transparent',
  },

  // ── Diagonal shimmer ray (skewed strip traversing button left→right) ──
  shimmerRay: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 60,
    transform: [{ skewX: '-20deg' }],
    opacity: 0.9,
  },
});
