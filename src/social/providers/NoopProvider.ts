/**
 * NoopProvider — Safe fallback for platforms without a social gaming service.
 *
 * Every method returns a safe default (false, null, []). No native calls,
 * no crashes. Used on Android (until PlayGamesProvider ships) and web.
 */

import type { SocialProvider, SocialPlayer, SocialFriendScore } from '../SocialProvider';

export class NoopProvider implements SocialProvider {
  isAvailable(): boolean {
    return false;
  }

  async authenticate(): Promise<SocialPlayer | null> {
    return null;
  }

  submitScore(_score: number, _leaderboardId: string): void {}

  async fetchFriendsScores(_leaderboardId: string): Promise<SocialFriendScore[]> {
    return [];
  }

  async presentDashboard(_leaderboardId?: string): Promise<void> {}

  async sendChallenge(
    _friendId: string,
    _score: number,
    _leaderboardId: string,
    _message?: string,
  ): Promise<void> {}

  async issueChallenge(_score: number, _leaderboardId: string): Promise<void> {}
}
