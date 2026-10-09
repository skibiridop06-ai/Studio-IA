/**
 * Linha do tempo estilo CapCut: agulha fixa no centro, a trilha rola por baixo.
 *
 *  - Régua com marcação maior a cada 1 s (rótulo em ms) e menor a cada 250 ms.
 *  - Faixa de frames gerada localmente (expo-video-thumbnails, decoder nativo).
 *  - Trilhas de figurinhas abaixo da faixa principal.
 *  - Marcadores de corte (beat-sync) desenhados sobre a faixa.
 *
 *  Sincronização bidirecional sem ponte JS:
 *   tocando  → playheadMs (UI) → useAnimatedReaction → scrollTo (UI)
 *   arrastando → onScroll (worklet) → playheadMs + seek (UI) → Skia useVideo
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import Animated, {
  scrollTo,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  type SharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Feather } from '@expo/vector-icons';
import { COLORS, HAIRLINE, RADIUS, SPACING, TYPE, GLOW } from '../theme';
import { useEditor } from '../store/editorStore';

export const PX_PER_SEC = 64;
const PX_PER_MS = PX_PER_SEC / 1000;
const FRAME_W = 40;
const STRIP_H = 52;

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

function fmt(ms: number) {
  'worklet';
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

interface Props {
  viewportWidth: number;
  playheadMs: SharedValue<number>;
  paused: SharedValue<boolean>;
  seek: SharedValue<number | null>;
  isScrubbing: SharedValue<boolean>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onAddAtPlayhead: () => void;
}

export function Timeline({ viewportWidth, playheadMs, paused, seek, isScrubbing, isPlaying, onTogglePlay, onAddAtPlayhead }: Props) {
  const media = useEditor((s) => s.media);
  const stickers = useEditor((s) => s.stickers);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const cutPoints = useEditor((s) => s.cutPoints);
  const durationMs = media?.durationMs ?? 0;
  const trackW = durationMs * PX_PER_MS;
  const half = viewportWidth / 2;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [thumbs, setThumbs] = useState<string[]>([]);

  // ── Geração local de frames da faixa ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setThumbs([]);
    if (!media) return;
    const count = Math.max(1, Math.ceil(trackW / FRAME_W));
    if (media.kind === 'image') {
      setThumbs(Array(count).fill(media.uri));
      return;
    }
    (async () => {
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(media.uri, {
            time: Math.min(durationMs - 1, (i * FRAME_W) / PX_PER_MS),
            quality: 0.3,
          });
          out.push(uri);
        } catch {
          out.push(out[out.length - 1] ?? '');
        }
        // publica em lotes para a faixa "aparecer" progressivamente
        if (!cancelled && (i % 6 === 5 || i === count - 1)) setThumbs([...out]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [media, trackW, durationMs]);

  // ── Scroll do usuário → playhead/seek ─────────────────────────────
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      isScrubbing.value = true;
      paused.value = true;
    },
    onScroll: (e) => {
      if (!isScrubbing.value) return;
      const ms = Math.max(0, Math.min(durationMs, e.contentOffset.x / PX_PER_MS));
      playheadMs.value = ms;
      seek.value = ms;
    },
    onMomentumEnd: () => {
      isScrubbing.value = false;
    },
    onEndDrag: (e) => {
      if (e.velocity && Math.abs(e.velocity.x) > 0.05) return; // espera o momentum
      isScrubbing.value = false;
    },
  });

  // ── Playhead → scroll (durante reprodução) ────────────────────────
  useAnimatedReaction(
    () => playheadMs.value,
    (ms) => {
      if (!isScrubbing.value) scrollTo(scrollRef, ms * PX_PER_MS, 0, false);
    },
  );

  const timeProps = useAnimatedProps(() => {
    const text = `${fmt(playheadMs.value)} / ${fmt(durationMs)}`;
    return { text, defaultValue: text } as any;
  });

  // ── Régua ─────────────────────────────────────────────────────────
  const ticks = useMemo(() => {
    const arr: { x: number; major: boolean; label?: string }[] = [];
    for (let ms = 0; ms <= durationMs; ms += 250) {
      const major = ms % 1000 === 0;
      arr.push({ x: ms * PX_PER_MS, major, label: major ? `${ms}ms` : undefined });
    }
    return arr;
  }, [durationMs]);

  return (
    <View style={styles.root}>
      {/* Transporte */}
      <View style={styles.transport}>
        <AnimatedInput editable={false} underlineColorAndroid="transparent" style={styles.time} animatedProps={timeProps} />
        <Pressable onPress={onTogglePlay} hitSlop={12} style={styles.playBtn}>
          <Feather name={isPlaying ? 'pause' : 'play'} size={18} color={COLORS.TEXT_PRIMARY} />
        </Pressable>
        <Text style={styles.cutsInfo}>{cutPoints.length ? `${cutPoints.length} cortes` : ''}</Text>
      </View>

      <View>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: half }}
        >
          <View style={{ width: trackW }}>
            {/* Régua em ms */}
            <View style={styles.ruler}>
              {ticks.map((t) => (
                <View key={t.x} style={[styles.tick, { left: t.x, height: t.major ? 8 : 4 }]}>
                  {t.label && <Text style={styles.tickLabel}>{t.label}</Text>}
                </View>
              ))}
            </View>

            {/* Faixa de frames */}
            <View style={styles.strip}>
              {thumbs.map((u, i) => (
                <Image key={i} source={u ? { uri: u } : undefined} style={styles.frame} contentFit="cover" />
              ))}
              {cutPoints.map((ms) => (
                <View key={`cut_${ms}`} style={[styles.cut, { left: ms * PX_PER_MS }]} />
              ))}
            </View>

            {/* Trilhas de figurinhas */}
            <View style={styles.layers}>
              {stickers.map((s, row) => (
                <Pressable
                  key={s.id}
                  onPress={() => select(s.id)}
                  style={[
                    styles.layerBar,
                    {
                      left: s.startMs * PX_PER_MS,
                      width: Math.max(12, (s.endMs - s.startMs) * PX_PER_MS),
                      top: (row % 3) * 16,
                    },
                    s.id === selectedId && styles.layerBarActive,
                  ]}
                >
                  <Image source={{ uri: s.uri }} style={styles.layerThumb} contentFit="contain" />
                </Pressable>
              ))}
            </View>
          </View>
        </Animated.ScrollView>

        {/* Agulha */}
        <View pointerEvents="none" style={[styles.needle, { left: half - 1 }]} />

        {/* [+] flutuante: adiciona elemento na posição da agulha */}
        <Pressable onPress={onAddAtPlayhead} style={styles.plus} hitSlop={8}>
          <Feather name="plus" size={18} color={COLORS.ACCENT_INK} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: SPACING.sm },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  time: { ...TYPE.mono, fontSize: 11, padding: 0, minWidth: 90 },
  playBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  cutsInfo: { ...TYPE.mono, minWidth: 90, textAlign: 'right' },
  ruler: { height: 18, borderBottomWidth: HAIRLINE, borderColor: COLORS.BORDER_COLOR },
  tick: { position: 'absolute', bottom: 0, width: HAIRLINE, backgroundColor: COLORS.TEXT_TERTIARY },
  tickLabel: { ...TYPE.mono, fontSize: 8, position: 'absolute', bottom: 9, left: 3, width: 60 },
  strip: {
    flexDirection: 'row',
    height: STRIP_H,
    marginTop: SPACING.xs,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
  },
  frame: { width: FRAME_W, height: STRIP_H, opacity: 0.85 },
  cut: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: COLORS.ACCENT_COLOR, opacity: 0.8 },
  layers: { height: 52, marginTop: SPACING.xs },
  layerBar: {
    position: 'absolute',
    height: 14,
    borderRadius: 4,
    backgroundColor: COLORS.BACKGROUND_ELEVATED,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
    justifyContent: 'center',
    paddingLeft: 2,
  },
  layerBarActive: { borderColor: COLORS.ACCENT_COLOR, backgroundColor: COLORS.BORDER_STRONG },
  layerThumb: { width: 10, height: 10 },
  needle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
    backgroundColor: COLORS.ACCENT_COLOR,
    ...GLOW,
  },
  plus: {
    position: 'absolute',
    right: SPACING.lg,
    top: 22 + STRIP_H / 2 - 16,
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.ACCENT_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    ...GLOW,
  },
});
