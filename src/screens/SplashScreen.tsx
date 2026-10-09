/**
 * Abertura animada: a logo surge com brilho, as palavras CREATE · EDIT ·
 * EXPLORE entram em sequência e tudo some revelando o app.
 * Enquanto isso, os projetos salvos já são carregados.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/icon.png');
const WORDS = ['CREATE', 'EDIT', 'EXPLORE'];

export function SplashScreen({ onDone, ready }: { onDone: () => void; ready: boolean }) {
  const logo = useSharedValue(0);
  const glow = useSharedValue(0);
  const words = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const out = useSharedValue(1);
  const finished = useSharedValue(false);

  useEffect(() => {
    logo.value = withSpring(1, { damping: 14, stiffness: 90 });
    glow.value = withDelay(250, withSequence(withTiming(1, { duration: 500 }), withTiming(0.45, { duration: 700 })));
    words.forEach((w, i) => {
      w.value = withDelay(650 + i * 180, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    // espera a animação de entrada e então dissolve
    out.value = withDelay(
      1500,
      withTiming(0, { duration: 420, easing: Easing.in(Easing.cubic) }, (f) => {
        if (f && !finished.value) {
          finished.value = true;
          runOnJS(onDone)();
        }
      }),
    );
  }, [ready, onDone, out, finished]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logo.value,
    transform: [{ scale: 0.82 + logo.value * 0.18 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.16, transform: [{ scale: 0.85 + glow.value * 0.3 }] }));
  const rootStyle = useAnimatedStyle(() => ({ opacity: out.value }));
  const wordStyles = words.map((w) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({ opacity: w.value, transform: [{ translateY: (1 - w.value) * 8 }] })),
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.Image source={LOGO} style={[styles.logo, logoStyle]} resizeMode="contain" />
      </View>
      <View style={styles.words}>
        <View style={styles.rule} />
        {WORDS.map((w, i) => (
          <Animated.Text key={w} style={[styles.word, wordStyles[i]]}>
            {w}
          </Animated.Text>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: COLORS.BACKGROUND_PRINCIPAL, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.ACCENT_COLOR,
    shadowColor: COLORS.ACCENT_COLOR,
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 30,
    opacity: 0.2,
  },
  logo: { width: 168, height: 168, borderRadius: 36 },
  words: { position: 'absolute', bottom: '18%', alignItems: 'center', gap: 10 },
  rule: { width: 28, height: 1, backgroundColor: COLORS.TEXT_SECONDARY, marginBottom: 10 },
  word: { color: COLORS.TEXT_SECONDARY, fontSize: 11, letterSpacing: 5, fontWeight: '500' },
});
