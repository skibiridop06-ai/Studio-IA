/**
 * Painéis das ferramentas da Toolbox (cada um abre num Sheet).
 */
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Skia, matchFont, ImageFormat } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, HAIRLINE, RADIUS, RESOLUTIONS, SPACING, TYPE } from '../theme';
import { useEditor, type ColorAdjust } from '../store/editorStore';
import { ActionRow, PrimaryButton, ProgressBar, Slider } from './ui';
import { exportProject, syncToViralReference, FFmpegError, cancelAll } from '../engine/ffmpegEngine';
import { useLocalAI } from '../engine/localAI';

// ───────────────────────────── Filtros (ajustes) ────────────────────────────

export function AdjustPanel() {
  const adjust = useEditor((s) => s.adjust);
  const setAdjust = useEditor((s) => s.setAdjust);
  return (
    <View>
      <Slider label="Brilho" icon="sun" value={adjust.brightness} onChange={(v) => setAdjust({ brightness: v })} />
      <Slider label="Contraste" icon="circle" value={adjust.contrast} onChange={(v) => setAdjust({ contrast: v })} />
      <Slider label="Saturação" icon="droplet" value={adjust.saturation} onChange={(v) => setAdjust({ saturation: v })} />
      <Slider label="Temperatura" icon="thermometer" value={adjust.temperature} onChange={(v) => setAdjust({ temperature: v })} />
      <Pressable
        onPress={() => setAdjust({ brightness: 0, contrast: 0, saturation: 0, temperature: 0 })}
        style={{ alignSelf: 'flex-end', marginTop: SPACING.sm }}
      >
        <Text style={TYPE.label}>Redefinir</Text>
      </Pressable>
    </View>
  );
}

// ───────────────────────────── Efeitos (presets) ────────────────────────────

export interface EffectPreset {
  name: string;
  adjust: ColorAdjust;
  blur: number;
  vignette: boolean;
}

export const EFFECTS: EffectPreset[] = [
  { name: 'Original', adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0 }, blur: 0, vignette: false },
  { name: 'Flash Preto', adjust: { brightness: -10, contrast: 55, saturation: -100, temperature: 0 }, blur: 0, vignette: true },
  { name: 'Noite', adjust: { brightness: -20, contrast: 25, saturation: -40, temperature: -45 }, blur: 0, vignette: true },
  { name: 'Vintage', adjust: { brightness: 5, contrast: -15, saturation: -35, temperature: 40 }, blur: 0, vignette: true },
  { name: 'Desfoque', adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0 }, blur: 8, vignette: false },
  { name: 'Brilho', adjust: { brightness: 30, contrast: 10, saturation: 10, temperature: 5 }, blur: 1.5, vignette: false },
  { name: 'Luz Fria', adjust: { brightness: 5, contrast: 15, saturation: -20, temperature: -70 }, blur: 0, vignette: true },
  { name: 'Granulado', adjust: { brightness: -5, contrast: 40, saturation: -60, temperature: 10 }, blur: 0.6, vignette: true },
];

export function EffectsPanel({ current, onApply }: { current: string; onApply: (p: EffectPreset) => void }) {
  return (
    <View style={p.grid}>
      {EFFECTS.map((e) => (
        <Pressable key={e.name} onPress={() => onApply(e)} style={[p.tile, current === e.name && p.tileOn]}>
          <Text style={[TYPE.label, current === e.name && { color: COLORS.ACCENT_INK }]}>{e.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ───────────────────────────── Texto → figurinha (render Skia offscreen) ────

/**
 * Rasteriza o texto numa superfície Skia fora da tela e salva como PNG
 * transparente. Assim, texto vira uma figurinha comum: mesmos gestos, mesmo
 * pipeline de export no FFmpeg (overlay) — sem precisar de drawtext/fontes no
 * build do FFmpeg.
 */
async function renderTextSticker(text: string, outlined: boolean) {
  const font = matchFont({
    fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif-condensed' }),
    fontSize: 140,
    fontWeight: 'bold',
  });
  const lines = text.split('\n');
  const lineH = 150;
  const pad = 30;
  const W = Math.ceil(Math.max(...lines.map((l) => font.measureText(l).width)) + pad * 2);
  const H = lines.length * lineH + pad * 2;
  const surface = Skia.Surface.Make(W, H);
  if (!surface) throw new Error('Falha ao alocar superfície de texto.');
  const c = surface.getCanvas();

  const fill = Skia.Paint();
  fill.setColor(Skia.Color(COLORS.TEXT_PRIMARY));
  fill.setAntiAlias(true);
  const stroke = Skia.Paint();
  stroke.setColor(Skia.Color(COLORS.BACKGROUND_PRINCIPAL));
  stroke.setStyle(1); // PaintStyle.Stroke
  stroke.setStrokeWidth(10);
  stroke.setAntiAlias(true);

  lines.forEach((l, i) => {
    const x = (W - font.measureText(l).width) / 2;
    const y = pad + (i + 1) * lineH - 30;
    if (outlined) c.drawText(l, x, y, stroke, font);
    c.drawText(l, x, y, fill, font);
  });
  surface.flush();
  const img = surface.makeImageSnapshot();
  const uri = `${FileSystem.cacheDirectory}text_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(uri, img.encodeToBase64(ImageFormat.PNG, 100), { encoding: FileSystem.EncodingType.Base64 });
  return { uri, width: W, height: H };
}

export function TextPanel({ onDone }: { onDone: (s: { uri: string; width: number; height: number }) => void }) {
  const [text, setText] = useState('BETTER DAYS');
  const [outlined, setOutlined] = useState(true);
  return (
    <View style={{ gap: SPACING.md }}>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        style={p.textInput}
        placeholder="Digite seu texto"
        placeholderTextColor={COLORS.TEXT_SECONDARY}
      />
      <Pressable onPress={() => setOutlined((v) => !v)} style={[p.tile, { flex: 0 }, outlined && p.tileOn]}>
        <Text style={[TYPE.label, outlined && { color: COLORS.ACCENT_INK }]}>Contorno</Text>
      </Pressable>
      <PrimaryButton
        label="Adicionar texto"
        disabled={!text.trim()}
        onPress={async () => {
          try {
            onDone(await renderTextSticker(text.trim().toUpperCase(), outlined));
          } catch (e) {
            Alert.alert('Erro', (e as Error).message);
          }
        }}
      />
    </View>
  );
}

// ───────────────────────────── Cortar: Viral Sync ───────────────────────────

export function CutPanel({ onClose }: { onClose: () => void }) {
  const media = useEditor((s) => s.media);
  const resolution = useEditor((s) => s.resolution);
  const setMedia = useEditor((s) => s.setMedia);
  const setCutPoints = useEditor((s) => s.setCutPoints);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [running, setRunning] = useState(false);

  const start = async () => {
    if (!media || media.kind !== 'video') return;
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (pick.canceled) return;
    setRunning(true);
    try {
      const res = await syncToViralReference(pick.assets[0].uri, media.uri, {
        render: true,
        target: RESOLUTIONS[resolution],
        onProgress: (r, s) => {
          setProgress(r);
          setStage(s);
        },
      });
      if (res.outputUri) {
        const total = res.plan.reduce((a, s) => a + (s.srcEndMs - s.srcStartMs), 0);
        setMedia({ ...media, uri: res.outputUri, durationMs: total });
        setCutPoints(res.plan.map((s) => s.outStartMs).filter((t) => t > 0));
      }
      onClose();
    } catch (e) {
      const err = e as FFmpegError;
      Alert.alert('Não foi possível sincronizar', err.message);
      if (__DEV__) console.warn('[FFmpeg]', err.stage, err.returnCode, err.logTail);
    } finally {
      setRunning(false);
    }
  };

  const STAGE_LABEL: Record<string, string> = {
    'scene-detect': 'Detectando mudanças de cena…',
    'viral-render': 'Montando o vídeo no ritmo…',
    done: 'Pronto',
  };

  return (
    <View>
      <Text style={[TYPE.label, { marginBottom: SPACING.md, lineHeight: 16 }]}>
        Escolha um vídeo viral como referência. Os cortes dele são detectados no aparelho e o seu vídeo é
        remontado no mesmo ritmo, com a música da referência.
      </Text>
      {running ? (
        <>
          <Text style={TYPE.body}>{STAGE_LABEL[stage] ?? 'Processando…'}</Text>
          <ProgressBar value={progress} />
          <Pressable onPress={cancelAll}>
            <Text style={TYPE.label}>Cancelar</Text>
          </Pressable>
        </>
      ) : (
        <PrimaryButton label="Escolher vídeo referência" onPress={start} disabled={media?.kind !== 'video'} />
      )}
    </View>
  );
}

// ───────────────────────────── IA Local ─────────────────────────────────────

export function AIPanel() {
  const stickers = useEditor((s) => s.stickers);
  const selectedId = useEditor((s) => s.selectedId);
  const updateSticker = useEditor((s) => s.updateSticker);
  const media = useEditor((s) => s.media);
  const setMedia = useEditor((s) => s.setMedia);
  const ai = useLocalAI();
  const sel = stickers.find((s) => s.id === selectedId);

  return (
    <View>
      <ActionRow
        icon="scissors"
        title="Remover fundo"
        subtitle={sel ? 'Recorta a figurinha selecionada (U²-Net local)' : 'Selecione uma figurinha no canvas'}
        disabled={!sel || ai.status === 'running'}
        onPress={async () => {
          if (!sel) return;
          const r = await ai.removeBackground(sel.uri);
          if (r) updateSticker(sel.id, { uri: r.uri, height: sel.width * (r.height / r.width) });
        }}
      />
      <ActionRow
        icon="maximize"
        title="Super-resolução ×4"
        subtitle={sel ? 'Real-ESRGAN na figurinha selecionada' : media?.kind === 'image' ? 'Aplicar na foto de fundo' : 'Selecione uma figurinha ou use uma foto'}
        disabled={(!sel && media?.kind !== 'image') || ai.status === 'running'}
        onPress={async () => {
          if (sel) {
            const uri = await ai.superResolve(sel.uri);
            if (uri) updateSticker(sel.id, { uri });
          } else if (media?.kind === 'image') {
            const uri = await ai.superResolve(media.uri);
            if (uri) setMedia({ ...media, uri, width: media.width * 4, height: media.height * 4 });
          }
        }}
      />
      {(ai.status === 'loading-model' || ai.status === 'running') && (
        <>
          <Text style={TYPE.label}>{ai.status === 'loading-model' ? 'Carregando modelo…' : 'Processando no aparelho…'}</Text>
          <ProgressBar value={ai.progress} />
        </>
      )}
      {ai.status === 'error' && <Text style={[TYPE.label, { color: COLORS.DANGER }]}>{ai.error}</Text>}
    </View>
  );
}

// ───────────────────────────── Exportar ─────────────────────────────────────

export function ExportPanel({ preview }: { preview: { w: number; h: number } }) {
  const st = useEditor();
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');

  const run = async () => {
    if (!st.media) return;
    setState('running');
    try {
      const uri = await exportProject({
        mediaUri: st.media.uri,
        mediaKind: st.media.kind,
        durationMs: st.media.kind === 'image' ? Math.max(5000, ...st.stickers.map((s) => s.endMs)) : st.media.durationMs,
        preview,
        target: RESOLUTIONS[st.resolution],
        adjust: st.adjust,
        stickers: st.stickers,
        onProgress: (r) => setProgress(r),
      });
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (perm.granted) await MediaLibrary.saveToLibraryAsync(uri);
      setState('done');
    } catch (e) {
      setState('idle');
      const err = e as FFmpegError;
      Alert.alert('Falha na exportação', err.message);
      if (__DEV__) console.warn('[FFmpeg export]', err.logTail);
    }
  };

  return (
    <View style={{ gap: SPACING.md }}>
      <Text style={TYPE.overline}>Resolução</Text>
      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        {(Object.keys(RESOLUTIONS) as (keyof typeof RESOLUTIONS)[]).map((r) => (
          <Pressable key={r} onPress={() => st.setResolution(r)} style={[p.tile, st.resolution === r && p.tileOn]}>
            <Text style={[TYPE.label, st.resolution === r && { color: COLORS.ACCENT_INK }]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      {state === 'running' && <ProgressBar value={progress} />}
      {state === 'done' ? (
        <Text style={TYPE.body}>Salvo na galeria ✓</Text>
      ) : (
        <PrimaryButton label={state === 'running' ? `Exportando ${Math.round(progress * 100)}%` : 'Exportar'} onPress={run} disabled={state === 'running'} />
      )}
    </View>
  );
}

const p = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '22%',
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
    backgroundColor: COLORS.BACKGROUND_PRINCIPAL,
  },
  tileOn: { backgroundColor: COLORS.ACCENT_COLOR, borderColor: COLORS.ACCENT_COLOR },
  textInput: {
    minHeight: 64,
    color: COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    backgroundColor: COLORS.BACKGROUND_PRINCIPAL,
  },
});

