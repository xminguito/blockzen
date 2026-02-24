/**
 * useGameCenter — Game Center state and actions
 *
 * - Authenticates silently on mount (iOS only)
 * - submitScore: fire-and-forget, never blocks UI
 * - fetchFriendsScores: on-demand, run after interactions
 * - presentDashboard: opens native GKGameCenterViewController
 * - nextRival: friend with score immediately above user (for "ofensa competitiva")
 * - sendVengeanceChallenge: sends score challenge to a friend
 *
 * PRESENTATION TIMING
 * ─────────────────────────────────────────────────────────────────────────
 * UIKit silently drops present() calls if the presenting ViewController is
 * already in a transition (animations, touch handling, etc.).  React Native
 * Reanimated loops (shimmer) and the spring entrance of the vengeance button
 * keep the UI "busy" in the frame the user taps.
 *
 * The solution: every call that triggers a native UIViewController
 * presentation goes through `withNativeDelay`, which:
 *   1. InteractionManager.runAfterInteractions — waits for all pending RN
 *      gesture/touch interactions to settle.
 *   2. setTimeout(100ms) — gives UIKit a clean run-loop turn before calling
 *      present(), eliminating the "already presenting" silent failure.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';
import * as ExpoGameCenter from 'expo-game-center';
import type { FriendScore } from 'expo-game-center';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

const FETCH_THROTTLE_MS = 60_000;

export interface UseGameCenterReturn {
  isAuthenticated: boolean;
  playerId: string | null;
  alias: string | null;
  isLoading: boolean;
  isLoadingFriends: boolean;
  isAvailable: boolean;
  friendsScores: FriendScore[];
  /** Friend with score immediately above userScore (next rival to beat) */
  nextRival: (userScore: number) => FriendScore | null;
  /** Send score challenge to friend — opens native challenge compose UI */
  sendVengeanceChallenge: (
    friendId: string,
    score: number,
    leaderboardId: string,
    message?: string
  ) => Promise<void>;
  /** Open Apple's native friend picker and issue a challenge — no pre-selected friend */
  issueChallenge: (score: number, leaderboardId: string) => Promise<void>;
  authenticate: () => Promise<boolean>;
  submitScore: (score: number, leaderboardId: string) => void;
  fetchFriendsScores: (leaderboardId: string) => void;
  presentDashboard: (leaderboardId?: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Delay a native UIViewController presentation until:
 *   - All pending RN interactions (touches, animations) have settled, AND
 *   - A 100ms buffer has elapsed so UIKit is in a clean state.
 *
 * This prevents UIKit's silent "already presenting" failure that occurs when
 * present() is called while a Reanimated loop or spring animation is still
 * running on the same frame as the tap.
 */
function withNativeDelay<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        fn().then(resolve).catch(reject);
      }, 100);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useGameCenter(): UseGameCenterReturn {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [alias, setAlias] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [friendsScores, setFriendsScores] = useState<FriendScore[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const lastFetchTimeRef = useRef<number>(0);
  const lastLeaderboardIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setIsLoading(false);
      return;
    }

    Promise.resolve(ExpoGameCenter.authenticate())
      .then((player) => {
        if (player) {
          setPlayerId(player.playerId);
          setAlias(player.alias);
        }
      })
      .catch((err) => {
        if (__DEV__) console.error('[GameCenter] authenticate error:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Re-fetch friends scores when the app returns from background (throttled).
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && playerId && lastLeaderboardIdRef.current) {
        fetchFriendsScores(lastLeaderboardIdRef.current);
      }
    });
    return () => sub.remove();
  }, [playerId, fetchFriendsScores]);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'ios') return false;
    try {
      const player = await ExpoGameCenter.authenticate();
      if (player) {
        setPlayerId(player.playerId);
        setAlias(player.alias);
        return true;
      }
      return false;
    } catch (err) {
      if (__DEV__) console.error('[GameCenter] authenticate (manual) error:', err);
      return false;
    }
  }, []);

  const submitScore = useCallback((score: number, leaderboardId: string) => {
    if (Platform.OS !== 'ios') return;
    // submitScore in ExpoGameCenter.ts returns void (fire-and-forget internally).
    // Promise.resolve wraps void safely so .catch() never throws.
    Promise.resolve(ExpoGameCenter.submitScore(score, leaderboardId)).catch((err) => {
      if (__DEV__) console.error('[GameCenter] submitScore error:', err);
    });
  }, []);

  const fetchFriendsScores = useCallback((leaderboardId: string) => {
    lastLeaderboardIdRef.current = leaderboardId;

    if (Date.now() - lastFetchTimeRef.current < FETCH_THROTTLE_MS) return;

    setIsLoadingFriends(true);
    InteractionManager.runAfterInteractions(() => {
      Promise.resolve(ExpoGameCenter.fetchFriendsScores(leaderboardId))
        .then((scores) => {
          setFriendsScores(scores);
          lastFetchTimeRef.current = Date.now();
        })
        .catch((err) => {
          if (__DEV__) console.error('[GameCenter] fetchFriendsScores error:', err);
          setFriendsScores([]);
        })
        .finally(() => {
          setIsLoadingFriends(false);
        });
    });
  }, []);

  /**
   * Present the native Game Center leaderboard dashboard.
   * Uses withNativeDelay so UIKit is idle before present() is called.
   */
  const presentDashboard = useCallback(async (leaderboardId?: string): Promise<void> => {
    if (Platform.OS !== 'ios') return;
    return withNativeDelay(async () => {
      try {
        await ExpoGameCenter.presentDashboard(leaderboardId);
      } catch (err) {
        if (__DEV__) console.error('[GameCenter] presentDashboard error:', err);
      }
    });
  }, []);

  /**
   * Send a vengeance challenge to a specific friend.
   * Uses withNativeDelay: UIKit drops present() if RN animations are in flight.
   */
  const sendVengeanceChallenge = useCallback(
    async (
      friendId: string,
      score: number,
      leaderboardId: string,
      message?: string
    ): Promise<void> => {
      if (Platform.OS !== 'ios') return;
      return withNativeDelay(async () => {
        try {
          await ExpoGameCenter.sendVengeanceChallenge(
            friendId,
            score,
            leaderboardId,
            message
          );
        } catch (err) {
          // Reject for user-cancelled is expected — only log unexpected errors.
          if (__DEV__) console.error('[GameCenter] sendVengeanceChallenge error:', err);
        }
      });
    },
    []
  );

  /**
   * Open Apple's native friend picker (GKScore.challengeComposeController).
   * Uses withNativeDelay: same timing requirement as sendVengeanceChallenge.
   *
   * NOTE: isAvailable is checked at the call-site in game.tsx.
   * The redundant guard here is removed to avoid masking rejections from the
   * native layer that we want to log for debugging.
   */
  const issueChallenge = useCallback(
    async (score: number, leaderboardId: string): Promise<void> => {
      if (Platform.OS !== 'ios') return;
      return withNativeDelay(async () => {
        try {
          await ExpoGameCenter.challengeComposer(score, leaderboardId);
        } catch (err) {
          if (__DEV__) console.error('[GameCenter] challengeComposer error:', err);
        }
      });
    },
    []
  );

  /** Rival = friend with the smallest score greater than userScore (immediately above) */
  const nextRival = useCallback(
    (userScore: number): FriendScore | null => {
      const above = friendsScores.filter((f) => f.score > userScore);
      if (above.length === 0) return null;
      return above.sort((a, b) => a.score - b.score)[0];
    },
    [friendsScores]
  );

  return {
    isAuthenticated: !!playerId,
    playerId,
    alias,
    isLoading,
    isLoadingFriends,
    isAvailable: ExpoGameCenter.isAvailable?.() ?? false,
    friendsScores,
    nextRival,
    sendVengeanceChallenge,
    issueChallenge,
    authenticate,
    submitScore,
    fetchFriendsScores,
    presentDashboard,
  };
}
