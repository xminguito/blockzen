/**
 * Sound Engine — Preloaded sound effects using expo-av
 *
 * Plays short SFX for game events: place, clear, combo, game over.
 * Respects the global Sound setting from useSettings.
 * All sounds are preloaded at app start for zero-latency playback.
 *
 * Gracefully degrades when expo-av native module is not available
 * (e.g., in Expo Go or a dev build that predates the expo-av install).
 */

import { isSoundEnabled } from '../state/useSettings';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SoundName = 'place' | 'clear' | 'combo' | 'gameover';

// ═══════════════════════════════════════════════════════════════════════════
// LAZY-LOADED MODULE — avoids crash if native module is missing
// ═══════════════════════════════════════════════════════════════════════════

let AudioModule: typeof import('expo-av').Audio | null = null;
let nativeAvailable = false;

// Sound sources — loaded lazily after we confirm the native module exists
const SOUND_SOURCES: Record<SoundName, number> = {
  place: require('../../assets/sounds/place.wav'),
  clear: require('../../assets/sounds/clear.wav'),
  combo: require('../../assets/sounds/combo.wav'),
  gameover: require('../../assets/sounds/gameover.wav'),
};

// ═══════════════════════════════════════════════════════════════════════════
// PRELOADED POOL
// ═══════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const soundPool: Partial<Record<SoundName, any>> = {};
let initialized = false;

async function initSounds(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    // Dynamic import — will throw if native module is absent
    const av = await import('expo-av');
    AudioModule = av.Audio;
    nativeAvailable = true;

    // Set audio mode for game (mix with other apps, no interruption)
    await AudioModule.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    // Preload all sounds
    const names = Object.keys(SOUND_SOURCES) as SoundName[];
    await Promise.all(
      names.map(async (name) => {
        try {
          const { sound } = await AudioModule!.Sound.createAsync(
            SOUND_SOURCES[name],
            { shouldPlay: false, volume: 0.7 },
          );
          soundPool[name] = sound;
        } catch {
          // Silent — individual sound unavailable
        }
      }),
    );
  } catch {
    // expo-av native module not available — silent degrade
    nativeAvailable = false;
  }
}

// Start preloading immediately on module load (non-blocking)
initSounds();

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Play a sound effect. Non-blocking, respects the Sound setting.
 * Safe to call from anywhere (non-hook). Silently no-ops if unavailable.
 */
export function playSound(name: SoundName): void {
  if (!nativeAvailable || !isSoundEnabled()) return;

  const sound = soundPool[name];
  if (!sound) return;

  sound.setPositionAsync(0).then(() => {
    sound.playAsync().catch(() => {});
  }).catch(() => {});
}

/**
 * Play sound with custom volume (0-1). Useful for escalating combo sounds.
 */
export function playSoundWithVolume(name: SoundName, volume: number): void {
  if (!nativeAvailable || !isSoundEnabled()) return;

  const sound = soundPool[name];
  if (!sound) return;

  sound.setVolumeAsync(Math.max(0, Math.min(1, volume))).then(() => {
    sound.setPositionAsync(0).then(() => {
      sound.playAsync().catch(() => {});
    }).catch(() => {});
  }).catch(() => {});
}
