/**
 * SettingsModal — Block Blast-style settings overlay
 *
 * Blue/purple gradient card with toggle rows for Sound and Vibration,
 * plus action buttons for Restart and Home.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

export interface SettingsModalProps {
  visible: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  onToggleSound: () => void;
  onToggleVibration: () => void;
  onRestart: () => void;
  onHome: () => void;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS (simple text-based, no external deps)
// ═══════════════════════════════════════════════════════════════════════════

function SoundIcon() {
  return <Text style={iconStyles.icon}>🔊</Text>;
}

function VibrationIcon() {
  return <Text style={iconStyles.icon}>📳</Text>;
}

function RestartIcon() {
  return <Text style={iconStyles.icon}>🔄</Text>;
}

function HomeIcon() {
  return <Text style={iconStyles.icon}>🏠</Text>;
}

const iconStyles = StyleSheet.create({
  icon: {
    fontSize: 22,
    marginRight: 12,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE ROW
// ═══════════════════════════════════════════════════════════════════════════

function ToggleRow({
  icon,
  label,
  value,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#4CD964' }}
        thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
        ios_backgroundColor="rgba(255,255,255,0.15)"
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION ROW — button-style row
// ═══════════════════════════════════════════════════════════════════════════

function ActionRow({
  icon,
  label,
  buttonLabel,
  onPress,
  buttonColor = '#4CD964',
}: {
  icon: React.ReactNode;
  label: string;
  buttonLabel: string;
  onPress: () => void;
  buttonColor?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: buttonColor },
          pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
        ]}
        onPress={onPress}
      >
        <Text style={styles.actionButtonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SettingsModal({
  visible,
  soundEnabled,
  vibrationEnabled,
  onToggleSound,
  onToggleVibration,
  onRestart,
  onHome,
  onClose,
}: SettingsModalProps) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <Animated.View
      style={StyleSheet.absoluteFill}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
    >
      {/* Blur backdrop */}
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

      {/* Tap outside to close */}
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Card — stop propagation */}
        <Animated.View
          entering={ZoomIn.springify().damping(14).stiffness(140)}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{t('settings.title')}</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={onClose}
                hitSlop={12}
              >
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Toggle rows */}
            <ToggleRow
              icon={<SoundIcon />}
              label={t('settings.sound')}
              value={soundEnabled}
              onToggle={onToggleSound}
            />

            <View style={styles.rowSeparator} />

            <ToggleRow
              icon={<VibrationIcon />}
              label={t('settings.vibration')}
              value={vibrationEnabled}
              onToggle={onToggleVibration}
            />

            <View style={styles.rowSeparator} />

            {/* Action rows */}
            <ActionRow
              icon={<RestartIcon />}
              label={t('settings.replay')}
              buttonLabel={t('settings.play')}
              onPress={() => {
                onClose();
                onRestart();
              }}
              buttonColor="#4CD964"
            />

            <View style={styles.rowSeparator} />

            <ActionRow
              icon={<HomeIcon />}
              label={t('settings.home')}
              buttonLabel={t('settings.go')}
              onPress={() => {
                onClose();
                onHome();
              }}
              buttonColor="#5AC8FA"
            />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 56, 340);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(55, 48, 107, 0.97)',
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(120, 110, 200, 0.4)',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  rowSeparator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 4,
  },
  actionButton: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
