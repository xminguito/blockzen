/**
 * Platform factory — returns the correct SocialProvider singleton.
 *
 *   iOS     → GameCenterProvider  (Apple Game Center / GameKit)
 *   Android → PlayGamesProvider   (Google Play Games Services v2)
 *   Web     → NoopProvider
 */

import { Platform } from 'react-native';
import type { SocialProvider } from './SocialProvider';
import { GameCenterProvider } from './providers/GameCenterProvider';
import { PlayGamesProvider } from './providers/PlayGamesProvider';
import { NoopProvider } from './providers/NoopProvider';

let _instance: SocialProvider | null = null;

export function getSocialProvider(): SocialProvider {
  if (!_instance) {
    switch (Platform.OS) {
      case 'ios':
        _instance = new GameCenterProvider();
        break;
      case 'android':
        _instance = new PlayGamesProvider();
        break;
      default:
        _instance = new NoopProvider();
    }
  }
  return _instance;
}
