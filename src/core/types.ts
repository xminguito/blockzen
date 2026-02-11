/**
 * BlockZen Core Types
 *
 * Grid encoding: Uint8Array(64) with bitwise cell layout:
 *   Bits 0-2: color (0=empty, 1-7=block color)
 *   Bit 3:    RESCUE flag
 *   Bit 4:    RESCUE_HIT flag (cleared once)
 *   Bits 5-7: reserved
 */

// ═══════════════════════════════════════════════════════════════════════════
// GRID CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const GRID_SIZE = 8;
export const GRID_LENGTH = GRID_SIZE * GRID_SIZE; // 64

// ═══════════════════════════════════════════════════════════════════════════
// BIT MASKS
// ═══════════════════════════════════════════════════════════════════════════

export const COLOR_MASK = 0x07; // 0b00000111 — bits 0-2
export const RESCUE_FLAG = 0x08; // 0b00001000 — bit 3
export const RESCUE_HIT = 0x10; // 0b00010000 — bit 4

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK SHAPE
// ═══════════════════════════════════════════════════════════════════════════

/** Immutable 2D shape matrix. 1 = filled cell, 0 = empty. */
export type ShapeMatrix = ReadonlyArray<ReadonlyArray<0 | 1>>;

export interface BlockDef {
  readonly id: number;
  readonly shape: ShapeMatrix;
  readonly width: number;
  readonly height: number;
  readonly cellCount: number; // pre-computed number of filled cells
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAY PIECE (block + assigned color)
// ═══════════════════════════════════════════════════════════════════════════

export interface TrayPiece {
  readonly block: BlockDef;
  readonly colorId: number; // 1-7
  placed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE RESULTS (low-level, used internally by engine.ts)
// ═══════════════════════════════════════════════════════════════════════════

export interface PlacementResult {
  readonly grid: Uint8Array;
  readonly filledIndices: readonly number[];
}

export interface CompletedLines {
  readonly rows: readonly number[];
  readonly cols: readonly number[];
}

export interface ClearResult {
  readonly grid: Uint8Array;
  readonly clearedIndices: readonly number[];
  readonly rescueHits: readonly number[];
  readonly rescueCleared: readonly number[];
  readonly totalCellsCleared: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TURN PHASES — Animation Event Queue
//
// Each phase represents one discrete visual event in a turn.
// The engine produces an ordered TurnPhase[] array; the animation layer
// plays them back sequentially. This decouples instant state resolution
// from async visual playback.
// ═══════════════════════════════════════════════════════════════════════════

export type TurnPhase =
  | TurnPhasePlacement
  | TurnPhaseLineClear
  | TurnPhaseRescueHit
  | TurnPhaseRescueClear
  | TurnPhaseCombo;

/** Block cells written to the grid */
export interface TurnPhasePlacement {
  readonly type: 'place';
  readonly indices: readonly number[];
  readonly colorId: number;
}

/** Completed rows/columns cleared (normal + rescue-2nd-hit cells removed) */
export interface TurnPhaseLineClear {
  readonly type: 'lineClear';
  readonly rows: readonly number[];
  readonly cols: readonly number[];
  readonly cleared: readonly number[];
  /** 0 = direct clear, 1+ = chain reaction depth */
  readonly iteration: number;
}

/** Rescue blocks absorb their first hit (shield break, NOT removed) */
export interface TurnPhaseRescueHit {
  readonly type: 'rescueHit';
  readonly indices: readonly number[];
}

/** Rescue blocks fully cleared (by 2nd-hit or neighbor isolation) */
export interface TurnPhaseRescueClear {
  readonly type: 'rescueClear';
  readonly indices: readonly number[];
}

/** Combo milestone reached (emitted by state layer, consumed by animation) */
export interface TurnPhaseCombo {
  readonly type: 'combo';
  readonly level: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TURN RESULT — executeTurn() output
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnResult {
  /** Grid after ALL chain reactions resolved (the new truth) */
  readonly finalGrid: Uint8Array;
  /** Ordered animation phases for sequential visual playback */
  readonly phases: readonly TurnPhase[];
  /** Total rows + columns cleared (across all chain iterations) */
  readonly totalLinesCleared: number;
  /** Total rescue blocks fully removed this turn */
  readonly totalRescueCleared: number;
  /** True if no remaining tray blocks can fit on the final grid */
  readonly gameOver: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORE EVENT
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoreEvent {
  readonly cellPoints: number;
  readonly linePoints: number;
  readonly comboMultiplier: number;
  readonly rescueBonus: number;
  readonly total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE (read by UI layer)
// ═══════════════════════════════════════════════════════════════════════════

export type GameMode = 'classic' | 'daily';

export interface GameState {
  grid: Uint8Array;
  tray: TrayPiece[];
  score: number;
  highScore: number;
  combo: number;
  linesCleared: number;
  rescueBlocksTotal: number;
  rescueBlocksCleared: number;
  isGameOver: boolean;
  mode: GameMode;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION TIMING (ms) — consumed by useGame phase playback
// ═══════════════════════════════════════════════════════════════════════════

export const PHASE_TIMING = {
  place: 50, // near-instant snap
  clearFlash: 280, // cells glow (Skia) — particles spawn here
  clearSettle: 120, // cells removed + grid settles
  rescueHit: 180, // shield-break flash
  rescueClear: 250, // rescue removal burst
  combo: 600, // combo text display (longer for dramatic effect)
  gameOverDelay: 500, // pause before modal
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HAPTIC LEVELS
// ═══════════════════════════════════════════════════════════════════════════

export type HapticLevel =
  | 'selection' // drag start — lightest
  | 'snap' // ghost locks to grid cell
  | 'place' // block placed on grid
  | 'clear' // line(s) cleared
  | 'combo' // combo multiplier — heaviest impact
  | 'gameOver'; // error notification
