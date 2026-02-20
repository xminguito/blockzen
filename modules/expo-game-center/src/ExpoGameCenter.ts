/**
 * Expo Game Center — Apple Game Center integration
 *
 * iOS only. Fails gracefully on Android (module not available).
 */

import { requireNativeModule, Platform } from 'expo-modules-core';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GameCenterPlayer {
  playerId: string;
  alias: string;
}

export interface FriendScore {
  rank: number;
  score: number;
  playerId: string;
  alias: string;
  formattedScore: string;
}

export type GameCenterErrorCode =
  | 'E_GAMECENTER_UNAVAILABLE'
  | 'E_GAMECENTER_USER_CANCELLED';

// ═══════════════════════════════════════════════════════════════════════════
// NATIVE MODULE — lazy load (only on iOS)
// ═══════════════════════════════════════════════════════════════════════════

let NativeModule: {
  authenticate: () => Promise<GameCenterPlayer>;
  submitScore: (score: number, leaderboardId: string) => Promise<void>;
  fetchFriendsScores: (leaderboardId: string) => Promise<FriendScore[]>;
  presentDashboard: (leaderboardId?: string) => Promise<void>;
  sendVengeanceChallenge: (
    friendId: string,
    score: number,
    leaderboardId: string,
    message?: string | null
  ) => Promise<void>;
  challengeComposer: (score: number, leaderboardId: string) => Promise<void>;
} | null = null;

function getModule() {
  if (Platform.OS !== 'ios') return null;
  if (!NativeModule) {
    try {
      NativeModule = requireNativeModule('ExpoGameCenter');
    } catch {
      return null;
    }
  }
  return NativeModule;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Authenticate with Game Center silently on app start.
 * Returns player id and alias, or rejects with E_GAMECENTER_USER_CANCELLED if user cancels.
 */
export async function authenticate(): Promise<GameCenterPlayer | null> {
  const mod = getModule();
  if (!mod) return null;
  return mod.authenticate();
}

/**
 * Submit score to a leaderboard. Fire-and-forget — do not await in hot paths.
 * Safe to call from game over; runs in background.
 */
export function submitScore(score: number, leaderboardId: string): void {
  const mod = getModule();
  if (!mod) return;
  mod.submitScore(score, leaderboardId).catch(() => {});
}

/**
 * Fetch friends' scores for a leaderboard. Use InteractionManager.runAfterInteractions
 * before calling if invoked from a screen transition.
 */
export async function fetchFriendsScores(
  leaderboardId: string
): Promise<FriendScore[]> {
  const mod = getModule();
  if (!mod) return [];
  return mod.fetchFriendsScores(leaderboardId);
}

/**
 * Present the native Game Center dashboard (GKGameCenterViewController).
 * Optionally scope to a specific leaderboard.
 */
export async function presentDashboard(leaderboardId?: string): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  return mod.presentDashboard(leaderboardId ?? undefined);
}

/**
 * Send a score challenge to a friend ("vengeance" / "ofensa competitiva").
 * Presents the native challenge compose UI.
 */
export async function sendVengeanceChallenge(
  friendId: string,
  score: number,
  leaderboardId: string,
  message?: string | null
): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  return mod.sendVengeanceChallenge(friendId, score, leaderboardId, message ?? undefined);
}

/**
 * Open Apple's native challenge compose UI with the friend picker.
 * No friend is pre-selected — the user picks from within Apple's UI.
 * Apple handles the push notification to the challenged friends automatically.
 */
export async function challengeComposer(
  score: number,
  leaderboardId: string
): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  return mod.challengeComposer(score, leaderboardId);
}

/**
 * Check if Game Center module is available (iOS with native code linked).
 */
export function isAvailable(): boolean {
  return Platform.OS === 'ios' && getModule() !== null;
}
