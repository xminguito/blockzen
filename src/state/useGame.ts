/**
 * useGame — State Bridge Hook (v2: Overlapped Phases + Ghost Preview)
 *
 * Architecture:
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  UI Thread (Reanimated / Skia)                              │
 * │                                                             │
 * │  gridDisplay    ◄─── Skia Board shader reads per-frame      │
 * │  clearingCells  ◄─── Skia glow overlay                      │
 * │  ghostGrid      ◄─── Skia ghost preview                     │
 * │  Pan Gesture ────────► runOnJS(handleBlockPlaced)            │
 * │  Pan Update  ────────► runOnJS(updateGhostPreview)           │
 * │                                                             │
 * └──────────────────────────────┬───────────────────────────────┘
 *                                │ runOnJS
 *                                ▼
 * ┌──────────────────────────────────────────────────────────────┐
 * │  JS Thread                                                  │
 * │                                                             │
 * │  gridRef (Uint8Array)           ← truth (instant, final)    │
 * │  displayBuffer (number[])       ← mutable render buffer     │
 * │  clearingSet (Set<number>)      ← additive glow accumulator │
 * │  executeTurn()                  ← pure, μs                  │
 * │  playPhasesOverlapped()         ← staggered Promise.all     │
 * │                                                             │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Key changes from v1:
 * - displayBuffer ref prevents read-modify-write races during overlap
 * - clearingSet accumulates glow indices additively across overlapping phases
 * - Ghost preview: ghostGrid + ghostColorId + ghostValid SharedValues
 * - Haptic curve escalates with chain iteration depth
 * - Phase overlapping: each phase starts before the previous finishes
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import {
  createGrid,
  encodeCell,
  canPlace,
  canFitAnywhere,
  executeTurn,
} from '../core/engine';
import {
  createPRNG,
  getDailySeed,
  getDailySeedLabel,
  generateTrayPieces,
  generateRescuePositions,
} from '../core/prng';
import {
  calculateScore,
  getNextCombo,
  getComboLabel,
} from '../core/scoring';
import {
  GRID_LENGTH,
  PHASE_TIMING,
} from '../core/types';
import type {
  GameMode,
  TrayPiece,
  TurnPhase,
  HapticLevel,
} from '../core/types';
import { EMPTY_GRID_64 } from '../ui/shaders/PatternShaders';

// ═══════════════════════════════════════════════════════════════════════════
// HAPTIC ENGINE — lazy-loaded, escalating intensity curve
// ═══════════════════════════════════════════════════════════════════════════

let HapticsModule: typeof import('expo-haptics') | null = null;

import('expo-haptics')
  .then((m) => { HapticsModule = m; })
  .catch(() => { /* web / unsupported — silent degrade */ });

function triggerHaptic(level: HapticLevel): void {
  const H = HapticsModule;
  if (!H) return;

  switch (level) {
    case 'selection':
      H.selectionAsync();
      break;
    case 'snap':
      H.impactAsync(H.ImpactFeedbackStyle.Light);
      break;
    case 'place':
      H.impactAsync(H.ImpactFeedbackStyle.Medium);
      break;
    case 'clear':
      H.notificationAsync(H.NotificationFeedbackType.Success);
      break;
    case 'combo':
      H.impactAsync(H.ImpactFeedbackStyle.Heavy);
      break;
    case 'gameOver':
      H.notificationAsync(H.NotificationFeedbackType.Error);
      break;
  }
}

/**
 * Escalating haptic curve — intensity ramps with chain depth.
 * Base hits = Light, chain climaxes = Heavy. No Success spam.
 */
function getPhaseHaptic(phase: TurnPhase): HapticLevel {
  switch (phase.type) {
    case 'place':
      return 'place'; // Medium
    case 'lineClear':
      if (phase.iteration === 0) return 'snap'; // Light — base hit
      if (phase.iteration === 1) return 'place'; // Medium — first chain
      return 'combo'; // Heavy — deep chain climax
    case 'rescueHit':
      return 'selection'; // Lightest — shield absorb
    case 'rescueClear':
      return 'combo'; // Heavy — climactic rescue break
    case 'combo':
      return 'combo'; // Heavy
    default:
      return 'snap';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERLAP DELAYS — how much time before the NEXT phase starts
//
// Each value is LESS than the phase's total duration, creating overlap:
//   lineClear total = clearFlash(200) + clearSettle(150) = 350ms
//   lineClear overlap delay = 120ms → next starts 230ms before lineClear ends
// ═══════════════════════════════════════════════════════════════════════════

const OVERLAP_DELAY: Record<TurnPhase['type'], number> = {
  place: 60, // instant snap, next starts after 60ms
  lineClear: 120, // next starts 120ms in (overlap with 350ms total)
  rescueHit: 100, // next starts 100ms in (overlap with 180ms total)
  rescueClear: 120, // next starts 120ms in (overlap with 250ms total)
  combo: 200, // combo text lingers, next after 200ms
};

// ═══════════════════════════════════════════════════════════════════════════
// RETURN TYPE
// ═══════════════════════════════════════════════════════════════════════════

export interface UseGameReturn {
  // ── Shared Values (UI thread → Skia canvas) ──
  gridDisplay: ReturnType<typeof useSharedValue<number[]>>;
  clearingCells: ReturnType<typeof useSharedValue<number[]>>;
  ghostGrid: ReturnType<typeof useSharedValue<number[]>>;
  ghostColorId: ReturnType<typeof useSharedValue<number>>;
  ghostValid: ReturnType<typeof useSharedValue<number>>;

  // ── React State (UI re-renders) ──
  score: number;
  combo: number;
  comboLabel: string | null;
  tray: TrayPiece[];
  trayGen: number; // increments each time a new 3-piece set is generated
  isGameOver: boolean;
  linesCleared: number;
  isAnimating: boolean;
  mode: GameMode;
  dailySeedLabel: string | null;

  // ── Actions (stable callbacks for gesture worklets) ──
  handleBlockPlaced: (blockIndex: number, row: number, col: number) => void;
  canPlaceAt: (blockIndex: number, row: number, col: number) => boolean;
  updateGhostPreview: (blockIndex: number, row: number, col: number) => void;
  clearGhostPreview: () => void;
  restart: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useGame(mode: GameMode = 'classic'): UseGameReturn {
  // ─────────────────────────────────────────────────────────────────────────
  // MUTABLE REFS — always current, no stale closures, no re-renders
  // ─────────────────────────────────────────────────────────────────────────

  const gridRef = useRef<Uint8Array>(createGrid());
  const trayRef = useRef<TrayPiece[]>([]);
  const comboRef = useRef(0);
  const scoreRef = useRef(0);
  const linesClearedRef = useRef(0);
  const gameOverRef = useRef(false);
  const animatingRef = useRef(false);
  const rngRef = useRef<() => number>(createPRNG(Date.now()));
  const rescueTotalRef = useRef(0);
  const rescueClearedRef = useRef(0);

  /**
   * Display buffer: mutable number[64] that accumulates mutations
   * from overlapping phases without read-modify-write races.
   * gridDisplay SharedValue is always written from this buffer.
   */
  const displayBufferRef = useRef<number[]>([...EMPTY_GRID_64]);

  /**
   * Clearing set: additive accumulator for cells in glow animation.
   * Multiple overlapping phases can add/remove without conflicts.
   */
  const clearingSetRef = useRef<Set<number>>(new Set());

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED VALUES — UI thread, read by Skia Board shader
  // ─────────────────────────────────────────────────────────────────────────

  const gridDisplay = useSharedValue<number[]>([...EMPTY_GRID_64]);
  const clearingCells = useSharedValue<number[]>([]);
  const ghostGrid = useSharedValue<number[]>([...EMPTY_GRID_64]);
  const ghostColorId = useSharedValue<number>(0);
  const ghostValid = useSharedValue<number>(0);

  // ─────────────────────────────────────────────────────────────────────────
  // REACT STATE — triggers UI re-renders
  // ─────────────────────────────────────────────────────────────────────────

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboLabel, setComboLabel] = useState<string | null>(null);
  const [tray, _setTray] = useState<TrayPiece[]>([]);
  const [trayGen, setTrayGen] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [linesCleared, setLinesCleared] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dailySeedLabel, setDailySeedLabel] = useState<string | null>(null);

  const setTray = useCallback((newTray: TrayPiece[], isNewGeneration = false) => {
    trayRef.current = newTray;
    _setTray(newTray);
    if (isNewGeneration) {
      setTrayGen((g) => g + 1);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // DISPLAY BUFFER OPERATIONS
  //
  // These mutate displayBufferRef.current and clearingSetRef.current,
  // then write the result to the SharedValue. Since the buffer is a
  // single mutable array, overlapping phases accumulate correctly.
  // ─────────────────────────────────────────────────────────────────────────

  const flushDisplay = useCallback(() => {
    gridDisplay.value = [...displayBufferRef.current];
  }, [gridDisplay]);

  const flushClearing = useCallback(() => {
    clearingCells.value = Array.from(clearingSetRef.current);
  }, [clearingCells]);

  const syncDisplayToGrid = useCallback(() => {
    displayBufferRef.current = Array.from(gridRef.current);
    clearingSetRef.current.clear();
    gridDisplay.value = [...displayBufferRef.current];
    clearingCells.value = [];
  }, [gridDisplay, clearingCells]);

  // ─────────────────────────────────────────────────────────────────────────
  // GAME INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  const initGame = useCallback(
    (gameMode: GameMode) => {
      const seed = gameMode === 'daily' ? getDailySeed() : Date.now();
      const rng = createPRNG(seed);
      rngRef.current = rng;
      setDailySeedLabel(
        gameMode === 'daily' ? getDailySeedLabel(seed) : null,
      );

      const grid = createGrid();
      const rescuePositions = generateRescuePositions(rng, 3);
      for (const pos of rescuePositions) {
        grid[pos] = encodeCell(1, true);
      }

      gridRef.current = grid;
      displayBufferRef.current = Array.from(grid);
      clearingSetRef.current.clear();

      gridDisplay.value = [...displayBufferRef.current];
      clearingCells.value = [];
      ghostGrid.value = [...EMPTY_GRID_64];
      ghostColorId.value = 0;
      ghostValid.value = 0;

      const pieces = generateTrayPieces(rng);

      scoreRef.current = 0;
      comboRef.current = 0;
      linesClearedRef.current = 0;
      gameOverRef.current = false;
      animatingRef.current = false;
      rescueTotalRef.current = rescuePositions.length;
      rescueClearedRef.current = 0;

      setScore(0);
      setCombo(0);
      setComboLabel(null);
      setTray(pieces, true); // new generation on init
      setIsGameOver(false);
      setLinesCleared(0);
      setIsAnimating(false);
    },
    [setTray, gridDisplay, clearingCells, ghostGrid, ghostColorId, ghostValid],
  );

  useEffect(() => {
    initGame(mode);
  }, [mode, initGame]);

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE VISUAL EXECUTION
  //
  // Each function handles ONE phase's visual effects:
  // 1. Trigger haptic
  // 2. Mutate displayBuffer / clearingSet
  // 3. Flush to SharedValues
  // 4. Await animation duration
  // ─────────────────────────────────────────────────────────────────────────

  const executePhaseVisual = useCallback(
    async (phase: TurnPhase) => {
      switch (phase.type) {
        case 'place': {
          triggerHaptic(getPhaseHaptic(phase));
          const buf = displayBufferRef.current;
          for (const i of phase.indices) {
            buf[i] = phase.colorId;
          }
          flushDisplay();
          // No wait — instant snap
          break;
        }

        case 'lineClear': {
          triggerHaptic(getPhaseHaptic(phase));

          // Step 1: Brief white flash (pop effect)
          for (const i of phase.cleared) {
            clearingSetRef.current.add(i);
          }
          flushClearing();
          await wait(60); // quick white flash

          // Step 2: Flash back to original color briefly
          for (const i of phase.cleared) {
            clearingSetRef.current.delete(i);
          }
          flushClearing();
          await wait(40); // show original color

          // Step 3: Glow again (particles spawn during this)
          for (const i of phase.cleared) {
            clearingSetRef.current.add(i);
          }
          flushClearing();
          await wait(PHASE_TIMING.clearFlash);

          // Step 4: Remove cells from display buffer
          const buf = displayBufferRef.current;
          for (const i of phase.cleared) {
            buf[i] = 0;
            clearingSetRef.current.delete(i);
          }
          flushDisplay();
          flushClearing();
          await wait(PHASE_TIMING.clearSettle);
          break;
        }

        case 'rescueHit': {
          triggerHaptic(getPhaseHaptic(phase));
          // Update display to show hit visual (add RESCUE_HIT bit)
          const buf = displayBufferRef.current;
          for (const i of phase.indices) {
            buf[i] = buf[i] | 0x10; // RESCUE_HIT = bit 4
          }
          flushDisplay();
          await wait(PHASE_TIMING.rescueHit);
          break;
        }

        case 'rescueClear': {
          triggerHaptic(getPhaseHaptic(phase));

          // Flash: add to clearing set
          for (const i of phase.indices) {
            clearingSetRef.current.add(i);
          }
          flushClearing();
          await wait(PHASE_TIMING.rescueClear / 2);

          // Remove: clear from display
          const buf = displayBufferRef.current;
          for (const i of phase.indices) {
            buf[i] = 0;
            clearingSetRef.current.delete(i);
          }
          flushDisplay();
          flushClearing();
          await wait(PHASE_TIMING.rescueClear / 2);
          break;
        }

        case 'combo': {
          triggerHaptic(getPhaseHaptic(phase));
          setCombo(phase.level);
          setComboLabel(getComboLabel(phase.level));
          await wait(PHASE_TIMING.combo);
          setComboLabel(null);
          break;
        }
      }
    },
    [flushDisplay, flushClearing],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // OVERLAPPED PHASE PLAYBACK
  //
  // Instead of sequential await, phases are launched with staggered delays.
  // Each phase starts BEFORE the previous finishes, creating fluid cascades.
  //
  // Safety: displayBuffer is a single mutable array. Overlapping mutations
  // from different phases target DIFFERENT cell indices (by design of the
  // engine), so no conflicts occur. clearingSet is additive.
  //
  // Timeline example (lineClear=350ms total, overlap=120ms):
  //   |place|
  //     60ms |---lineClear---|
  //           120ms |--rescueHit--|
  //                  100ms |---rescueClear---|
  // ─────────────────────────────────────────────────────────────────────────

  const playPhases = useCallback(
    async (phases: readonly TurnPhase[]) => {
      animatingRef.current = true;
      setIsAnimating(true);

      try {
        // Clear ghost during animation
        ghostGrid.value = [...EMPTY_GRID_64];

        // Build staggered task list
        const tasks: { delay: number; execute: () => Promise<void> }[] = [];
        let offset = 0;

        for (const phase of phases) {
          const currentOffset = offset;
          tasks.push({
            delay: currentOffset,
            execute: () => executePhaseVisual(phase),
          });
          offset += OVERLAP_DELAY[phase.type];
        }

        // Launch all tasks with their staggered delays
        await Promise.all(
          tasks.map(({ delay, execute }) => wait(delay).then(execute)),
        );
      } catch (e) {
        console.warn('[BlockZen] playPhases error:', e);
      } finally {
        // ALWAYS sync display and reset animating, even on error.
        // Without this, a thrown error would leave the game stuck.
        syncDisplayToGrid();
        animatingRef.current = false;
        setIsAnimating(false);
      }
    },
    [executePhaseVisual, syncDisplayToGrid, ghostGrid],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCK PLACEMENT HANDLER
  //
  // STABLE callback (deps reference only stable refs/callbacks).
  // Safe for runOnJS from gesture worklets — no stale closures.
  // ─────────────────────────────────────────────────────────────────────────

  const handleBlockPlaced = useCallback(
    (blockIndex: number, gridRow: number, gridCol: number) => {
      if (animatingRef.current || gameOverRef.current) return;

      const currentTray = trayRef.current;
      const piece = currentTray[blockIndex];
      if (!piece || piece.placed) return;
      if (!canPlace(gridRef.current, piece.block, gridRow, gridCol)) return;

      // Clear ghost immediately
      ghostGrid.value = [...EMPTY_GRID_64];

      // Mark this piece as placed and determine next available blocks
      const updatedTray = currentTray.map((p, i) =>
        i === blockIndex ? { ...p, placed: true } : p,
      );
      const allPlaced = updatedTray.every((p) => p.placed);

      // IMPORTANT: compute next available blocks BEFORE executeTurn.
      // When all 3 tray pieces are placed, generate the new tray first
      // so the game-over check runs against the NEXT set of blocks,
      // not an empty array (which would always return gameOver=true).
      let nextBlocks: TrayPiece[];
      if (allPlaced) {
        nextBlocks = generateTrayPieces(rngRef.current);
      } else {
        nextBlocks = updatedTray.filter((p) => !p.placed);
      }

      // Execute turn (PURE, SYNCHRONOUS, ~μs)
      // Note: we ignore result.gameOver and do our own check below
      // using the actual next blocks for full correctness.
      const result = executeTurn(
        gridRef.current,
        piece.block,
        gridRow,
        gridCol,
        piece.colorId,
        nextBlocks,
      );

      // Update grid truth (instant)
      gridRef.current = result.finalGrid;

      // Calculate score
      const allRescueDone =
        rescueClearedRef.current + result.totalRescueCleared >=
        rescueTotalRef.current;
      const scoreEvent = calculateScore(
        piece.block.cellCount,
        result.totalLinesCleared,
        comboRef.current,
        result.totalRescueCleared,
        allRescueDone,
      );

      // Update mutable refs
      const newCombo = getNextCombo(
        result.totalLinesCleared,
        comboRef.current,
      );
      scoreRef.current += scoreEvent.total;
      comboRef.current = newCombo;
      linesClearedRef.current += result.totalLinesCleared;
      rescueClearedRef.current += result.totalRescueCleared;

      // Update React state
      setScore(scoreRef.current);
      setLinesCleared(linesClearedRef.current);

      // Update tray: either new 3-piece set (new generation) or mark current piece as placed
      setTray(allPlaced ? nextBlocks : updatedTray, allPlaced);

      // ── Game over check — done HERE, not inside executeTurn ──────────
      // We check against result.finalGrid (after all chain reactions)
      // and the ACTUAL blocks that will be in the tray going forward.
      const actualTray = allPlaced ? nextBlocks : updatedTray;
      let gameOver = true;
      for (const p of actualTray) {
        if (p.placed) continue;
        if (canFitAnywhere(result.finalGrid, p.block)) {
          gameOver = false;
          break;
        }
      }

      // Build animation phases (engine phases + combo if applicable)
      const phases: TurnPhase[] = [...result.phases];
      if (newCombo >= 2) {
        phases.push({ type: 'combo', level: newCombo });
      }

      // Handle game over (animations play first, then modal)
      if (gameOver) {
        gameOverRef.current = true;
        playPhases(phases).then(() => {
          triggerHaptic('gameOver');
          setIsGameOver(true);
        });
      } else {
        playPhases(phases);
      }
    },
    [playPhases, setTray, ghostGrid],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GHOST PREVIEW
  //
  // Called from gesture onUpdate via runOnJS.
  // Computes which cells the block would occupy at (row, col) and writes
  // a 64-element flag array to ghostGrid SharedValue.
  // The Board shader renders these cells at 35% opacity.
  //
  // Cost: shape iteration (max 25 cells for 5x5) + canPlace (~μs).
  // Safe at 60fps via runOnJS.
  // ─────────────────────────────────────────────────────────────────────────

  const updateGhostPreview = useCallback(
    (blockIndex: number, row: number, col: number) => {
      if (animatingRef.current || gameOverRef.current) {
        ghostGrid.value = [...EMPTY_GRID_64];
        return;
      }

      const piece = trayRef.current[blockIndex];
      if (!piece || piece.placed) {
        ghostGrid.value = [...EMPTY_GRID_64];
        return;
      }

      const { block } = piece;
      const valid = canPlace(gridRef.current, block, row, col);

      // Build ghost grid (fill cells the block would occupy)
      const grid = [...EMPTY_GRID_64];
      if (
        row >= 0 &&
        col >= 0 &&
        row + block.height <= 8 &&
        col + block.width <= 8
      ) {
        const { shape, height, width } = block;
        for (let r = 0; r < height; r++) {
          for (let c = 0; c < width; c++) {
            if (shape[r][c] === 1) {
              grid[((row + r) << 3) | (col + c)] = 1;
            }
          }
        }
      }

      ghostGrid.value = grid;
      ghostColorId.value = piece.colorId;
      ghostValid.value = valid ? 1 : 0;
    },
    [ghostGrid, ghostColorId, ghostValid],
  );

  const clearGhostPreview = useCallback(() => {
    ghostGrid.value = [...EMPTY_GRID_64];
    ghostColorId.value = 0;
    ghostValid.value = 0;
  }, [ghostGrid, ghostColorId, ghostValid]);

  // ─────────────────────────────────────────────────────────────────────────
  // PLACEMENT VALIDATION (for external use by gesture handlers)
  // ─────────────────────────────────────────────────────────────────────────

  const canPlaceAt = useCallback(
    (blockIndex: number, row: number, col: number): boolean => {
      if (animatingRef.current || gameOverRef.current) return false;
      const piece = trayRef.current[blockIndex];
      if (!piece || piece.placed) return false;
      return canPlace(gridRef.current, piece.block, row, col);
    },
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RESTART
  // ─────────────────────────────────────────────────────────────────────────

  const restart = useCallback(() => {
    initGame(mode);
  }, [mode, initGame]);

  // ─────────────────────────────────────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────────────────────────────────────

  return {
    gridDisplay,
    clearingCells,
    ghostGrid,
    ghostColorId,
    ghostValid,
    score,
    combo,
    comboLabel,
    tray,
    trayGen,
    isGameOver,
    linesCleared,
    isAnimating,
    mode,
    dailySeedLabel,
    handleBlockPlaced,
    canPlaceAt,
    updateGhostPreview,
    clearGhostPreview,
    restart,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
