/**
 * Figurinha transformável: Pan + Pinch + Rotation SIMULTÂNEOS, 100% na UI thread.
 *
 * Fluxo de um frame de gesto (nenhuma ponte JS envolvida):
 *   Touch nativo → RNGH (worklet onUpdate) → escreve SharedValues
 *   → useAnimatedStyle recalcula a matriz de transform na UI thread
 *   → o compositor nativo (Core Animation / RenderThread do Android) aplica
 *     a transformação na textura já rasterizada da View — é só uma
 *     multiplicação de matriz na GPU, sem re-layout e sem re-render React.
 *
 * Por isso o arrasto acompanha o dedo a 120 Hz mesmo com a thread JS ocupada
 * (ex.: rodando inferência ONNX ou parse de log do FFmpeg).
 *
 * O estado só é "comitado" no store (runOnJS) quando o gesto termina.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../theme';
import type { StickerLayer } from '../store/editorStore';

interface Props {
  layer: StickerLayer;
  selected: boolean;
  playheadMs: SharedValue<number>;
  onSelect: (id: string) => void;
  onCommit: (id: string, patch: Partial<StickerLayer>) => void;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 8;
const SNAP_ANGLE = Math.PI / 4; // ímã a cada 45°
const SNAP_EPS = 0.06; // ~3.4°

const haptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

function TransformableStickerBase({ layer, selected, playheadMs, onSelect, onCommit }: Props) {
  const tx = useSharedValue(layer.x);
  const ty = useSharedValue(layer.y);
  const sc = useSharedValue(layer.scale);
  const rot = useSharedValue(layer.rotation);
  const pressed = useSharedValue(0);

  // valores no início do gesto (o gesto é relativo)
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startS = useSharedValue(1);
  const startR = useSharedValue(0);
  const snapped = useSharedValue(false);

  // Sincroniza quando o store muda por fora (undo, IA, reset)
  useEffect(() => {
    tx.value = layer.x;
    ty.value = layer.y;
    sc.value = layer.scale;
    rot.value = layer.rotation;
  }, [layer.x, layer.y, layer.scale, layer.rotation, tx, ty, sc, rot]);

  const commit = () => {
    'worklet';
    runOnJS(onCommit)(layer.id, { x: tx.value, y: ty.value, scale: sc.value, rotation: rot.value });
  };

  const pan = Gesture.Pan()
    .averageTouches(true) // com 2 dedos, o pan segue o ponto médio (combina com pinch)
    .onStart(() => {
      startX.value = tx.value;
      startY.value = ty.value;
      pressed.value = withTiming(1, { duration: 120 });
      runOnJS(onSelect)(layer.id);
    })
    .onUpdate((e) => {
      tx.value = startX.value + e.translationX;
      ty.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      pressed.value = withTiming(0, { duration: 160 });
      commit();
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startS.value = sc.value;
    })
    .onUpdate((e) => {
      sc.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startS.value * e.scale));
    })
    .onEnd(() => {
      // "rubber band": se passou do limite durante o gesto, volta com mola
      if (sc.value <= MIN_SCALE) sc.value = withSpring(MIN_SCALE * 1.5);
      commit();
    });

  const rotate = Gesture.Rotation()
    .onStart(() => {
      startR.value = rot.value;
      snapped.value = false;
    })
    .onUpdate((e) => {
      const raw = startR.value + e.rotation;
      const nearest = Math.round(raw / SNAP_ANGLE) * SNAP_ANGLE;
      const isSnap = Math.abs(raw - nearest) < SNAP_EPS;
      rot.value = isSnap ? nearest : raw;
      if (isSnap && !snapped.value) runOnJS(haptic)();
      snapped.value = isSnap;
    })
    .onEnd(commit);

  const tap = Gesture.Tap().onEnd(() => runOnJS(onSelect)(layer.id));

  // Os três gestos de transformação rodam juntos; o tap só ganha se nada mais ativar.
  const gesture = Gesture.Exclusive(Gesture.Simultaneous(pan, pinch, rotate), tap);

  const layerOpacity = layer.opacity ?? 1;
  const style = useAnimatedStyle(() => {
    const visible = playheadMs.value >= layer.startMs && playheadMs.value <= layer.endMs;
    return {
      opacity: visible ? layerOpacity : 0,
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        { rotate: `${rot.value}rad` },
        { scale: sc.value * (1 + pressed.value * 0.03) },
      ],
    };
  });

  const frameStyle = useAnimatedStyle(() => ({
    // compensa a escala para a borda continuar com 1px visual
    borderWidth: selected ? 1 / sc.value : 0,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.wrap,
          { width: layer.width, height: layer.height, marginLeft: -layer.width / 2, marginTop: -layer.height / 2, zIndex: layer.zIndex },
          style,
        ]}
      >
        <Image
          source={{ uri: layer.uri }}
          style={[StyleSheet.absoluteFill, layer.flipX && { transform: [{ scaleX: -1 }] }]}
          contentFit="contain"
          transition={120}
        />
        <Animated.View pointerEvents="none" style={[styles.frame, frameStyle]} />
      </Animated.View>
    </GestureDetector>
  );
}

export const TransformableSticker = memo(TransformableStickerBase);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: '50%', top: '50%' },
  frame: {
    ...StyleSheet.absoluteFill,
    borderColor: COLORS.ACCENT_COLOR,
    borderStyle: 'dashed',
    borderRadius: 4,
  },
});
