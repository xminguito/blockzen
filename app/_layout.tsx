/**
 * Root Layout — Expo Router
 *
 * Wraps the entire app with:
 * - GestureHandlerRootView (required for gesture-handler)
 * - Dark theme status bar
 * - Stack navigator with transparent headers
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';

export default function RootLayout() {
  return (
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B0B1E',
  },
  content: {
    backgroundColor: '#0B0B1E',
  },
});
