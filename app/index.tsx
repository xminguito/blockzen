/**
 * Home Screen — Mode Selection & High Scores
 *
 * Premium dark theme with card shadows, decorative mini-blocks,
 * glowing title, and polished layout.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';

import { readHighScore } from '../src/state/useHighScore';
import { useDaily } from '../src/state/useDaily';
import { useGameCenter } from '../src/state/useGameCenter';
import { LEADERBOARD_IDS } from '../src/core/constants';

// ═══════════════════════════════════════════════════════════════════════════
// MINI BLOCK PREVIEW — decorative colored squares for cards
// ═══════════════════════════════════════════════════════════════════════════

const MINI_COLORS = ['#8CE6CD', '#F58C8C', '#B89EED', '#8CC7F5', '#F5C28C', '#A6E88C', '#F5DB73'];

function MiniBoard() {
  // 3x3 grid of tiny colored squares
  const cells = [
    [0, 2, 0],
    [1, 5, 3],
    [6, 0, 4],
  ];
  return (
    <View style={miniStyles.board}>
      {cells.map((row, r) =>
        row.map((c, ci) => (
          <View
            key={`${r}-${ci}`}
            style={[
              miniStyles.cell,
              c > 0
                ? { backgroundColor: MINI_COLORS[c] }
                : { backgroundColor: 'rgba(255,255,255,0.05)' },
            ]}
          />
        )),
      )}
    </View>
  );
}

function DailyIcon({ day }: { day: number }) {
  return (
    <View style={miniStyles.calendarIcon}>
      <View style={miniStyles.calendarTop} />
      <Text style={miniStyles.calendarDay}>{day}</Text>
    </View>
  );
}

const miniStyles = StyleSheet.create({
  board: {
    width: 42,
    height: 42,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginBottom: 10,
  },
  cell: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  calendarIcon: {
    width: 38,
    height: 42,
    backgroundColor: 'rgba(245, 215, 110, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 215, 110, 0.2)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  calendarTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: 'rgba(245, 215, 110, 0.25)',
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  calendarDay: {
    fontSize: 18,
    fontWeight: '900',
    color: 'rgba(245, 215, 110, 0.8)',
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function HomeScreen() {
  const router = useRouter();
  const [classicHigh, setClassicHigh] = useState(0);
  const { dailySeedLabel, hasPlayedToday, todayScore, isLoading } = useDaily();
  const {
    isAuthenticated,
    friendsScores,
    fetchFriendsScores,
    authenticate,
    presentDashboard,
    isAvailable,
  } = useGameCenter();
  const [authInProgress, setAuthInProgress] = useState(false);

  const handleGameCenterPress = async () => {
    if (isAuthenticated) {
      try {
        await presentDashboard(LEADERBOARD_IDS.classic);
      } catch (e) {
        Alert.alert('Game Center', `Error: ${(e as Error).message}`);
      }
      return;
    }
    if (!isAvailable) {
      Alert.alert(
        'Game Center no disponible',
        'El módulo nativo no está cargado. Vuelve a compilar la app con: npx expo run:ios --device'
      );
      return;
    }
    setAuthInProgress(true);
    try {
      const ok = await authenticate();
      if (ok) {
        Alert.alert('Game Center', 'Sesión iniciada correctamente.');
      } else {
        Alert.alert(
          'Game Center',
          'No se pudo conectar. ¿Estás logueado en Ajustes > Game Center?'
        );
      }
    } catch (e) {
      Alert.alert('Game Center', `Error: ${(e as Error).message}`);
    } finally {
      setAuthInProgress(false);
    }
  };

  const today = new Date().getDate();

  useEffect(() => {
    readHighScore('classic').then(setClassicHigh);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios' && isAuthenticated) {
      fetchFriendsScores(LEADERBOARD_IDS.classic);
    }
  }, [isAuthenticated, fetchFriendsScores]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Title */}
        <Animated.View
          style={styles.header}
          entering={FadeInDown.delay(100).springify()}
        >
          <Text style={styles.title}>BLOCK</Text>
          <Text style={styles.titleAccent}>ZEN</Text>
          <Text style={styles.subtitle}>Premium Block Puzzle</Text>
        </Animated.View>

        {/* Mode Buttons */}
        <View style={styles.modes}>
          {/* Classic Mode */}
          <Animated.View entering={FadeInUp.delay(200).springify()}>
            <Pressable
              style={({ pressed }) => [
                styles.modeCard,
                styles.classicCard,
                pressed && styles.cardPressed,
              ]}
              onPress={() => router.push('/game')}
            >
              <MiniBoard />
              <Text style={styles.modeTitle}>Classic</Text>
              <Text style={styles.modeDesc}>
                Endless puzzle. Beat your best score.
              </Text>
              {classicHigh > 0 && (
                <Text style={styles.modeHighScore}>
                  Best: {classicHigh.toLocaleString()}
                </Text>
              )}
            </Pressable>
          </Animated.View>

          {/* Daily Challenge */}
          <Animated.View entering={FadeInUp.delay(350).springify()}>
            <Pressable
              style={({ pressed }) => [
                styles.modeCard,
                styles.dailyCard,
                pressed && styles.cardPressed,
                hasPlayedToday && styles.cardPlayed,
              ]}
              onPress={() => router.push('/daily')}
            >
              <DailyIcon day={today} />
              <Text style={styles.modeTitle}>Daily Challenge</Text>
              <Text style={styles.modeDesc}>
                Same pieces for everyone. One attempt.
              </Text>
              <Text style={styles.modeSeed}>{dailySeedLabel}</Text>
              {hasPlayedToday && (
                <Text style={styles.modeHighScore}>
                  Today: {todayScore.toLocaleString()}
                </Text>
              )}
              {hasPlayedToday && (
                <View style={styles.playedBadge}>
                  <Text style={styles.playedBadgeText}>COMPLETED</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </View>

        {/* Game Center (iOS): sign-in + leaderboard */}
        {Platform.OS === 'ios' && (
          <Animated.View
            style={styles.gameCenterSection}
            entering={FadeInUp.delay(400).springify()}
          >
            {!isAuthenticated ? (
              <Pressable
                style={({ pressed }) => [
                  styles.leaderboardButton,
                  pressed && styles.leaderboardPressed,
                ]}
                onPress={handleGameCenterPress}
                hitSlop={12}
                disabled={authInProgress}
              >
                {authInProgress ? (
                  <ActivityIndicator size="small" color="#8CE6CD" />
                ) : (
                  <Text style={styles.leaderboardButtonText}>
                    Iniciar sesión en Game Center
                  </Text>
                )}
              </Pressable>
            ) : (
              <>
                {friendsScores.length > 0 && (
                  <View style={styles.friendsBlock}>
                    <Text style={styles.friendsTitle}>Amigos a batir</Text>
                    {friendsScores.slice(0, 5).map((entry, i) => (
                      <View key={entry.playerId} style={styles.friendRow}>
                        <Text style={styles.friendRank}>{i + 1}.</Text>
                        <Text style={styles.friendName} numberOfLines={1}>
                          {entry.alias ?? entry.playerId}
                        </Text>
                        <Text style={styles.friendScore}>
                          {entry.score.toLocaleString()}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                <Pressable
                  style={({ pressed }) => [
                    styles.leaderboardButton,
                    pressed && styles.leaderboardPressed,
                  ]}
                  onPress={handleGameCenterPress}
                  hitSlop={12}
                >
                  <Text style={styles.leaderboardButtonText}>
                    Ver clasificación
                  </Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        )}

        {/* Footer */}
        <Animated.View
          style={styles.footer}
          entering={FadeInUp.delay(500).springify()}
        >
          <Text style={styles.footerText}>
            Tap a mode to begin
          </Text>
          <Text style={styles.versionText}>v1.0</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f2725f5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 56,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 10,
    textShadowColor: 'rgba(140, 230, 205, 0.2)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  titleAccent: {
    fontSize: 56,
    fontWeight: '900',
    color: '#8CE6CD',
    letterSpacing: 10,
    marginTop: -14,
    textShadowColor: 'rgba(140, 230, 205, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 25,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 10,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  modes: {
    gap: 16,
  },
  modeCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    // Card shadow (iOS)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  classicCard: {
    backgroundColor: 'rgba(140, 230, 205, 0.07)',
    borderColor: 'rgba(140, 230, 205, 0.12)',
  },
  dailyCard: {
    backgroundColor: 'rgba(245, 215, 110, 0.07)',
    borderColor: 'rgba(245, 215, 110, 0.12)',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardPlayed: {
    opacity: 0.5,
  },
  modeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  modeDesc: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.45)',
    lineHeight: 20,
  },
  modeSeed: {
    fontSize: 12,
    color: 'rgba(245, 215, 110, 0.5)',
    marginTop: 6,
    fontWeight: '600',
    letterSpacing: 1,
  },
  modeHighScore: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.35)',
    marginTop: 8,
    fontWeight: '600',
  },
  playedBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(245, 215, 110, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  playedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(245, 215, 110, 0.7)',
    letterSpacing: 1.5,
  },
  gameCenterSection: {
    marginTop: 24,
    gap: 12,
  },
  friendsBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  friendsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  friendRank: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.35)',
    width: 18,
  },
  friendName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  friendScore: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8CE6CD',
  },
  leaderboardButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(140, 230, 205, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(140, 230, 205, 0.25)',
    alignSelf: 'center',
  },
  leaderboardPressed: {
    opacity: 0.85,
  },
  leaderboardButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8CE6CD',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    marginTop: 48,
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.15)',
    letterSpacing: 1,
  },
  versionText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.1)',
    letterSpacing: 1,
  },
});
