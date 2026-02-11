/**
 * useHighScore — AsyncStorage persistence for high scores
 *
 * Stores per-mode high scores: classic and daily.
 * Reads on mount, writes when score exceeds current best.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameMode } from '../core/types';

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE KEYS
// ═══════════════════════════════════════════════════════════════════════════

const KEY_PREFIX = '@blockzen:highscore:';

function storageKey(mode: GameMode): string {
  return `${KEY_PREFIX}${mode}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export interface UseHighScoreReturn {
  highScore: number;
  isNewHighScore: boolean;
  submitScore: (score: number) => void;
  resetHighScore: () => void;
}

export function useHighScore(mode: GameMode): UseHighScoreReturn {
  const [highScore, setHighScore] = useState(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const loadedRef = useRef(false);

  // Load high score from AsyncStorage on mount
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(storageKey(mode))
      .then((value) => {
        if (!cancelled && value !== null) {
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed)) {
            setHighScore(parsed);
          }
        }
        loadedRef.current = true;
      })
      .catch(() => {
        loadedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Submit a score — only updates if it's a new high
  const submitScore = useCallback(
    (score: number) => {
      if (score > highScore) {
        setHighScore(score);
        setIsNewHighScore(true);
        AsyncStorage.setItem(storageKey(mode), score.toString()).catch(
          () => {},
        );
      } else {
        setIsNewHighScore(false);
      }
    },
    [highScore, mode],
  );

  // Reset high score (settings option)
  const resetHighScore = useCallback(() => {
    setHighScore(0);
    setIsNewHighScore(false);
    AsyncStorage.removeItem(storageKey(mode)).catch(() => {});
  }, [mode]);

  return { highScore, isNewHighScore, submitScore, resetHighScore };
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDALONE READ — for Home screen display without the full hook
// ═══════════════════════════════════════════════════════════════════════════

export async function readHighScore(mode: GameMode): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(storageKey(mode));
    if (value !== null) {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) return parsed;
    }
  } catch {
    // silent
  }
  return 0;
}
