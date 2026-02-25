/**
 * useSocialBridge — Platform-agnostic hook for social gaming features.
 *
 * Drop-in replacement for useGameCenter. Delegates platform-specific calls
 * to the SocialProvider returned by getSocialProvider() and manages all
 * React state (auth, friends, throttling, AppState refresh) in one place.
 *
 * Consumers (game.tsx, daily.tsx, index.tsx) never need to know which
 * social service is active — the bridge handles everything.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';

import { getSocialProvider } from './createSocialProvider';
import type { SocialFriendScore } from './SocialProvider';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

const FETCH_THROTTLE_MS = 60_000;

/** Key for i18n: home.social.service_${serviceNameKey} → localized service name */
export type SocialServiceNameKey = 'game_center' | 'play_games' | 'social';

export interface UseSocialBridgeReturn {
  /** Platform-specific key for service name i18n (e.g. t(`home.social.service_${serviceNameKey}`)) */
  serviceNameKey: SocialServiceNameKey;
  isAuthenticated: boolean;
  playerId: string | null;
  alias: string | null;
  isLoading: boolean;
  isLoadingFriends: boolean;
  isAvailable: boolean;
  friendsScores: SocialFriendScore[];
  /** Friend with score immediately above userScore (next rival to beat) */
  nextRival: (userScore: number) => SocialFriendScore | null;
  /** Send score challenge to a specific friend */
  sendVengeanceChallenge: (
    friendId: string,
    score: number,
    leaderboardId: string,
    message?: string,
  ) => Promise<void>;
  /** Open native friend picker and issue a challenge */
  issueChallenge: (score: number, leaderboardId: string) => Promise<void>;
  authenticate: () => Promise<boolean>;
  submitScore: (score: number, leaderboardId: string) => void;
  fetchFriendsScores: (leaderboardId: string) => void;
  presentDashboard: (leaderboardId?: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useSocialBridge(): UseSocialBridgeReturn {
  const provider = getSocialProvider();

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [alias, setAlias] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [friendsScores, setFriendsScores] = useState<SocialFriendScore[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const lastFetchTimeRef = useRef<number>(0);
  const lastLeaderboardIdRef = useRef<string | null>(null);

  // ── Auto-authenticate on mount ──
  useEffect(() => {
    if (!provider.isAvailable()) {
      setIsLoading(false);
      return;
    }

    provider
      .authenticate()
      .then((player) => {
        if (player) {
          setPlayerId(player.playerId);
          setAlias(player.alias);
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!provider.isAvailable()) return false;
    const player = await provider.authenticate();
    if (player) {
      setPlayerId(player.playerId);
      setAlias(player.alias);
      return true;
    }
    return false;
  }, [provider]);

  const submitScore = useCallback(
    (score: number, leaderboardId: string) => {
      provider.submitScore(score, leaderboardId);
    },
    [provider],
  );

  const fetchFriendsScores = useCallback(
    (leaderboardId: string) => {
      lastLeaderboardIdRef.current = leaderboardId;

      if (Date.now() - lastFetchTimeRef.current < FETCH_THROTTLE_MS) return;

      setIsLoadingFriends(true);
      InteractionManager.runAfterInteractions(() => {
        provider
          .fetchFriendsScores(leaderboardId)
          .then((scores) => {
            setFriendsScores(scores);
            lastFetchTimeRef.current = Date.now();
          })
          .catch(() => {
            setFriendsScores([]);
          })
          .finally(() => {
            setIsLoadingFriends(false);
          });
      });
    },
    [provider],
  );

  // Re-fetch friends scores when the app returns from background (throttled).
  useEffect(() => {
    if (!provider.isAvailable()) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && playerId && lastLeaderboardIdRef.current) {
        fetchFriendsScores(lastLeaderboardIdRef.current);
      }
    });
    return () => sub.remove();
  }, [playerId, fetchFriendsScores, provider]);

  const presentDashboard = useCallback(
    async (leaderboardId?: string): Promise<void> => {
      return provider.presentDashboard(leaderboardId);
    },
    [provider],
  );

  const sendVengeanceChallenge = useCallback(
    async (
      friendId: string,
      score: number,
      leaderboardId: string,
      message?: string,
    ): Promise<void> => {
      return provider.sendChallenge(friendId, score, leaderboardId, message);
    },
    [provider],
  );

  const issueChallenge = useCallback(
    async (score: number, leaderboardId: string): Promise<void> => {
      return provider.issueChallenge(score, leaderboardId);
    },
    [provider],
  );

  /** Rival = friend with the smallest score greater than userScore */
  const nextRival = useCallback(
    (userScore: number): SocialFriendScore | null => {
      const above = friendsScores.filter((f) => f.score > userScore);
      if (above.length === 0) return null;
      return above.sort((a, b) => a.score - b.score)[0];
    },
    [friendsScores],
  );

  const serviceNameKey: SocialServiceNameKey =
    Platform.OS === 'ios' ? 'game_center' : Platform.OS === 'android' ? 'play_games' : 'social';

  return {
    serviceNameKey,
    isAuthenticated: !!playerId,
    playerId,
    alias,
    isLoading,
    isLoadingFriends,
    isAvailable: provider.isAvailable(),
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
