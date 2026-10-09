import 'react-native-gesture-handler';
import React, { Component, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPE } from './src/theme';

/**
 * Tela de erro: em vez do app fechar, mostra a mensagem e a pilha para o
 * usuário tirar print. Cobre erros de render (ErrorBoundary), erros JS fora do
 * React (ErrorUtils) e falha ao carregar a tela do editor (require preguiçoso).
 */
function ErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = error as Error;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.BACKGROUND_PRINCIPAL }}>
      <ScrollView contentContainerStyle={{ padding: SPACING.xl, gap: SPACING.md }}>
        <Text style={TYPE.overline}>Studio IA · erro</Text>
        <Text style={[TYPE.title, { fontSize: 18 }]}>Algo deu errado</Text>
        <Text style={TYPE.body}>Tire um print desta tela e envie para o suporte.</Text>
        <Text selectable style={[TYPE.mono, { fontSize: 11, color: COLORS.TEXT_PRIMARY }]}>
          {String(e?.name ?? 'Error')}: {String(e?.message ?? error)}
        </Text>
        <Text selectable style={[TYPE.mono, { fontSize: 9 }]}>
          {String(e?.stack ?? '').split('\n').slice(0, 25).join('\n')}
        </Text>
        <Pressable onPress={onRetry} style={{ marginTop: SPACING.lg, padding: SPACING.md, backgroundColor: COLORS.ACCENT_COLOR, borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ color: COLORS.ACCENT_INK, fontWeight: '700' }}>Tentar de novo</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) return <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

function Editor() {
  const [state, setState] = useState<{ Screen?: React.ComponentType; error?: unknown }>({});

  useEffect(() => {
    // Erros JS fora do ciclo do React (callbacks, promises) também vão para a tela de erro
    const g = globalThis as any;
    const prev = g.ErrorUtils?.getGlobalHandler?.();
    g.ErrorUtils?.setGlobalHandler?.((err: unknown, isFatal?: boolean) => {
      if (isFatal) setState({ error: err });
      else prev?.(err, isFatal);
    });
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Root } = require('./src/Root');
      setState({ Screen: Root });
    } catch (error) {
      setState({ error });
    }
    return () => g.ErrorUtils?.setGlobalHandler?.(prev);
  }, []);

  if (state.error) return <ErrorScreen error={state.error} onRetry={() => setState((s) => ({ Screen: s.Screen }))} />;
  if (!state.Screen) return <View style={{ flex: 1, backgroundColor: COLORS.BACKGROUND_PRINCIPAL }} />;
  const Screen = state.Screen;
  return <Screen />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.BACKGROUND_PRINCIPAL }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Boundary>
          <Editor />
        </Boundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
