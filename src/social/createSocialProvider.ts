/**
 * Platform factory — returns the correct SocialProvider singleton.
 *
 *   iOS     → GameCenterProvider
 *   Android → NoopProvider  (swap for PlayGamesProvider when ready)
 *   Web     → NoopProvider
 */

import { Platform } from 'react-native';
import type { SocialProvider } from './SocialProvider';
import { GameCenterProvider } from './providers/GameCenterProvider';
import { NoopProvider } from './providers/NoopProvider';

let _instance: SocialProvider | null = null;

export function getSocialProvider(): SocialProvider {
  if (!_instance) {
    _instance =
      Platform.OS === 'ios' ? new GameCenterProvider() : new NoopProvider();
  }
  return _instance;
}
