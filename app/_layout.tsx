/**
 * Root Layout — Expo Router
 *
 * Wraps the entire app with:
 * - SafeAreaProvider (required for proper safe area insets)
 * - GestureHandlerRootView (required for gesture-handler)
 * - Dark theme status bar
 * - Stack navigator with transparent headers
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
          <StatusBar style="light" />
          <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: styles.content,
            animation: 'fade',
          }}
        />
      </View>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f2725f5',
  },
  content: {
    backgroundColor: '#0f2725f5',
  },
});
