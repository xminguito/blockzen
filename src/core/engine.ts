/**
 * BlockZen Game Engine
 *
 * High-performance, pure-function game engine.
 * - Grid: Uint8Array(64) — flat, cache-friendly, zero GC pressure
 * - Access: bitwise shifts (row << 3 | col) instead of multiplication
 * - Cell encoding: bits 0-2 color, bit 3 rescue, bit 4 rescue-hit
 * - All functions are PURE: input → output, no side effects, no React deps
 */

import {
  GRID_SIZE,
  GRID_LENGTH,
  COLOR_MASK,
  RESCUE_FLAG,
  RESCUE_HIT,
} from './types';
import type {
  BlockDef,
  CompletedLines,
  ClearResult,
  PlacementResult,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// GRID ACCESS — inlined by V8/Hermes JIT for near-zero overhead
// ═══════════════════════════════════════════════════════════════════════════

/** Convert (row, col) to flat index. Uses bit shift: row*8 = row<<3 */
export const idx = (row: number, col: number): number => (row << 3) | col;

/** Extract row from flat index */
export const rowOf = (index: number): number => index >> 3;

/** Extract column from flat index */
export const colOf = (index: number): number => index & 7;

/** Extract color ID (0-7) from cell value */
export const getColor = (cell: number): number => cell & COLOR_MASK;

/** Check if cell is empty (color bits are all zero) */
export const isEmpty = (cell: number): boolean => (cell & COLOR_MASK) === 0;

/** Check if cell has rescue flag set */
export const isRescue = (cell: number): boolean => (cell & RESCUE_FLAG) !== 0;

/** Check if rescue block has been hit once */
export const isRescueHit = (cell: number): boolean =>
  (cell & RESCUE_HIT) !== 0;

/** Encode a cell value: color + optional rescue flag */
export const encodeCell = (colorId: number, rescue = false): number =>
  (colorId & COLOR_MASK) | (rescue ? RESCUE_FLAG : 0);

// ═══════════════════════════════════════════════════════════════════════════
// GRID LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

/** Create a fresh empty grid */
export function createGrid(): Uint8Array {
  return new Uint8Array(GRID_LENGTH);
}

/** Immutable clone — used before mutations to preserve purity */
export function cloneGrid(grid: Uint8Array): Uint8Array {
  return new Uint8Array(grid);
}

// ═══════════════════════════════════════════════════════════════════════════
// PLACEMENT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a block can be placed at (row, col) on the grid.
 * Performs bounds check + collision check in a single pass.
 *
 * @returns true if every filled cell of the shape maps to an empty grid cell
 */
export function canPlace(
  grid: Uint8Array,
  block: BlockDef,
  row: number,
  col: number,
): boolean {
  // Bounds check (branchless-friendly: single comparison per axis)
  if (
    row < 0 ||
    col < 0 ||
    row + block.height > GRID_SIZE ||
    col + block.width > GRID_SIZE
  ) {
    return false;
  }

  const { shape, height, width } = block;

  for (let r = 0; r < height; r++) {
    const shapeRow = shape[r];
    const gridBase = (row + r) << 3;

    for (let c = 0; c < width; c++) {
      if (shapeRow[c] === 1 && !isEmpty(grid[gridBase | (col + c)])) {
        return false;
      }
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK PLACEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Place a block on the grid. Returns a NEW grid (immutable).
 *
 * PRECONDITION: canPlace() must return true before calling this.
 * No validation is performed here for performance.
 */
export function placeBlock(
  grid: Uint8Array,
  block: BlockDef,
  row: number,
  col: number,
  colorId: number,
): PlacementResult {
  const next = cloneGrid(grid);
  const filledIndices: number[] = [];

  const { shape, height, width } = block;
  const encodedColor = colorId & COLOR_MASK;

  for (let r = 0; r < height; r++) {
    const shapeRow = shape[r];
    const gridBase = (row + r) << 3;

    for (let c = 0; c < width; c++) {
      if (shapeRow[c] === 1) {
        const i = gridBase | (col + c);
        next[i] = encodedColor;
        filledIndices.push(i);
      }
    }
  }

  return { grid: next, filledIndices };
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan the grid for completed rows and columns.
 * Uses early-exit per line for efficiency.
 *
 * Scans 8 rows + 8 columns = 128 cell reads in worst case.
 */
export function findCompletedLines(grid: Uint8Array): CompletedLines {
  const rows: number[] = [];
  const cols: number[] = [];

  // ── Scan rows ──
  for (let r = 0; r < GRID_SIZE; r++) {
    const base = r << 3;
    let complete = true;

    for (let c = 0; c < GRID_SIZE; c++) {
      if (isEmpty(grid[base | c])) {
        complete = false;
        break; // early exit
      }
    }

    if (complete) rows.push(r);
  }

  // ── Scan columns ──
  for (let c = 0; c < GRID_SIZE; c++) {
    let complete = true;

    for (let r = 0; r < GRID_SIZE; r++) {
      if (isEmpty(grid[(r << 3) | c])) {
        complete = false;
        break; // early exit
      }
    }

    if (complete) cols.push(c);
  }

  return { rows, cols };
}

/**
 * Quick check: are there any completed lines?
 * Cheaper than findCompletedLines when you only need a boolean.
 */
export function hasCompletedLines(grid: Uint8Array): boolean {
  // Check rows
  for (let r = 0; r < GRID_SIZE; r++) {
    const base = r << 3;
    let complete = true;
    for (let c = 0; c < GRID_SIZE; c++) {
      if (isEmpty(grid[base | c])) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }

  // Check columns
  for (let c = 0; c < GRID_SIZE; c++) {
    let complete = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (isEmpty(grid[(r << 3) | c])) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE CLEARING + RESCUE LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clear completed lines from the grid, respecting rescue block rules:
 *
 * - Normal cells: cleared (set to 0)
 * - Rescue blocks (first hit): RESCUE_HIT flag set, NOT cleared
 * - Rescue blocks (already hit): fully cleared
 *
 * Returns a new grid + metadata about what was cleared.
 */
export function clearLines(
  grid: Uint8Array,
  lines: CompletedLines,
): ClearResult {
  const next = cloneGrid(grid);

  // Collect all unique indices to process (rows + cols may overlap)
  const toProcess = new Uint8Array(GRID_LENGTH); // 0=skip, 1=process
  const clearedIndices: number[] = [];
  const rescueHits: number[] = [];
  const rescueCleared: number[] = [];

  // Mark row cells
  for (let i = 0; i < lines.rows.length; i++) {
    const base = lines.rows[i] << 3;
    for (let c = 0; c < GRID_SIZE; c++) {
      toProcess[base | c] = 1;
    }
  }

  // Mark column cells
  for (let i = 0; i < lines.cols.length; i++) {
    const col = lines.cols[i];
    for (let r = 0; r < GRID_SIZE; r++) {
      toProcess[(r << 3) | col] = 1;
    }
  }

  // Process marked cells
  for (let i = 0; i < GRID_LENGTH; i++) {
    if (toProcess[i] === 0) continue;

    const cell = next[i];
    if (isEmpty(cell)) continue; // already empty, skip

    if (isRescue(cell) && !isRescueHit(cell)) {
      // First hit on rescue block — mark as hit, don't clear
      next[i] = cell | RESCUE_HIT;
      rescueHits.push(i);
    } else if (isRescue(cell) && isRescueHit(cell)) {
      // Second hit on rescue block — fully clear
      next[i] = 0;
      rescueCleared.push(i);
      clearedIndices.push(i);
    } else {
      // Normal block — clear
      next[i] = 0;
      clearedIndices.push(i);
    }
  }

  return {
    grid: next,
    clearedIndices,
    rescueHits,
    rescueCleared,
    totalCellsCleared: clearedIndices.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESCUE BLOCK: NEIGHBOR CLEAR CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a rescue block at the given index has all 4 orthogonal
 * neighbors empty. If so, it should be cleared (alternative clear path).
 *
 * Neighbors that are out of bounds count as "empty" for this check.
 */
export function isRescueNeighborsCleared(
  grid: Uint8Array,
  index: number,
): boolean {
  const row = rowOf(index);
  const col = colOf(index);

  // Up
  if (row > 0 && !isEmpty(grid[idx(row - 1, col)])) return false;
  // Down
  if (row < GRID_SIZE - 1 && !isEmpty(grid[idx(row + 1, col)])) return false;
  // Left
  if (col > 0 && !isEmpty(grid[idx(row, col - 1)])) return false;
  // Right
  if (col < GRID_SIZE - 1 && !isEmpty(grid[idx(row, col + 1)])) return false;

  return true;
}

/**
 * Scan grid for rescue blocks that can be cleared via neighbor rule.
 * Returns a new grid with those rescue blocks removed.
 */
export function clearRescueByNeighbors(grid: Uint8Array): {
  grid: Uint8Array;
  cleared: number[];
} {
  const next = cloneGrid(grid);
  const cleared: number[] = [];

  for (let i = 0; i < GRID_LENGTH; i++) {
    const cell = next[i];
    if (isRescue(cell) && isRescueNeighborsCleared(next, i)) {
      next[i] = 0;
      cleared.push(i);
    }
  }

  return { grid: next, cleared };
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME OVER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a single block shape can fit ANYWHERE on the grid.
 * Uses early-exit: returns true as soon as first valid position found.
 *
 * Worst case: (8 - blockHeight + 1) * (8 - blockWidth + 1) * cellCount checks
 * For a 1x1 block: 64 checks. For a 5x1 block: 4*8=32 checks.
 */
export function canFitAnywhere(
  grid: Uint8Array,
  block: BlockDef,
): boolean {
  const maxRow = GRID_SIZE - block.height;
  const maxCol = GRID_SIZE - block.width;

  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      if (canPlace(grid, block, r, c)) return true;
    }
  }

  return false;
}

/**
 * Check if the game is over: none of the available blocks can fit on the grid.
 *
 * Iterates through available (non-placed) blocks and checks each.
 * Short-circuits on first block that CAN fit (game NOT over).
 */
export function isGameOver(
  grid: Uint8Array,
  availableBlocks: ReadonlyArray<{ block: BlockDef; placed: boolean }>,
): boolean {
  for (let i = 0; i < availableBlocks.length; i++) {
    if (availableBlocks[i].placed) continue;
    if (canFitAnywhere(grid, availableBlocks[i].block)) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL TURN PIPELINE — Chain-Reaction-Aware
//
// Resolves ALL cascading effects synchronously in a single call.
// Produces a TurnPhase[] event queue for the animation layer.
//
// Chain reaction scenario:
//   place block → line clear → rescue block absorbs hit →
//   clearing frees rescue neighbor → rescue removed →
//   removal completes another line → CHAIN CLEAR →
//   ... repeat until stable
//
// The loop is bounded by MAX_CHAIN_DEPTH (safety cap).
// In practice, chains rarely exceed depth 2-3.
// ═══════════════════════════════════════════════════════════════════════════

import type { TurnPhase, TurnResult } from './types';

const MAX_CHAIN_DEPTH = 10;

/**
 * Execute a full turn with chain reaction resolution.
 *
 * This is the ONLY function the state layer calls per turn.
 * It composes all pure engine functions into a deterministic pipeline
 * that returns both the final grid state and the ordered animation phases.
 *
 * @param grid            - Current grid state (will NOT be mutated)
 * @param block           - Block definition being placed
 * @param row             - Target row on the grid
 * @param col             - Target column on the grid
 * @param colorId         - Color to assign to placed cells (1-7)
 * @param remainingBlocks - Tray blocks not yet placed (for game-over check)
 */
export function executeTurn(
  grid: Uint8Array,
  block: BlockDef,
  row: number,
  col: number,
  colorId: number,
  remainingBlocks: ReadonlyArray<{ block: BlockDef; placed: boolean }>,
): TurnResult {
  const phases: TurnPhase[] = [];
  let totalLinesCleared = 0;
  let totalRescueCleared = 0;

  // ── Phase 1: Place block ────────────────────────────────────────────────
  const placement = placeBlock(grid, block, row, col, colorId);
  let currentGrid = placement.grid;

  phases.push({
    type: 'place',
    indices: placement.filledIndices,
    colorId,
  });

  // ── Phase 2+: Chain resolution loop ─────────────────────────────────────
  //
  // Each iteration:
  //   1. Find completed lines → clear (respecting rescue 2-hit rule)
  //   2. Check rescue blocks freed by neighbor isolation
  //   3. If anything changed, loop back (clearing may have opened new lines)
  //   4. If nothing changed, exit
  //
  let chainDepth = 0;
  let changed = true;

  while (changed && chainDepth < MAX_CHAIN_DEPTH) {
    changed = false;

    // ── Step A: Find and clear completed lines ──────────────────────────
    const lines = findCompletedLines(currentGrid);
    const lineCount = lines.rows.length + lines.cols.length;

    if (lineCount > 0) {
      const clearResult = clearLines(currentGrid, lines);
      currentGrid = clearResult.grid;
      totalLinesCleared += lineCount;

      // Emit lineClear phase
      phases.push({
        type: 'lineClear',
        rows: [...lines.rows],
        cols: [...lines.cols],
        cleared: [...clearResult.clearedIndices],
        iteration: chainDepth,
      });

      // Emit rescueHit phase (rescue blocks that absorbed first hit)
      if (clearResult.rescueHits.length > 0) {
        phases.push({
          type: 'rescueHit',
          indices: [...clearResult.rescueHits],
        });
      }

      // Emit rescueClear phase (rescue blocks fully cleared by 2nd hit)
      if (clearResult.rescueCleared.length > 0) {
        totalRescueCleared += clearResult.rescueCleared.length;
        phases.push({
          type: 'rescueClear',
          indices: [...clearResult.rescueCleared],
        });
      }

      changed = true;
    }

    // ── Step B: Check rescue blocks freed by neighbor isolation ──────────
    //
    // A rescue block whose 4 orthogonal neighbors are all empty gets
    // removed. This can happen when line clears empty surrounding cells.
    // Removing rescue blocks can complete new lines → chain continues.
    //
    const neighborCheck = clearRescueByNeighbors(currentGrid);

    if (neighborCheck.cleared.length > 0) {
      currentGrid = neighborCheck.grid;
      totalRescueCleared += neighborCheck.cleared.length;

      phases.push({
        type: 'rescueClear',
        indices: [...neighborCheck.cleared],
      });

      changed = true; // removing cells may open new complete lines
    }

    chainDepth++;
  }

  // ── Final: Game over check ──────────────────────────────────────────────
  const gameOver = isGameOver(currentGrid, remainingBlocks);

  return {
    finalGrid: currentGrid,
    phases,
    totalLinesCleared,
    totalRescueCleared,
    gameOver,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG / VISUALIZATION (dev only, tree-shaken in production)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pretty-print grid to console (development aid).
 * Each cell shows: '.' for empty, color digit, 'R' for rescue, 'X' for rescue-hit
 */
export function debugGrid(grid: Uint8Array): string {
  const lines: string[] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    let line = '';
    const base = r << 3;

    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = grid[base | c];

      if (isEmpty(cell)) {
        line += '. ';
      } else if (isRescue(cell) && isRescueHit(cell)) {
        line += 'X ';
      } else if (isRescue(cell)) {
        line += 'R ';
      } else {
        line += `${getColor(cell)} `;
      }
    }

    lines.push(line.trimEnd());
  }

  return lines.join('\n');
}
