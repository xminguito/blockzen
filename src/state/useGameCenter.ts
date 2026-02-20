/**
 * useGameCenter — Game Center state and actions
 *
 * - Authenticates silently on mount (iOS only)
 * - submitScore: fire-and-forget, never blocks UI
 * - fetchFriendsScores: on-demand, run after interactions
 * - presentDashboard: opens native GKGameCenterViewController
 * - nextRival: friend with score immediately above user (for "ofensa competitiva")
 * - sendVengeanceChallenge: sends score challenge to a friend
 */

import { useCallback, useEffect, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';
import * as ExpoGameCenter from 'expo-game-center';
import type { FriendScore } from 'expo-game-center';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UseGameCenterReturn {
  isAuthenticated: boolean;
  playerId: string | null;
  alias: string | null;
  isLoading: boolean;
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
  authenticate: () => Promise<boolean>;
  submitScore: (score: number, leaderboardId: string) => void;
  fetchFriendsScores: (leaderboardId: string) => void;
  presentDashboard: (leaderboardId?: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useGameCenter(): UseGameCenterReturn {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [alias, setAlias] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [friendsScores, setFriendsScores] = useState<FriendScore[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setIsLoading(false);
      return;
    }

    ExpoGameCenter.authenticate()
      .then((player) => {
        if (player) {
          setPlayerId(player.playerId);
          setAlias(player.alias);
        }
      })
      .catch(() => {
        // Silent — user may have cancelled or GC unavailable
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

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
    } catch {
      return false;
    }
  }, []);

  const submitScore = useCallback((score: number, leaderboardId: string) => {
    if (Platform.OS !== 'ios') return;
    ExpoGameCenter.submitScore(score, leaderboardId).catch(() => {
      // Silent — Game Center may be unavailable or user not signed in
    });
  }, []);

  const fetchFriendsScores = useCallback((leaderboardId: string) => {
    InteractionManager.runAfterInteractions(() => {
      ExpoGameCenter.fetchFriendsScores(leaderboardId)
        .then(setFriendsScores)
        .catch(() => setFriendsScores([]));
    });
  }, []);

  const presentDashboard = useCallback(async (leaderboardId?: string) => {
    if (Platform.OS !== 'ios') return;
    try {
      await ExpoGameCenter.presentDashboard(leaderboardId);
    } catch {
      // Silent — best-effort; do not disrupt the game with a system alert
    }
  }, []);

  const sendVengeanceChallenge = useCallback(
    async (
      friendId: string,
      score: number,
      leaderboardId: string,
      message?: string
    ) => {
      if (Platform.OS !== 'ios') return;
      try {
        await ExpoGameCenter.sendVengeanceChallenge(
          friendId,
          score,
          leaderboardId,
          message
        );
      } catch {
        // Silent — challenge is a bonus feature; never crash the game over screen
      }
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
    isAvailable: ExpoGameCenter.isAvailable?.() ?? false,
    friendsScores,
    nextRival,
    sendVengeanceChallenge,
    authenticate,
    submitScore,
    fetchFriendsScores,
    presentDashboard,
  };
}
