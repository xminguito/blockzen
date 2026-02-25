/**
 * PlayGamesProvider — Android implementation of SocialProvider via expo-play-games.
 *
 * Wraps Google Play Games Services v2. Challenge methods (sendChallenge,
 * issueChallenge) are no-ops because GPGS deprecated player-to-player
 * challenges. The UI hides challenge buttons automatically when these
 * resolve as no-ops (GameOverModal checks onSendChallenge != null).
 */

import * as ExpoPlayGames from 'expo-play-games';
import type { SocialProvider, SocialPlayer, SocialFriendScore } from '../SocialProvider';

export class PlayGamesProvider implements SocialProvider {
  isAvailable(): boolean {
    return ExpoPlayGames.isAvailable?.() ?? false;
  }

  async authenticate(): Promise<SocialPlayer | null> {
    try {
      const player = await ExpoPlayGames.authenticate();
      return player ?? null;
    } catch (err) {
      if (__DEV__) console.error('[PlayGames] authenticate error:', err);
      return null;
    }
  }

  submitScore(score: number, leaderboardId: string): void {
    Promise.resolve(ExpoPlayGames.submitScore(score, leaderboardId)).catch((err) => {
      if (__DEV__) console.error('[PlayGames] submitScore error:', err);
    });
  }

  async fetchFriendsScores(leaderboardId: string): Promise<SocialFriendScore[]> {
    try {
      return await ExpoPlayGames.fetchFriendsScores(leaderboardId);
    } catch (err) {
      if (__DEV__) console.error('[PlayGames] fetchFriendsScores error:', err);
      return [];
    }
  }

  async presentDashboard(leaderboardId?: string): Promise<void> {
    try {
      await ExpoPlayGames.presentDashboard(leaderboardId);
    } catch (err) {
      if (__DEV__) console.error('[PlayGames] presentDashboard error:', err);
    }
  }

  async sendChallenge(
    _friendId: string,
    _score: number,
    _leaderboardId: string,
    _message?: string,
  ): Promise<void> {
    // GPGS deprecated player-to-player challenges.
  }

  async issueChallenge(_score: number, _leaderboardId: string): Promise<void> {
    // GPGS deprecated player-to-player challenges.
  }
}
