/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Editor Workspace — orquestra Header, Canvas (Skia), Timeline e Toolbox.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Modelo de threads:
 *   • UI thread  : gestos, playhead, seek, paused, volume (SharedValues)
 *   • JS thread  : estado comitado (zustand), painéis, chamadas FFmpeg/ONNX
 *   • Threads nativas: decoder de vídeo, FFmpeg, ONNX Runtime, raster Skia
 *
 *  O relógio de reprodução nunca passa pelo React: o `useVideo` escreve
 *  `currentTime` → `playheadMs` → Timeline rola via `scrollTo` (worklet) e as
 *  figurinhas calculam sua visibilidade (worklet). Zero re-render por frame.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue, runOnUI, withTiming, cancelAnimation, Easing } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { COLORS, HAIRLINE, RADIUS, SPACING, TYPE, GLOW } from '../theme';
import { useEditor, type ToolId } from '../store/editorStore';
import { EditorCanvas } from '../components/EditorCanvas';
import { Timeline } from '../components/Timeline';
import { EditorHeader, Sheet, Toolbox } from '../components/ui';
import { AIPanel, AdjustPanel, CutPanel, EffectsPanel, ExportPanel, TextPanel, type EffectPreset } from '../components/ToolPanels';
import { StickerLibrary, type PickedSticker } from '../stickers/StickerLibrary';

const DEFAULT_STICKER_MS = 3000;
const STICKER_BASE = 140; // lado maior da figurinha ao entrar no canvas (pt)

export function EditorScreen() {
  const { width: SW, height: SH } = useWindowDimensions();
  const media = useEditor((s) => s.media);
  const setMedia = useEditor((s) => s.setMedia);
  const resolution = useEditor((s) => s.resolution);
  const setResolution = useEditor((s) => s.setResolution);
  const activeTool = useEditor((s) => s.activeTool);
  const setTool = useEditor((s) => s.setTool);
  const addSticker = useEditor((s) => s.addSticker);
  const setAdjust = useEditor((s) => s.setAdjust);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlaying = useEditor((s) => s.setPlaying);

  // ── Estado da UI thread ─────────────────────────────────────────
  const playheadMs = useSharedValue(0);
  const paused = useSharedValue(true);
  const seek = useSharedValue<number | null>(null);
  const volume = useSharedValue(1);
  const isScrubbing = useSharedValue(false);

  const [stickersOpen, setStickersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [effect, setEffect] = useState<EffectPreset | null>(null);
  const [muted, setMuted] = useState(false);

  // Canvas 9:16 que cabe entre header e timeline
  const canvasH = Math.min(SH * 0.5, (SW - SPACING.xl * 2) * (16 / 9));
  const canvasW = canvasH * (9 / 16);

  // ── Ações ───────────────────────────────────────────────────────
  const importMedia = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos', 'images'], quality: 1 });
    if (res.canceled) return;
    const a = res.assets[0];
    setMedia({
      uri: a.uri,
      kind: a.type === 'video' ? 'video' : 'image',
      durationMs: a.type === 'video' ? Math.max(500, a.duration ?? 0) : 10_000,
      width: a.width,
      height: a.height,
    });
    playheadMs.value = 0;
  }, [setMedia, playheadMs]);

  const togglePlay = useCallback(() => {
    const next = !isPlaying;
    setPlaying(next);
    const isImage = media?.kind === 'image';
    const total = media?.durationMs ?? 0;
    runOnUI((p: boolean) => {
      'worklet';
      paused.value = !p;
      // Foto não tem relógio de decoder: o playhead é animado direto na UI thread
      if (isImage) {
        if (p) {
          const from = playheadMs.value >= total ? 0 : playheadMs.value;
          playheadMs.value = from;
          playheadMs.value = withTiming(total, { duration: total - from, easing: Easing.linear });
        } else cancelAnimation(playheadMs);
      }
    })(next);
  }, [isPlaying, setPlaying, paused, media?.kind, media?.durationMs, playheadMs]);

  /** Insere a figurinha na posição da agulha, centralizada, proporcional. */
  const insertSticker = useCallback(
    (s: PickedSticker | { uri: string; width: number; height: number }) => {
      const at = playheadMs.value;
      const ratio = s.width / Math.max(1, s.height);
      const w = ratio >= 1 ? STICKER_BASE : STICKER_BASE * ratio;
      const h = ratio >= 1 ? STICKER_BASE / ratio : STICKER_BASE;
      const dur = media?.durationMs ?? DEFAULT_STICKER_MS;
      addSticker({
        uri: s.uri,
        width: w,
        height: h,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        startMs: Math.min(at, Math.max(0, dur - 500)),
        endMs: Math.min(dur, at + DEFAULT_STICKER_MS),
      });
      setStickersOpen(false);
      setTool(null);
    },
    [addSticker, media?.durationMs, playheadMs, setTool],
  );

  const onTool = useCallback(
    (t: ToolId) => {
      if (t === 'audio') {
        // Áudio: alterna mudo direto na UI thread (sem painel)
        const m = !muted;
        setMuted(m);
        volume.value = m ? 0 : 1;
        return;
      }
      setTool(t);
    },
    [muted, setTool, volume],
  );

  const applyEffect = (p: EffectPreset) => {
    setEffect(p);
    setAdjust(p.adjust);
  };

  // ── Estado vazio ────────────────────────────────────────────────
  if (!media) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.empty}>
          <Text style={TYPE.overline}>Studio IA</Text>
          <Pressable onPress={importMedia} style={styles.newProject}>
            <Feather name="plus" size={28} color={COLORS.TEXT_PRIMARY} />
            <Text style={[TYPE.label, { color: COLORS.TEXT_PRIMARY, marginTop: SPACING.sm }]}>Novo Projeto</Text>
          </Pressable>
          <Text style={[TYPE.label, { textAlign: 'center' }]}>Tudo é processado no seu aparelho.{'\n'}Nada é enviado para servidores.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const titles: Record<ToolId, string> = {
    cut: 'Corte automático',
    audio: 'Áudio',
    text: 'Texto',
    effects: 'Efeitos',
    filters: 'Ajustes',
    ai: 'IA Local',
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <EditorHeader
        resolution={resolution}
        onResolution={setResolution}
        onClose={() => {
          paused.value = true;
          setPlaying(false);
          useEditor.setState({ media: null, stickers: [], selectedId: null, cutPoints: [] });
        }}
        onExport={() => setExportOpen(true)}
      />

      <View style={styles.canvasArea}>
        <EditorCanvas
          width={canvasW}
          height={canvasH}
          playheadMs={playheadMs}
          paused={paused}
          seek={seek}
          volume={volume}
          isScrubbing={isScrubbing}
          blur={effect?.blur ?? 0}
          vignette={effect?.vignette ?? false}
        />
        <Pressable style={styles.stickerFab} onPress={() => setStickersOpen(true)}>
          <Feather name="smile" size={16} color={COLORS.TEXT_PRIMARY} />
        </Pressable>
        {muted && (
          <View style={styles.mutedBadge}>
            <Feather name="volume-x" size={12} color={COLORS.TEXT_PRIMARY} />
          </View>
        )}
      </View>

      <Timeline
        viewportWidth={SW}
        playheadMs={playheadMs}
        paused={paused}
        seek={seek}
        isScrubbing={isScrubbing}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onAddAtPlayhead={() => setStickersOpen(true)}
      />

      <Toolbox active={muted ? 'audio' : activeTool} onPress={onTool} />

      {/* ── Sheets ───────────────────────────────────────────── */}
      <Sheet visible={stickersOpen} onClose={() => setStickersOpen(false)} title="Figurinhas" height="75%">
        <StickerLibrary onPick={insertSticker} />
      </Sheet>

      <Sheet visible={exportOpen} onClose={() => setExportOpen(false)} title="Exportar" height="38%">
        <ExportPanel preview={{ w: canvasW, h: canvasH }} />
      </Sheet>

      <Sheet
        visible={!!activeTool && activeTool !== 'audio'}
        onClose={() => setTool(null)}
        title={activeTool ? titles[activeTool] : ''}
        height={activeTool === 'effects' ? '40%' : '45%'}
      >
        {activeTool === 'filters' && <AdjustPanel />}
        {activeTool === 'effects' && <EffectsPanel current={effect?.name ?? 'Original'} onApply={applyEffect} />}
        {activeTool === 'text' && <TextPanel onDone={insertSticker} />}
        {activeTool === 'cut' && <CutPanel onClose={() => setTool(null)} />}
        {activeTool === 'ai' && <AIPanel />}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.BACKGROUND_PRINCIPAL },
  canvasArea: { flex: 1, justifyContent: 'center' },
  stickerFab: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: SPACING.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedBadge: {
    position: 'absolute',
    left: SPACING.lg,
    bottom: SPACING.md,
    padding: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.xl, padding: SPACING.xl },
  newProject: {
    width: 160,
    height: 160,
    borderRadius: RADIUS.lg,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    alignItems: 'center',
    justifyContent: 'center',
    ...GLOW,
    shadowOpacity: 0.08,
  },
});
