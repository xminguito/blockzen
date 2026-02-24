/**
 * SocialProvider — Platform-agnostic contract for social gaming services.
 *
 * Implementations:
 *   - GameCenterProvider  (iOS — Apple Game Center / GameKit)
 *   - NoopProvider        (Android / Web — safe no-op fallback)
 *
 * Future:
 *   - PlayGamesProvider   (Android — Google Play Games Services)
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SocialPlayer {
  playerId: string;
  alias: string;
}

export interface SocialFriendScore {
  rank: number;
  score: number;
  playerId: string;
  alias: string;
  formattedScore: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

export interface SocialProvider {
  /** Whether the underlying social service is linked and usable on this device. */
  isAvailable(): boolean;

  /** Authenticate (silently if possible). Returns player info or null. */
  authenticate(): Promise<SocialPlayer | null>;

  /** Fire-and-forget score submission. Never blocks UI. */
  submitScore(score: number, leaderboardId: string): void;

  /** Fetch friends' leaderboard scores. Returns [] when unavailable. */
  fetchFriendsScores(leaderboardId: string): Promise<SocialFriendScore[]>;

  /** Open the platform's native leaderboard dashboard. */
  presentDashboard(leaderboardId?: string): Promise<void>;

  /** Send a score challenge to a specific friend. */
  sendChallenge(
    friendId: string,
    score: number,
    leaderboardId: string,
    message?: string,
  ): Promise<void>;

  /** Open the platform's native friend picker and issue a challenge. */
  issueChallenge(score: number, leaderboardId: string): Promise<void>;
}
