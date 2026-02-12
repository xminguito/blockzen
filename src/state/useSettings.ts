/**
 * useSettings — Persistent game settings via AsyncStorage
 *
 * Manages: sound effects, vibration.
 * Settings are loaded once at app start and persisted on every change.
 */

import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Settings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const STORAGE_KEY = '@blockzen_settings';

const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  vibrationEnabled: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL SINGLETON — so all hooks share the same state
// ═══════════════════════════════════════════════════════════════════════════

let globalSettings: Settings = { ...DEFAULT_SETTINGS };
let listeners: Array<(s: Settings) => void> = [];
let loaded = false;

async function loadSettings(): Promise<Settings> {
  if (loaded) return globalSettings;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      globalSettings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // silent — use defaults
  }
  loaded = true;
  return globalSettings;
}

async function saveSettings(next: Settings): Promise<void> {
  globalSettings = next;
  listeners.forEach((fn) => fn(next));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // silent
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — readable from anywhere (non-hook)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if vibration is enabled. Safe to call outside React (e.g. in useGame).
 */
export function isVibrationEnabled(): boolean {
  return globalSettings.vibrationEnabled;
}

/**
 * Check if sound is enabled. Safe to call outside React.
 */
export function isSoundEnabled(): boolean {
  return globalSettings.soundEnabled;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(globalSettings);
  const [isLoading, setIsLoading] = useState(!loaded);

  useEffect(() => {
    // Subscribe to global changes
    const listener = (s: Settings) => setSettings({ ...s });
    listeners.push(listener);

    // Load from storage on first mount
    if (!loaded) {
      loadSettings().then((s) => {
        setSettings({ ...s });
        setIsLoading(false);
      });
    }

    return () => {
      listeners = listeners.filter((fn) => fn !== listener);
    };
  }, []);

  const toggleSound = useCallback(() => {
    const next = { ...globalSettings, soundEnabled: !globalSettings.soundEnabled };
    saveSettings(next);
  }, []);

  const toggleVibration = useCallback(() => {
    const next = { ...globalSettings, vibrationEnabled: !globalSettings.vibrationEnabled };
    saveSettings(next);
  }, []);

  return {
    settings,
    isLoading,
    toggleSound,
    toggleVibration,
  };
}
