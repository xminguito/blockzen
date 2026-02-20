/**
 * Game constants — leaderboard IDs, etc.
 *
 * CRITICAL — App Store Connect must match EXACTLY:
 *   App Store Connect > Your App > Game Center > Leaderboards
 *   The leaderboard "ID" field must be identical to the strings below,
 *   including case. A single character mismatch causes GKScore.challengeComposeController
 *   to return nil, silently blocking the native challenge UI from opening.
 *
 * Current registered IDs (verify in App Store Connect before each release):
 *   Classic leaderboard: "blockzen_classic"
 *   Daily leaderboard:   "blockzen_daily"
 */
export const LEADERBOARD_IDS = {
  classic: 'blockzen_classic',
  daily: 'blockzen_daily',
} as const;
