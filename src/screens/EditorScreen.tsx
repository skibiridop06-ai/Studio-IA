/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Editor — Header, Canvas (Skia), barra da camada, Timeline e Ferramentas.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Modelo de threads:
 *   • UI thread  : gestos, playhead, seek, paused, volume (SharedValues)
 *   • JS thread  : estado comitado (zustand), painéis, FFmpeg/IA
 *   • Nativas    : decoder de vídeo, FFmpeg, raster Skia
 */
import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue, runOnUI, withTiming, cancelAnimation, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, HAIRLINE, RADIUS, SPACING, TYPE, GLOW } from '../theme';
import { ASPECT_RATIO, useEditor, type ToolId } from '../store/editorStore';
import { useProjects } from '../store/projectsStore';
import { EditorCanvas } from '../components/EditorCanvas';
import { Timeline } from '../components/Timeline';
import { Sheet, Slider, Toolbox } from '../components/ui';
import { AIPanel, AdjustPanel, CutPanel, EffectsPanel, ExportPanel, FormatPanel, TextPanel } from '../components/ToolPanels';
import { StickerLibrary, type PickedSticker } from '../stickers/StickerLibrary';
import { getEffect } from '../engine/effects';

const DEFAULT_STICKER_MS = 3000;
const STICKER_BASE = 140;

export interface EditorProps {
  onExit: () => void;
  initialTool?: ToolId | null;
  initialEffect?: string | null;
}

const TITLES: Record<ToolId, string> = {
  cut: 'Corte viral',
  audio: 'Áudio',
  text: 'Texto',
  effects: 'Efeitos',
  filters: 'Ajustes',
  ai: 'IA',
  stickers: 'Figurinhas',
  format: 'Formato',
};
const SHEET_HEIGHT: Partial<Record<ToolId, `${number}%`>> = {
  stickers: '75%',
  text: '70%',
  effects: '55%',
  format: '32%',
  filters: '42%',
};

export function EditorScreen({ onExit, initialTool, initialEffect }: EditorProps) {
  const { width: SW, height: SH } = useWindowDimensions();
  const media = useEditor((s) => s.media);
  const aspect = useEditor((s) => s.aspect);
  const activeTool = useEditor((s) => s.activeTool);
  const setTool = useEditor((s) => s.setTool);
  const addSticker = useEditor((s) => s.addSticker);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setPlaying = useEditor((s) => s.setPlaying);
  const selected = useEditor((s) => s.stickers.find((x) => x.id === s.selectedId));
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const effectName = getEffect(useEditor((s) => s.effectId)).name;

  const playheadMs = useSharedValue(0);
  const paused = useSharedValue(true);
  const seek = useSharedValue<number | null>(null);
  const volume = useSharedValue(1);
  const isScrubbing = useSharedValue(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  // Canvas no formato do projeto, cabendo entre header e timeline
  const ratio = ASPECT_RATIO[aspect];
  const maxW = SW - SPACING.xl * 2;
  const maxH = SH * 0.46;
  const canvasW = Math.min(maxW, maxH * ratio);
  const canvasH = canvasW / ratio;

  // ── Entrada / saída ────────────────────────────────────────────
  useEffect(() => {
    useEditor.getState().resetHistory();
    if (initialEffect) {
      const e = getEffect(initialEffect);
      useEditor.getState().setEffect(e.id, e.adjust);
      useEditor.getState().resetHistory();
    }
    if (initialTool) useEditor.setState({ activeTool: initialTool });
  }, [initialTool, initialEffect]);

  const exit = useCallback(async () => {
    paused.value = true;
    setPlaying(false);
    await useProjects.getState().saveCurrent();
    useEditor.setState({ activeTool: null, selectedId: null });
    onExit();
  }, [onExit, paused, setPlaying]);

  useEffect(() => {
    if (!media) onExit();
  }, [media, onExit]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (useEditor.getState().activeTool) {
        useEditor.setState({ activeTool: null });
        return true;
      }
      exit();
      return true;
    });
    return () => sub.remove();
  }, [exit]);

  // salvamento automático a cada 20 s
  useEffect(() => {
    const t = setInterval(() => useProjects.getState().saveCurrent(), 20_000);
    return () => clearInterval(t);
  }, []);

  // ── Ações ──────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const next = !isPlaying;
    setPlaying(next);
    const isImage = media?.kind === 'image';
    const total = media?.durationMs ?? 0;
    runOnUI((p: boolean) => {
      'worklet';
      paused.value = !p;
      if (isImage) {
        if (p) {
          const from = playheadMs.value >= total ? 0 : playheadMs.value;
          playheadMs.value = from;
          playheadMs.value = withTiming(total, { duration: total - from, easing: Easing.linear });
        } else cancelAnimation(playheadMs);
      }
    })(next);
  }, [isPlaying, setPlaying, paused, media?.kind, media?.durationMs, playheadMs]);

  const insertSticker = useCallback(
    (s: PickedSticker) => {
      const at = playheadMs.value;
      const r = s.width / Math.max(1, s.height);
      const base = Math.min(STICKER_BASE * (s.width > 600 ? 1.6 : 1), canvasW * 0.8);
      const w = r >= 1 ? base : base * r;
      const h = r >= 1 ? base / r : base;
      const dur = media?.durationMs ?? DEFAULT_STICKER_MS;
      const isImage = media?.kind === 'image';
      addSticker({
        uri: s.uri,
        width: w,
        height: h,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        // em foto, a camada vale o projeto inteiro
        startMs: isImage ? 0 : Math.min(at, Math.max(0, dur - 500)),
        endMs: isImage ? dur : Math.min(dur, at + DEFAULT_STICKER_MS),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      useEditor.setState({ activeTool: null });
    },
    [addSticker, media?.durationMs, media?.kind, playheadMs, canvasW],
  );

  const onTool = useCallback(
    (t: ToolId) => {
      if (t === 'audio') {
        const m = !muted;
        setMuted(m);
        volume.value = m ? 0 : 1;
        return;
      }
      setTool(t);
    },
    [muted, setTool, volume],
  );

  if (!media) return <View style={styles.root} />;
  const st = useEditor.getState();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={exit} hitSlop={12} style={styles.hBtn}>
          <Feather name="chevron-left" size={24} color={COLORS.TEXT_PRIMARY} />
        </Pressable>
        <Pressable onPress={() => setTool('format')} style={styles.pill}>
          <Feather name="crop" size={12} color={COLORS.TEXT_PRIMARY} />
          <Text style={styles.pillText}>{aspect}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: SPACING.md, alignItems: 'center' }}>
          <Pressable onPress={st.undo} disabled={!canUndo} hitSlop={8}>
            <Feather name="corner-up-left" size={19} color={canUndo ? COLORS.TEXT_PRIMARY : COLORS.TEXT_TERTIARY} />
          </Pressable>
          <Pressable onPress={st.redo} disabled={!canRedo} hitSlop={8}>
            <Feather name="corner-up-right" size={19} color={canRedo ? COLORS.TEXT_PRIMARY : COLORS.TEXT_TERTIARY} />
          </Pressable>
          <Pressable onPress={() => setExportOpen(true)} style={styles.export}>
            <Text style={styles.exportText}>Exportar</Text>
          </Pressable>
        </View>
      </View>

      {/* Canvas */}
      <View style={styles.canvasArea}>
        <EditorCanvas
          width={canvasW}
          height={canvasH}
          playheadMs={playheadMs}
          paused={paused}
          seek={seek}
          volume={volume}
          isScrubbing={isScrubbing}
        />
        {effectName !== 'Original' && (
          <View style={styles.fxBadge}>
            <Feather name="star" size={10} color={COLORS.TEXT_PRIMARY} />
            <Text style={styles.fxBadgeText}>{effectName}</Text>
          </View>
        )}
        {muted && (
          <View style={styles.mutedBadge}>
            <Feather name="volume-x" size={12} color={COLORS.TEXT_PRIMARY} />
          </View>
        )}
      </View>

      {/* Barra da camada selecionada */}
      {selected ? (
        <View style={styles.layerBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.layerActions}>
            <LayerBtn icon="copy" label="Duplicar" onPress={() => st.duplicateSticker(selected.id)} />
            <LayerBtn icon="layers" label="Frente" onPress={() => st.bringToFront(selected.id)} />
            <LayerBtn icon="repeat" label="Espelhar" onPress={() => st.updateSticker(selected.id, { flipX: !selected.flipX })} />
            <LayerBtn icon="rotate-ccw" label="Resetar" onPress={() => st.updateSticker(selected.id, { scale: 1, rotation: 0, x: 0, y: 0 })} />
            <LayerBtn icon="cpu" label="IA" onPress={() => setTool('ai')} />
            <LayerBtn icon="trash-2" label="Excluir" onPress={() => st.removeSticker(selected.id)} />
          </ScrollView>
          <View style={{ paddingHorizontal: SPACING.lg }}>
            <Slider
              label="Opacidade"
              icon="eye"
              min={5}
              max={100}
              value={Math.round((selected.opacity ?? 1) * 100)}
              onChange={(v) => st.updateSticker(selected.id, { opacity: v / 100 })}
            />
          </View>
        </View>
      ) : (
        <Timeline
          viewportWidth={SW}
          playheadMs={playheadMs}
          paused={paused}
          seek={seek}
          isScrubbing={isScrubbing}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onAddAtPlayhead={() => setTool('stickers')}
        />
      )}

      <Toolbox active={muted ? 'audio' : activeTool} onPress={onTool} />

      {/* Sheets */}
      <Sheet visible={exportOpen} onClose={() => setExportOpen(false)} title="Exportar" height="48%">
        <ExportPanel preview={{ w: canvasW, h: canvasH }} />
      </Sheet>

      <Sheet
        visible={!!activeTool && activeTool !== 'audio'}
        onClose={() => setTool(null)}
        title={activeTool ? TITLES[activeTool] : ''}
        height={(activeTool && SHEET_HEIGHT[activeTool]) || '45%'}
      >
        {activeTool === 'filters' && <AdjustPanel />}
        {activeTool === 'effects' && <EffectsPanel />}
        {activeTool === 'text' && <TextPanel onDone={insertSticker} />}
        {activeTool === 'stickers' && <StickerLibrary onPick={insertSticker} />}
        {activeTool === 'format' && <FormatPanel />}
        {activeTool === 'cut' && <CutPanel onClose={() => setTool(null)} />}
        {activeTool === 'ai' && <AIPanel onOpenCut={() => useEditor.setState({ activeTool: 'cut' })} />}
      </Sheet>
    </SafeAreaView>
  );
}

function LayerBtn({ icon, label, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.lBtn}>
      <Feather name={icon} size={18} color={COLORS.TEXT_PRIMARY} />
      <Text style={styles.lBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.BACKGROUND_PRINCIPAL },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  hBtn: { width: 36, height: 36, justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    height: 30,
    borderRadius: RADIUS.pill,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
  },
  pillText: { ...TYPE.label, color: COLORS.TEXT_PRIMARY, fontWeight: '600' },
  export: {
    paddingHorizontal: SPACING.md,
    height: 32,
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.ACCENT_COLOR,
    ...GLOW,
  },
  exportText: { fontSize: 12, fontWeight: '700', color: COLORS.ACCENT_INK },
  canvasArea: { flex: 1, justifyContent: 'center' },
  fxBadge: {
    position: 'absolute',
    top: SPACING.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.SCRIM,
  },
  fxBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.TEXT_PRIMARY },
  mutedBadge: {
    position: 'absolute',
    left: SPACING.lg,
    bottom: SPACING.md,
    padding: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
  },
  layerBar: { paddingTop: SPACING.sm, borderTopWidth: HAIRLINE, borderColor: COLORS.BORDER_COLOR, minHeight: 150 },
  layerActions: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  lBtn: {
    width: 66,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
  },
  lBtnText: { fontSize: 10, color: COLORS.TEXT_SECONDARY, fontWeight: '500' },
});
