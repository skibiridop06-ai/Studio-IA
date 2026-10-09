/**
 * Navegação do app: Abertura → Início (abas) ⇄ Editor.
 * Navegação própria e leve (sem biblioteca), com transição de fade.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { COLORS } from './theme';
import { useProjects } from './store/projectsStore';
import { SplashScreen } from './screens/SplashScreen';
import { HomeScreen, type OpenEditor } from './screens/HomeScreen';
import { EditorScreen } from './screens/EditorScreen';

export function Root() {
  const [splash, setSplash] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [editor, setEditor] = useState<OpenEditor | null>(null);

  useEffect(() => {
    useProjects
      .getState()
      .load()
      .finally(() => setLoaded(true));
  }, []);

  const exitEditor = useCallback(() => setEditor(null), []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.BACKGROUND_PRINCIPAL }}>
      {editor ? (
        <Animated.View key="editor" style={{ flex: 1 }} entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)}>
          <EditorScreen onExit={exitEditor} initialTool={editor.tool ?? null} initialEffect={editor.effect ?? null} />
        </Animated.View>
      ) : (
        <Animated.View key="home" style={{ flex: 1 }} entering={FadeIn.duration(260)}>
          {loaded && <HomeScreen onOpenEditor={(o) => setEditor(o ?? {})} />}
        </Animated.View>
      )}
      {splash && <SplashScreen ready={loaded} onDone={() => setSplash(false)} />}
    </View>
  );
}
