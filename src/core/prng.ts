/**
 * BlockZen PRNG — Pseudo-Random Number Generator
 *
 * Uses Mulberry32 algorithm for deterministic, seedable random generation.
 * This powers the Daily Challenge mode: same seed = same block sequence.
 *
 * Properties:
 * - Period: 2^32 (good enough for a puzzle game)
 * - Fast: single 32-bit multiply + shifts per call
 * - Deterministic: same seed always produces same sequence
 */

// ═══════════════════════════════════════════════════════════════════════════
// MULBERRY32 PRNG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a Mulberry32 PRNG instance seeded with the given value.
 * Returns a function that produces numbers in [0, 1) on each call.
 *
 * @param seed - Any 32-bit integer (will be converted via | 0)
 */
export function createPRNG(seed: number): () => number {
  let state = seed | 0;

  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY SEED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a daily seed from the current date.
 * Format: YYYYMMDD as integer (e.g., 20260209).
 * All players get the same seed on the same day.
 */
export function getDailySeed(date?: Date): number {
  const d = date ?? new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * Get a display label for a daily seed.
 * Converts 20260209 → "2026-02-09"
 */
export function getDailySeedLabel(seed: number): string {
  const year = Math.floor(seed / 10000);
  const month = Math.floor((seed % 10000) / 100);
  const day = seed % 100;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

import { pickWeightedBlock, ALL_BLOCKS } from './blocks';
import type { BlockDef, TrayPiece } from './types';

/** Number of colors available for blocks (1-7) */
const COLOR_COUNT = 7;

/**
 * Generate a set of tray pieces using the given PRNG.
 * Each piece gets a random block shape (weighted) and a random color.
 *
 * @param rng   - PRNG function returning [0, 1)
 * @param count - Number of pieces to generate (default: 3)
 */
export function generateTrayPieces(
  rng: () => number,
  count: number = 3,
): TrayPiece[] {
  const pieces: TrayPiece[] = [];

  for (let i = 0; i < count; i++) {
    const block = pickWeightedBlock(rng());
    const colorId = Math.floor(rng() * COLOR_COUNT) + 1; // 1-7

    pieces.push({
      block,
      colorId,
      placed: false,
    });
  }

  return pieces;
}

/**
 * Generate initial rescue block positions for a new game.
 *
 * @param rng   - PRNG function
 * @param count - Number of rescue blocks to place (default: 3)
 * @returns Array of grid indices where rescue blocks should be placed
 */
export function generateRescuePositions(
  rng: () => number,
  count: number = 3,
): number[] {
  const positions = new Set<number>();

  // Place rescue blocks in the central area (rows 2-5, cols 2-5)
  // to avoid edges where they'd be too easy/hard
  const minRow = 2;
  const maxRow = 5;
  const minCol = 2;
  const maxCol = 5;
  const range = (maxRow - minRow + 1) * (maxCol - minCol + 1);

  while (positions.size < count && positions.size < range) {
    const row = minRow + Math.floor(rng() * (maxRow - minRow + 1));
    const col = minCol + Math.floor(rng() * (maxCol - minCol + 1));
    positions.add((row << 3) | col);
  }

  return Array.from(positions);
}
