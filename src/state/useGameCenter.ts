/**
 * useGameCenter — Game Center state and actions
 *
 * - Authenticates silently on mount (iOS only)
 * - submitScore: fire-and-forget, never blocks UI
 * - fetchFriendsScores: on-demand, run after interactions
 * - presentDashboard: opens native GKGameCenterViewController
 */

import { useCallback, useEffect, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';
import * as ExpoGameCenter from 'expo-game-center';
import type { FriendScore, GameCenterPlayer } from 'expo-game-center';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UseGameCenterReturn {
  isAuthenticated: boolean;
  playerId: string | null;
  alias: string | null;
  isLoading: boolean;
  friendsScores: FriendScore[];
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

  const submitScore = useCallback((score: number, leaderboardId: string) => {
    ExpoGameCenter.submitScore(score, leaderboardId);
  }, []);

  const fetchFriendsScores = useCallback((leaderboardId: string) => {
    InteractionManager.runAfterInteractions(() => {
      ExpoGameCenter.fetchFriendsScores(leaderboardId)
        .then(setFriendsScores)
        .catch(() => setFriendsScores([]));
    });
  }, []);

  const presentDashboard = useCallback(async (leaderboardId?: string) => {
    return ExpoGameCenter.presentDashboard(leaderboardId);
  }, []);

  return {
    isAuthenticated: !!playerId,
    playerId,
    alias,
    isLoading,
    friendsScores,
    submitScore,
    fetchFriendsScores,
    presentDashboard,
  };
}
