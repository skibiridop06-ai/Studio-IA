/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Visualizador central — Skia (GPU) + camada de figurinhas (Reanimated)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Como um frame chega na tela:
 *
 *   1. DECODE   `useVideo` usa o decoder de hardware do SO (AVPlayer /
 *               MediaCodec). O frame decodificado NÃO volta para o JS: ele é
 *               embrulhado como `SkImage` apontando para a textura de GPU
 *               (zero-copy) e escrito num SharedValue `currentFrame`.
 *
 *   2. RECORD   O <Canvas> não é redesenhado pelo React. A árvore declarativa
 *               (Image → ColorMatrix → Blur → gradiente) vira uma *display list*
 *               (SkPicture) gravada uma vez. Quando um SharedValue muda, só o
 *               nó dependente é atualizado na UI thread.
 *
 *   3. RASTER   Skia (Ganesh/Graphite sobre Metal ou Vulkan/GL) executa a
 *               display list: amostra a textura do vídeo, aplica a matriz de cor
 *               4×5 num único fragment shader (ColorMatrix é fundida no shader
 *               de amostragem — custo ~zero), desfoque gaussiano em 2 passes
 *               separáveis, e compõe a vinheta em um passe extra.
 *
 *   4. PRESENT  O resultado é apresentado no CAMetalLayer / SurfaceView
 *               sincronizado ao vsync — 60/90/120 Hz conforme o display.
 *
 *  As figurinhas ficam numa camada separada de Animated.Views POR CIMA do
 *  canvas: cada uma é uma layer do compositor nativo, transformada por matriz
 *  na GPU, então centenas delas não invalidam o canvas do vídeo.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import {
  Canvas,
  Image as SkiaImage,
  ColorMatrix,
  Blur,
  Rect,
  RadialGradient,
  Group,
  useImage,
  useVideo,
  vec,
} from '@shopify/react-native-skia';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { COLORS, RADIUS, HAIRLINE } from '../theme';
import { useEditor, type ColorAdjust, type StickerLayer } from '../store/editorStore';
import { TransformableSticker } from './TransformableSticker';

interface Props {
  width: number;
  height: number;
  playheadMs: SharedValue<number>;
  paused: SharedValue<boolean>;
  seek: SharedValue<number | null>;
  volume: SharedValue<number>;
  isScrubbing: SharedValue<boolean>;
  blur: number;
  vignette: boolean;
}

/**
 * Compõe brilho/contraste/saturação/temperatura numa única matriz 4×5.
 * Multiplicar as matrizes na CPU (uma vez por ajuste) e mandar UMA matriz para a
 * GPU é mais barato que encadear 4 filtros: a GPU faz 20 MADs por pixel, só.
 */
export function buildColorMatrix({ brightness, contrast, saturation, temperature }: ColorAdjust): number[] {
  const b = brightness / 100 * 0.25; // offset normalizado 0..1
  const c = 1 + contrast / 100;
  const s = 1 + saturation / 100;
  const t = temperature / 100 * 0.12;
  // luminância Rec.709
  const lr = 0.2126, lg = 0.7152, lb = 0.0722;
  const sr = (1 - s) * lr, sg = (1 - s) * lg, sb = (1 - s) * lb;
  const off = (1 - c) / 2 + b; // contraste em torno de 0.5 + brilho
  return [
    c * (sr + s), c * sg, c * sb, 0, off + t,
    c * sr, c * (sg + s), c * sb, 0, off,
    c * sr, c * sg, c * (sb + s), 0, off - t,
    0, 0, 0, 1, 0,
  ];
}

export function EditorCanvas({ width, height, playheadMs, paused, seek, volume, isScrubbing, blur, vignette }: Props) {
  const media = useEditor((s) => s.media);
  const adjust = useEditor((s) => s.adjust);
  const stickers = useEditor((s) => s.stickers);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const updateSticker = useEditor((s) => s.updateSticker);

  // Hooks Skia não podem ser condicionais: passa null para o que não é usado.
  const video = useVideo(media?.kind === 'video' ? media.uri : null, { paused, seek, volume, looping: true });
  const still = useImage(media?.kind === 'image' ? media.uri : null);

  // Relógio do vídeo → playhead global (UI thread → UI thread, sem ponte)
  useAnimatedReaction(
    () => video.currentTime.value,
    (t) => {
      if (!isScrubbing.value && media?.kind === 'video') playheadMs.value = t;
    },
    [media?.kind],
  );

  const matrix = useMemo(() => buildColorMatrix(adjust), [adjust]);
  const sorted = useMemo<StickerLayer[]>(() => [...stickers].sort((a, b) => a.zIndex - b.zIndex), [stickers]);

  return (
    <View style={[styles.stage, { width, height }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group>
          {/* Grupo com layer: o filtro de cor e o blur são aplicados à textura inteira */}
          <SkiaImage
            image={media?.kind === 'video' ? video.currentFrame : still}
            x={0}
            y={0}
            width={width}
            height={height}
            fit="cover"
          >
            <ColorMatrix matrix={matrix} />
            {blur > 0 && <Blur blur={blur} mode="clamp" />}
          </SkiaImage>
        </Group>
        {vignette && (
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient
              c={vec(width / 2, height / 2)}
              r={Math.max(width, height) * 0.75}
              colors={['transparent', 'rgba(0,0,0,0.65)']}
              positions={[0.55, 1]}
            />
          </Rect>
        )}
      </Canvas>

      {/* toque no vazio desseleciona */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => select(null)} />

      {/* Camada de figurinhas (Animated.View por figurinha, transformada na GPU) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {sorted.map((layer) => (
          <TransformableSticker
            key={layer.id}
            layer={layer}
            selected={layer.id === selectedId}
            playheadMs={playheadMs}
            onSelect={select}
            onCommit={updateSticker}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    overflow: 'hidden',
    alignSelf: 'center',
  },
});
