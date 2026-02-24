/**
 * GameCenterProvider — iOS implementation of SocialProvider via expo-game-center.
 *
 * Presentation methods (presentDashboard, sendChallenge, issueChallenge) are
 * wrapped with `withNativeDelay` so UIKit has a clean run-loop turn before
 * present() is called. This prevents UIKit's silent "already presenting"
 * failure when Reanimated animations are still in flight.
 */

import { InteractionManager } from 'react-native';
import * as ExpoGameCenter from 'expo-game-center';
import type { SocialProvider, SocialPlayer, SocialFriendScore } from '../SocialProvider';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wait for pending RN interactions + 100ms buffer so UIKit is idle
 * before calling present() on a native ViewController.
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
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

export class GameCenterProvider implements SocialProvider {
  isAvailable(): boolean {
    return ExpoGameCenter.isAvailable?.() ?? false;
  }

  async authenticate(): Promise<SocialPlayer | null> {
    try {
      const player = await ExpoGameCenter.authenticate();
      return player ?? null;
    } catch (err) {
      if (__DEV__) console.error('[GameCenter] authenticate error:', err);
      return null;
    }
  }

  submitScore(score: number, leaderboardId: string): void {
    Promise.resolve(ExpoGameCenter.submitScore(score, leaderboardId)).catch((err) => {
      if (__DEV__) console.error('[GameCenter] submitScore error:', err);
    });
  }

  async fetchFriendsScores(leaderboardId: string): Promise<SocialFriendScore[]> {
    try {
      return await ExpoGameCenter.fetchFriendsScores(leaderboardId);
    } catch (err) {
      if (__DEV__) console.error('[GameCenter] fetchFriendsScores error:', err);
      return [];
    }
  }

  async presentDashboard(leaderboardId?: string): Promise<void> {
    return withNativeDelay(async () => {
      try {
        await ExpoGameCenter.presentDashboard(leaderboardId);
      } catch (err) {
        if (__DEV__) console.error('[GameCenter] presentDashboard error:', err);
      }
    });
  }

  async sendChallenge(
    friendId: string,
    score: number,
    leaderboardId: string,
    message?: string,
  ): Promise<void> {
    return withNativeDelay(async () => {
      try {
        await ExpoGameCenter.sendVengeanceChallenge(friendId, score, leaderboardId, message);
      } catch (err) {
        if (__DEV__) console.error('[GameCenter] sendChallenge error:', err);
      }
    });
  }

  async issueChallenge(score: number, leaderboardId: string): Promise<void> {
    return withNativeDelay(async () => {
      try {
        await ExpoGameCenter.challengeComposer(score, leaderboardId);
      } catch (err) {
        if (__DEV__) console.error('[GameCenter] issueChallenge error:', err);
      }
    });
  }
}
