import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EditorScreen } from './src/screens/EditorScreen';
import { COLORS } from './src/theme';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.BACKGROUND_PRINCIPAL }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <EditorScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
