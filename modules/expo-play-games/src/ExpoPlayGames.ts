/**
 * Expo Play Games — Google Play Games Services integration
 *
 * Android only. Fails gracefully on iOS/web (module not available).
 */

import { requireNativeModule, Platform } from 'expo-modules-core';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PlayGamesPlayer {
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

// ═══════════════════════════════════════════════════════════════════════════
// NATIVE MODULE — lazy load (only on Android)
// ═══════════════════════════════════════════════════════════════════════════

let NativeModule: {
  authenticate: () => Promise<PlayGamesPlayer | null>;
  submitScore: (score: number, leaderboardId: string) => Promise<void>;
  fetchFriendsScores: (leaderboardId: string) => Promise<FriendScore[]>;
  presentDashboard: (leaderboardId?: string | null) => Promise<void>;
  isAvailable: () => boolean;
} | null = null;

function getModule() {
  if (Platform.OS !== 'android') return null;
  if (!NativeModule) {
    try {
      NativeModule = requireNativeModule('ExpoPlayGames');
    } catch {
      return null;
    }
  }
  return NativeModule;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export async function authenticate(): Promise<PlayGamesPlayer | null> {
  const mod = getModule();
  if (!mod) return null;
  return mod.authenticate();
}

export function submitScore(score: number, leaderboardId: string): void {
  const mod = getModule();
  if (!mod) return;
  mod.submitScore(score, leaderboardId).catch(() => {});
}

export async function fetchFriendsScores(
  leaderboardId: string,
): Promise<FriendScore[]> {
  const mod = getModule();
  if (!mod) return [];
  return mod.fetchFriendsScores(leaderboardId);
}

export async function presentDashboard(
  leaderboardId?: string,
): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  return mod.presentDashboard(leaderboardId ?? null);
}

export function isAvailable(): boolean {
  if (Platform.OS !== 'android') return false;
  const mod = getModule();
  return mod?.isAvailable() ?? false;
}
