/**
 * ParticleCanvas — GPU-Rendered Particle System via Skia
 *
 * Uses Skia's Circle + Points API for high-performance rendering of
 * 100+ particles during line clears and chain reactions.
 *
 * Architecture:
 * - Separate <Canvas> overlay (z-index above Board)
 * - Reads clearingCells SharedValue for trigger positions
 * - Each cleared cell spawns 8-15 particles
 * - Particles: random velocity, gravity, fade, color-matched
 * - ~400ms lifetime, eased opacity
 * - Chain reactions: more particles + larger spread
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { PALETTE } from '../shaders/PatternShaders';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: readonly [number, number, number];
  life: number; // 0→1, starts at 0
  maxLife: number;
  gravity: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const PARTICLES_PER_CELL = 18;
const PARTICLE_LIFETIME = 600; // ms
const GRAVITY = 0.005;
const MAX_PARTICLES = 400;
const FRAME_INTERVAL = 16; // ~60fps

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

export interface ParticleCanvasProps {
  /** Indices of cells currently being cleared */
  clearingCells: SharedValue<number[]>;
  /** Grid display for reading cell colors */
  gridDisplay: SharedValue<number[]>;
  /** Board dimensions */
  boardSize: number;
  cellSize: number;
  gap: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ParticleCanvas({
  clearingCells,
  gridDisplay,
  boardSize,
  cellSize,
  gap,
}: ParticleCanvasProps) {
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevClearingRef = useRef<number[]>([]);

  // Shared values for Skia rendering (batched particle state)
  const particleData = useSharedValue<
    { x: number; y: number; r: number; color: string; opacity: number }[]
  >([]);

  /** Convert grid index to pixel center (offset by INNER_PAD to match Board) */
  const indexToCenter = useCallback(
    (idx: number): [number, number] => {
      const col = idx % 8;
      const row = Math.floor(idx / 8);
      const stride = cellSize + gap;
      const x = INNER_PAD + col * stride + cellSize / 2;
      const y = INNER_PAD + row * stride + cellSize / 2;
      return [x, y];
    },
    [cellSize, gap],
  );

  /** Get color for a cell value */
  const getCellColor = useCallback(
    (cellValue: number): readonly [number, number, number] => {
      const colorId = cellValue & 7;
      if (colorId === 0 || colorId > 7) return [1, 1, 1];
      return PALETTE[colorId - 1];
    },
    [],
  );

  /** Spawn particles for newly clearing cells */
  const spawnParticles = useCallback(
    (indices: number[], grid: number[]) => {
      const newParticles: Particle[] = [];

      for (const idx of indices) {
        const [cx, cy] = indexToCenter(idx);
        const baseColor = getCellColor(grid[idx] || 0);
        const count = PARTICLES_PER_CELL;

        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
          const speed = 2.5 + Math.random() * 4.5; // faster burst

          // Color variation: +-15% brightness per particle
          const variation = 0.85 + Math.random() * 0.3;
          const color: readonly [number, number, number] = [
            Math.min(1, baseColor[0] * variation),
            Math.min(1, baseColor[1] * variation),
            Math.min(1, baseColor[2] * variation),
          ];

          // Mix of small fast particles and bigger slow ones
          const isBig = Math.random() > 0.7;
          newParticles.push({
            x: cx + (Math.random() - 0.5) * cellSize * 0.25,
            y: cy + (Math.random() - 0.5) * cellSize * 0.25,
            vx: Math.cos(angle) * speed * (isBig ? 0.6 : 1),
            vy: Math.sin(angle) * speed - 2.0, // strong upward bias
            radius: isBig ? 3.0 + Math.random() * 3.0 : 1.2 + Math.random() * 2.5,
            color,
            life: 0,
            maxLife: PARTICLE_LIFETIME + Math.random() * 200,
            gravity: GRAVITY + Math.random() * 0.004,
          });
        }
      }

      // Add to existing, cap total
      const all = [...particlesRef.current, ...newParticles];
      particlesRef.current = all.slice(-MAX_PARTICLES);
    },
    [indexToCenter, getCellColor, cellSize],
  );

  /** Animation tick: update particle physics, cull dead, flush to SharedValue */
  const tick = useCallback(() => {
    const particles = particlesRef.current;
    if (particles.length === 0) {
      particleData.value = [];
      animFrameRef.current = null; // CRITICAL: clear ref so startAnimation works next time
      return;
    }

    const alive: Particle[] = [];
    const renderData: {
      x: number;
      y: number;
      r: number;
      color: string;
      opacity: number;
    }[] = [];

    for (const p of particles) {
      p.life += FRAME_INTERVAL;
      if (p.life >= p.maxLife) continue;

      // Physics update
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.98; // air resistance

      // Eased opacity: fade in quickly, fade out slowly
      const t = p.life / p.maxLife;
      const opacity = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;

      const [r, g, b] = p.color;
      const hex =
        '#' +
        Math.round(r * 255)
          .toString(16)
          .padStart(2, '0') +
        Math.round(g * 255)
          .toString(16)
          .padStart(2, '0') +
        Math.round(b * 255)
          .toString(16)
          .padStart(2, '0');

      alive.push(p);
      renderData.push({
        x: p.x,
        y: p.y,
        r: p.radius * (1 - t * 0.3), // shrink slightly
        color: hex,
        opacity: Math.max(0, opacity),
      });
    }

    particlesRef.current = alive;
    particleData.value = renderData;

    if (alive.length > 0) {
      animFrameRef.current = setTimeout(tick, FRAME_INTERVAL);
    } else {
      animFrameRef.current = null; // all particles dead — allow restart
    }
  }, [particleData]);

  /** Start animation loop */
  const startAnimation = useCallback(() => {
    if (animFrameRef.current) return;
    animFrameRef.current = setTimeout(tick, FRAME_INTERVAL);
  }, [tick]);

  /** Watch clearingCells and spawn particles for new entries */
  useEffect(() => {
    // Poll clearingCells for changes (JS thread bridge)
    const checkInterval = setInterval(() => {
      const current = clearingCells.value;
      const prev = prevClearingRef.current;

      // Find newly added indices
      const prevSet = new Set(prev);
      const newIndices = current.filter((i) => !prevSet.has(i));

      if (newIndices.length > 0) {
        spawnParticles(newIndices, gridDisplay.value);
        startAnimation();
      }

      prevClearingRef.current = [...current];
    }, 50);

    return () => {
      clearInterval(checkInterval);
      if (animFrameRef.current) {
        clearTimeout(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [clearingCells, gridDisplay, spawnParticles, startAnimation]);

  // Derive Skia-compatible render data
  const renderParticles = useDerivedValue(() => particleData.value);

  if (boardSize <= 0) return null;

  return (
    <Canvas
      style={[
        styles.canvas,
        { width: boardSize, height: boardSize },
      ]}
      pointerEvents="none"
    >
      <Group>
        {/* Render up to MAX_PARTICLES circles */}
        {Array.from({ length: MAX_PARTICLES }, (_, i) => (
          <ParticleDot key={i} index={i} data={renderParticles} />
        ))}
      </Group>
    </Canvas>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTICLE DOT — Individual Skia Circle driven by SharedValue
// ═══════════════════════════════════════════════════════════════════════════

interface ParticleDotProps {
  index: number;
  data: SharedValue<
    { x: number; y: number; r: number; color: string; opacity: number }[]
  >;
}

function ParticleDot({ index, data }: ParticleDotProps) {
  const cx = useDerivedValue(() => data.value[index]?.x ?? -100);
  const cy = useDerivedValue(() => data.value[index]?.y ?? -100);
  const r = useDerivedValue(() => data.value[index]?.r ?? 0);
  const color = useDerivedValue(() => data.value[index]?.color ?? '#FFFFFF');
  const opacity = useDerivedValue(() => data.value[index]?.opacity ?? 0);

  return <Circle cx={cx} cy={cy} r={r} color={color} opacity={opacity} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const INNER_PAD = 8; // Must match Board.tsx INNER_PAD

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
