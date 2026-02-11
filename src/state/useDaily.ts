/**
 * useDaily — Daily Challenge Tracking
 *
 * Manages the daily challenge lifecycle:
 * - One attempt per day (based on UTC date)
 * - Stores whether today's challenge has been played
 * - Stores today's score (if played)
 * - Provides the daily seed for deterministic block generation
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDailySeed, getDailySeedLabel } from '../core/prng';

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE KEYS
// ═══════════════════════════════════════════════════════════════════════════

const KEY_DAILY_PLAYED = '@blockzen:daily:played';
const KEY_DAILY_SCORE = '@blockzen:daily:score';
const KEY_DAILY_SEED = '@blockzen:daily:seed';

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export interface UseDailyReturn {
  /** Today's daily seed (YYYYMMDD integer) */
  dailySeed: number;
  /** Formatted label "2026-02-09" */
  dailySeedLabel: string;
  /** Whether today's challenge has been attempted */
  hasPlayedToday: boolean;
  /** Today's daily score (0 if not played) */
  todayScore: number;
  /** Mark today as played and record the score */
  recordDailyResult: (score: number) => void;
  /** Whether data is still loading */
  isLoading: boolean;
}

export function useDaily(): UseDailyReturn {
  const seed = getDailySeed();
  const label = getDailySeedLabel(seed);

  const [hasPlayedToday, setHasPlayedToday] = useState(false);
  const [todayScore, setTodayScore] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Load today's status on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [storedSeed, storedPlayed, storedScore] = await Promise.all([
          AsyncStorage.getItem(KEY_DAILY_SEED),
          AsyncStorage.getItem(KEY_DAILY_PLAYED),
          AsyncStorage.getItem(KEY_DAILY_SCORE),
        ]);

        if (cancelled) return;

        const seedStr = seed.toString();

        if (storedSeed === seedStr) {
          // Same day — restore state
          setHasPlayedToday(storedPlayed === 'true');
          setTodayScore(
            storedScore ? parseInt(storedScore, 10) || 0 : 0,
          );
        } else {
          // New day — reset
          setHasPlayedToday(false);
          setTodayScore(0);
          await AsyncStorage.multiSet([
            [KEY_DAILY_SEED, seedStr],
            [KEY_DAILY_PLAYED, 'false'],
            [KEY_DAILY_SCORE, '0'],
          ]);
        }
      } catch {
        // silent fail, default to not played
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [seed]);

  // Record daily result
  const recordDailyResult = useCallback(
    (score: number) => {
      setHasPlayedToday(true);
      setTodayScore(score);

      AsyncStorage.multiSet([
        [KEY_DAILY_SEED, seed.toString()],
        [KEY_DAILY_PLAYED, 'true'],
        [KEY_DAILY_SCORE, score.toString()],
      ]).catch(() => {});
    },
    [seed],
  );

  return {
    dailySeed: seed,
    dailySeedLabel: label,
    hasPlayedToday,
    todayScore,
    recordDailyResult,
    isLoading,
  };
}
