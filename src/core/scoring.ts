/**
 * BlockZen Scoring System
 *
 * Pure functions for score calculation with combo multipliers.
 * No React dependencies.
 */

import type { ScoreEvent } from './types';

// ── Constants ───────────────────────────────────────────────────────────────

const POINTS_PER_CELL = 10;
const POINTS_PER_LINE = 100;

/**
 * Bonus for clearing multiple lines simultaneously.
 * Index = number of lines cleared at once.
 */
const MULTI_LINE_BONUS: readonly number[] = [
  0, //  0 lines (shouldn't happen)
  0, //  1 line  (no bonus)
  100, //  2 lines
  300, //  3 lines
  600, //  4 lines
  1000, //  5 lines
  1500, //  6 lines
  2100, //  7+ lines (theoretical max)
  2800, //  8 lines
];

/** Bonus for each rescue block cleared */
const RESCUE_CLEAR_BONUS = 500;

/** Bonus for clearing ALL rescue blocks on the board */
const ALL_RESCUE_BONUS = 2000;

// ── Score Calculation ───────────────────────────────────────────────────────

/**
 * Calculate score for a single turn.
 *
 * @param cellsPlaced   - Number of cells the block occupies
 * @param linesCleared  - Number of rows + columns cleared this turn
 * @param currentCombo  - Combo counter BEFORE this turn
 * @param rescueCleared - Number of rescue blocks fully cleared this turn
 * @param allRescueDone - Whether all rescue blocks on the board are now cleared
 */
export function calculateScore(
  cellsPlaced: number,
  linesCleared: number,
  currentCombo: number,
  rescueCleared: number = 0,
  allRescueDone: boolean = false,
): ScoreEvent {
  // Points for placing cells
  const cellPoints = cellsPlaced * POINTS_PER_CELL;

  // Points for clearing lines (with multi-line bonus)
  const lineBase = linesCleared * POINTS_PER_LINE;
  const multiBonus =
    MULTI_LINE_BONUS[Math.min(linesCleared, MULTI_LINE_BONUS.length - 1)];

  // Combo multiplier: grows each consecutive turn with clears
  const comboMultiplier = linesCleared > 0 ? currentCombo + 1 : 0;
  const linePoints =
    (lineBase + multiBonus) * Math.max(comboMultiplier, 1);

  // Rescue bonus
  const rescueBonus =
    rescueCleared * RESCUE_CLEAR_BONUS + (allRescueDone ? ALL_RESCUE_BONUS : 0);

  return {
    cellPoints,
    linePoints,
    comboMultiplier,
    rescueBonus,
    total: cellPoints + linePoints + rescueBonus,
  };
}

// ── Combo Management ────────────────────────────────────────────────────────

/**
 * Get the next combo value.
 * Combo increments when lines are cleared, resets to 0 when no lines cleared.
 */
export function getNextCombo(
  linesCleared: number,
  currentCombo: number,
): number {
  return linesCleared > 0 ? currentCombo + 1 : 0;
}

/**
 * Get a human-readable combo label for UI display (Block Blast style).
 */
export function getComboLabel(combo: number): string | null {
  if (combo < 2) return null;
  if (combo === 2) return 'Good!';
  if (combo === 3) return 'Great!';
  if (combo === 4) return 'Excellent!';
  if (combo === 5) return 'Amazing!';
  if (combo === 6) return 'Incredible!';
  if (combo <= 9) return 'Unbelievable!';
  return 'GODLIKE!';
}
