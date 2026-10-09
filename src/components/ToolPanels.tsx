/**
 * Painéis das ferramentas (cada um abre num Sheet do editor).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import {
  Canvas,
  ColorMatrix,
  Image as SkImage,
  ImageFormat,
  RuntimeShader,
  Skia,
  matchFont,
  useImage,
  PaintStyle,
  StrokeJoin,
  BlurStyle,
} from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, HAIRLINE, RADIUS, RESOLUTIONS, SPACING, TYPE, GLOW, type Resolution } from '../theme';
import { ASPECT_RATIO, useEditor, type Aspect } from '../store/editorStore';
import { ActionRow, PrimaryButton, ProgressBar, Slider } from './ui';
import { exportProject, syncToViralReference, FFmpegError, cancelAll, targetFor } from '../engine/ffmpegEngine';
import { useLocalAI, aiAvailable } from '../engine/localAI';
import { EFFECTS, EFFECT_CATEGORIES, FX_SHADER, fxUniforms, getEffect, needsShader, type Effect, type EffectCategory } from '../engine/effects';
import { buildColorMatrix } from './EditorCanvas';

// ───────────────────────────── Ajustes ──────────────────────────────────────

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

// ───────────────────────────── Efeitos (com miniaturas ao vivo) ─────────────

/** Miniatura que aplica o efeito de verdade (mesmo shader do canvas) no quadro do projeto. */
function EffectThumb({ uri, effect, active }: { uri: string | null; effect: Effect; active: boolean }) {
  const img = useImage(uri);
  const W = 64;
  const H = 84;
  const matrix = useMemo(() => buildColorMatrix(effect.adjust), [effect]);
  return (
    <View style={[p.thumb, active && p.thumbOn]}>
      <Canvas style={{ width: W, height: H }}>
        {img && (
          <SkImage image={img} x={0} y={0} width={W} height={H} fit="cover">
            <ColorMatrix matrix={matrix} />
            {needsShader(effect) && (
              <RuntimeShader
                source={FX_SHADER}
                uniforms={fxUniforms(
                  { ...effect, amount: ['pixelate', 'rgbsplit', 'vhs', 'shake', 'bloom'].includes(effect.fx) ? effect.amount / 2.5 : effect.amount },
                  W,
                  H,
                  0.3,
                )}
              />
            )}
          </SkImage>
        )}
      </Canvas>
    </View>
  );
}

export function EffectsPanel() {
  const media = useEditor((s) => s.media);
  const effectId = useEditor((s) => s.effectId);
  const setEffect = useEditor((s) => s.setEffect);
  const [cat, setCat] = useState<EffectCategory | 'Tudo'>('Em alta');
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!media) return;
    if (media.kind === 'image') return setThumb(media.uri);
    VideoThumbnails.getThumbnailAsync(media.uri, { time: 0, quality: 0.4 })
      .then((r) => setThumb(r.uri))
      .catch(() => setThumb(null));
  }, [media]);

  const list = cat === 'Tudo' ? EFFECTS : EFFECTS.filter((e) => e.category === cat);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.chips}>
        {(['Tudo', ...EFFECT_CATEGORIES] as const).map((c) => (
          <Pressable key={c} onPress={() => setCat(c)} style={[p.chip, cat === c && p.chipOn]}>
            <Text style={[p.chipText, cat === c && { color: COLORS.ACCENT_INK }]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={p.fxGrid}>
        {list.map((e) => (
          <Pressable key={e.id} onPress={() => setEffect(e.id, e.adjust)} style={p.fxItem}>
            <EffectThumb uri={thumb} effect={e} active={effectId === e.id} />
            <Text numberOfLines={1} style={[p.fxName, effectId === e.id && { color: COLORS.TEXT_PRIMARY }]}>{e.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ───────────────────────────── Formato (estilo Canva) ───────────────────────

export const FORMATS: { aspect: Aspect; name: string; hint: string }[] = [
  { aspect: '9:16', name: 'Story / Reels', hint: 'TikTok, Reels, Shorts' },
  { aspect: '1:1', name: 'Post', hint: 'Quadrado' },
  { aspect: '4:5', name: 'Feed', hint: 'Instagram retrato' },
  { aspect: '16:9', name: 'YouTube', hint: 'Horizontal' },
];

export function FormatPanel() {
  const aspect = useEditor((s) => s.aspect);
  const setAspect = useEditor((s) => s.setAspect);
  return (
    <View style={p.formatRow}>
      {FORMATS.map((f) => {
        const r = ASPECT_RATIO[f.aspect];
        const box = 52;
        const w = r >= 1 ? box : box * r;
        const h = r >= 1 ? box / r : box;
        const on = aspect === f.aspect;
        return (
          <Pressable key={f.aspect} onPress={() => setAspect(f.aspect)} style={[p.formatItem, on && p.formatOn]}>
            <View style={{ height: box, justifyContent: 'center' }}>
              <View style={[p.formatBox, { width: w, height: h }, on && { borderColor: COLORS.ACCENT_COLOR }]} />
            </View>
            <Text style={[TYPE.label, on && { color: COLORS.TEXT_PRIMARY }]}>{f.aspect}</Text>
            <Text style={[TYPE.label, { fontSize: 9 }]}>{f.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────────────────────── Texto → camada PNG (Skia offscreen) ──────────

const FONTS = [
  { id: 'impact', label: 'Impacto', family: Platform.select({ ios: 'Impact', default: 'sans-serif-condensed' })!, weight: '900' as const },
  { id: 'clean', label: 'Limpa', family: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' })!, weight: '700' as const },
  { id: 'thin', label: 'Fina', family: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif-light' })!, weight: '300' as const },
  { id: 'serif', label: 'Clássica', family: Platform.select({ ios: 'Georgia', default: 'serif' })!, weight: '700' as const },
  { id: 'mono', label: 'Código', family: Platform.select({ ios: 'Menlo', default: 'monospace' })!, weight: '700' as const },
  { id: 'hand', label: 'Mão', family: Platform.select({ ios: 'Snell Roundhand', default: 'cursive' })!, weight: '400' as const },
  { id: 'casual', label: 'Casual', family: Platform.select({ ios: 'Chalkboard SE', default: 'casual' })!, weight: '400' as const },
];
const TEXT_STYLES = [
  { id: 'plain', label: 'Simples' },
  { id: 'outline', label: 'Contorno' },
  { id: 'box', label: 'Caixa' },
  { id: 'glow', label: 'Neon' },
  { id: 'shadow', label: 'Sombra' },
] as const;
type TextStyleId = (typeof TEXT_STYLES)[number]['id'];
const TEXT_COLORS = ['#FFFFFF', '#09090B', '#FF3B3B', '#FFD60A', '#22C55E', '#3B82F6', '#A855F7', '#FF5FA2'];

async function renderTextSticker(text: string, fontId: string, styleId: TextStyleId, color: string, upper: boolean) {
  const f = FONTS.find((x) => x.id === fontId) ?? FONTS[0];
  const font = matchFont({ fontFamily: f.family, fontSize: 140, fontWeight: f.weight });
  const lines = (upper ? text.toUpperCase() : text).split('\n');
  const lineH = 160;
  const pad = 48;
  const W = Math.ceil(Math.max(...lines.map((l) => font.measureText(l).width)) + pad * 2);
  const H = lines.length * lineH + pad * 2;
  const surface = Skia.Surface.Make(W, H);
  if (!surface) throw new Error('Falha ao criar o texto.');
  const c = surface.getCanvas();
  const isDark = color === '#09090B';

  if (styleId === 'box') {
    const bg = Skia.Paint();
    bg.setColor(Skia.Color(isDark ? '#FFFFFF' : '#09090B'));
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(pad * 0.4, pad * 0.4, W - pad * 0.8, H - pad * 0.8), 28, 28), bg);
  }

  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(color));

  lines.forEach((l, i) => {
    const x = (W - font.measureText(l).width) / 2;
    const y = pad + (i + 1) * lineH - 40;
    if (styleId === 'outline') {
      const st = Skia.Paint();
      st.setAntiAlias(true);
      st.setColor(Skia.Color(isDark ? '#FFFFFF' : '#09090B'));
      st.setStyle(PaintStyle.Stroke);
      st.setStrokeWidth(14);
      st.setStrokeJoin(StrokeJoin.Round);
      c.drawText(l, x, y, st, font);
    }
    if (styleId === 'glow') {
      const g = Skia.Paint();
      g.setColor(Skia.Color(color));
      g.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 18, true));
      c.drawText(l, x, y, g, font);
      c.drawText(l, x, y, g, font);
    }
    if (styleId === 'shadow') {
      const sh = Skia.Paint();
      sh.setColor(Skia.Color('rgba(0,0,0,0.7)'));
      sh.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6, true));
      c.drawText(l, x + 8, y + 10, sh, font);
    }
    c.drawText(l, x, y, fill, font);
  });
  surface.flush();
  const img = surface.makeImageSnapshot();
  const uri = `${FileSystem.cacheDirectory}text_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(uri, img.encodeToBase64(ImageFormat.PNG, 100), { encoding: FileSystem.EncodingType.Base64 });
  return { uri, width: W, height: H };
}

export function TextPanel({ onDone }: { onDone: (s: { uri: string; width: number; height: number }) => void }) {
  const [text, setText] = useState('');
  const [fontId, setFontId] = useState('impact');
  const [styleId, setStyleId] = useState<TextStyleId>('outline');
  const [color, setColor] = useState('#FFFFFF');
  const [upper, setUpper] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <ScrollView contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        style={p.textInput}
        placeholder="Digite seu texto"
        placeholderTextColor={COLORS.TEXT_SECONDARY}
      />
      <Text style={TYPE.overline}>Fonte</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
        {FONTS.map((f) => (
          <Pressable key={f.id} onPress={() => setFontId(f.id)} style={[p.fontChip, fontId === f.id && p.chipOn]}>
            <Text style={{ fontFamily: f.family, fontWeight: f.weight, fontSize: 16, color: fontId === f.id ? COLORS.ACCENT_INK : COLORS.TEXT_PRIMARY }}>Aa</Text>
            <Text style={[TYPE.label, { fontSize: 9 }, fontId === f.id && { color: COLORS.ACCENT_INK }]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={TYPE.overline}>Estilo</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
        {TEXT_STYLES.map((st) => (
          <Pressable key={st.id} onPress={() => setStyleId(st.id)} style={[p.chip, styleId === st.id && p.chipOn]}>
            <Text style={[p.chipText, styleId === st.id && { color: COLORS.ACCENT_INK }]}>{st.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setUpper((u) => !u)} style={[p.chip, upper && p.chipOn]}>
          <Text style={[p.chipText, upper && { color: COLORS.ACCENT_INK }]}>MAIÚSCULAS</Text>
        </Pressable>
      </ScrollView>
      <Text style={TYPE.overline}>Cor</Text>
      <View style={{ flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' }}>
        {TEXT_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} style={[p.swatch, { backgroundColor: c }, color === c && p.swatchOn]} />
        ))}
      </View>
      <PrimaryButton
        label={busy ? 'Criando…' : 'Adicionar texto'}
        disabled={!text.trim() || busy}
        onPress={async () => {
          setBusy(true);
          try {
            onDone(await renderTextSticker(text.trim(), fontId, styleId, color, upper));
          } catch (e) {
            Alert.alert('Erro', (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </ScrollView>
  );
}

// ───────────────────────────── Corte viral ──────────────────────────────────

export function CutPanel({ onClose }: { onClose: () => void }) {
  const media = useEditor((s) => s.media);
  const resolution = useEditor((s) => s.resolution);
  const aspect = useEditor((s) => s.aspect);
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
        target: targetFor(resolution, aspect),
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
      Alert.alert('Não foi possível sincronizar', (e as FFmpegError).message);
    } finally {
      setRunning(false);
    }
  };

  const LABEL: Record<string, string> = {
    'scene-detect': 'Detectando os cortes…',
    'viral-render': 'Montando seu vídeo no ritmo…',
    done: 'Pronto',
  };

  if (media?.kind !== 'video') {
    return <Text style={TYPE.label}>O corte viral funciona com vídeos. Crie um projeto a partir de um vídeo para usar.</Text>;
  }
  return (
    <View>
      <Text style={[TYPE.label, { marginBottom: SPACING.md, lineHeight: 16 }]}>
        Escolha um vídeo viral como referência. O app encontra os cortes dele e remonta o seu vídeo no mesmo ritmo, com a
        música da referência. Tudo no aparelho.
      </Text>
      {running ? (
        <>
          <Text style={TYPE.body}>{LABEL[stage] ?? 'Processando…'}</Text>
          <ProgressBar value={progress} />
          <Pressable onPress={cancelAll}>
            <Text style={TYPE.label}>Cancelar</Text>
          </Pressable>
        </>
      ) : (
        <PrimaryButton label="Escolher vídeo referência" onPress={start} />
      )}
    </View>
  );
}

// ───────────────────────────── IA ───────────────────────────────────────────

export function AIPanel({ onOpenCut }: { onOpenCut: () => void }) {
  const stickers = useEditor((s) => s.stickers);
  const selectedId = useEditor((s) => s.selectedId);
  const updateSticker = useEditor((s) => s.updateSticker);
  const media = useEditor((s) => s.media);
  const setMedia = useEditor((s) => s.setMedia);
  const ai = useLocalAI();
  const sel = stickers.find((s) => s.id === selectedId);
  const ok = aiAvailable();

  return (
    <ScrollView>
      <ActionRow icon="zap" title="Corte viral" subtitle="Remonta seu vídeo no ritmo de um vídeo de referência" onPress={onOpenCut} disabled={media?.kind !== 'video'} />
      <ActionRow
        icon="scissors"
        title={`Remover fundo${ok ? '' : ' · em atualização'}`}
        subtitle={sel ? 'Recorta a camada selecionada' : 'Selecione uma camada (foto) no canvas'}
        disabled={!ok || !sel || ai.status === 'running'}
        onPress={async () => {
          if (!sel) return;
          const r = await ai.removeBackground(sel.uri);
          if (r) updateSticker(sel.id, { uri: r.uri, height: sel.width * (r.height / r.width) });
        }}
      />
      <ActionRow
        icon="maximize"
        title={`Melhorar qualidade ×4${ok ? '' : ' · em atualização'}`}
        subtitle={sel ? 'Aumenta a resolução da camada' : 'Aplica na foto de fundo'}
        disabled={!ok || (!sel && media?.kind !== 'image') || ai.status === 'running'}
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
      {!ok && (
        <Text style={[TYPE.label, { marginTop: SPACING.sm, lineHeight: 16 }]}>
          Remover fundo e melhorar qualidade estão sendo adaptados para o Android novo e voltam na próxima atualização.
        </Text>
      )}
      {(ai.status === 'loading-model' || ai.status === 'running') && (
        <>
          <Text style={TYPE.label}>{ai.status === 'loading-model' ? 'Carregando modelo…' : 'Processando no aparelho…'}</Text>
          <ProgressBar value={ai.progress} />
        </>
      )}
      {ai.status === 'error' && <Text style={[TYPE.label, { color: COLORS.DANGER }]}>{ai.error}</Text>}
    </ScrollView>
  );
}

// ───────────────────────────── Exportar ─────────────────────────────────────

export function ExportPanel({ preview }: { preview: { w: number; h: number } }) {
  const st = useEditor();
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [out, setOut] = useState<string | null>(null);
  const isImage = st.media?.kind === 'image';
  const hasMotion = !isImage || st.stickers.length > 0;
  const [asPhoto, setAsPhoto] = useState(isImage && !hasMotion);

  const run = async () => {
    if (!st.media) return;
    setState('running');
    setProgress(0);
    try {
      const uri = await exportProject({
        mediaUri: st.media.uri,
        mediaKind: st.media.kind,
        durationMs: isImage ? Math.max(5000, ...st.stickers.map((s) => s.endMs)) : st.media.durationMs,
        preview,
        target: targetFor(st.resolution, st.aspect),
        adjust: st.adjust,
        effect: getEffect(st.effectId),
        stickers: st.stickers,
        asPhoto,
        onProgress: (r) => setProgress(r),
      });
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (perm.granted) await MediaLibrary.saveToLibraryAsync(uri);
      setOut(uri);
      setState('done');
    } catch (e) {
      setState('idle');
      Alert.alert('Falha na exportação', (e as FFmpegError).message);
    }
  };

  return (
    <View style={{ gap: SPACING.md }}>
      {isImage && (
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          {[
            { v: true, l: 'Foto (PNG)' },
            { v: false, l: 'Vídeo (MP4)' },
          ].map((o) => (
            <Pressable key={o.l} onPress={() => setAsPhoto(o.v)} style={[p.tile, asPhoto === o.v && p.tileOn]}>
              <Text style={[TYPE.label, asPhoto === o.v && { color: COLORS.ACCENT_INK }]}>{o.l}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={TYPE.overline}>Resolução</Text>
      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        {(Object.keys(RESOLUTIONS) as Resolution[]).map((r) => (
          <Pressable key={r} onPress={() => st.setResolution(r)} style={[p.tile, st.resolution === r && p.tileOn]}>
            <Text style={[TYPE.label, st.resolution === r && { color: COLORS.ACCENT_INK }]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={TYPE.label}>
        Formato {st.aspect} · {targetFor(st.resolution, st.aspect).w}×{targetFor(st.resolution, st.aspect).h}
      </Text>
      {state === 'running' && <ProgressBar value={progress} />}
      {state === 'done' ? (
        <View style={{ gap: SPACING.sm }}>
          <Text style={TYPE.body}>Salvo na galeria ✓</Text>
          <PrimaryButton label="Compartilhar" onPress={() => out && Sharing.shareAsync(out)} />
        </View>
      ) : (
        <PrimaryButton label={state === 'running' ? `Exportando ${Math.round(progress * 100)}%` : 'Exportar'} onPress={run} disabled={state === 'running'} />
      )}
    </View>
  );
}

const p = StyleSheet.create({
  chips: { gap: SPACING.sm, paddingBottom: SPACING.md },
  chip: {
    paddingHorizontal: SPACING.md,
    height: 30,
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
  },
  chipOn: { backgroundColor: COLORS.ACCENT_COLOR, borderColor: COLORS.ACCENT_COLOR },
  chipText: { ...TYPE.label, fontWeight: '600' },
  fxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingBottom: SPACING.xl },
  fxItem: { width: 66, alignItems: 'center', gap: 4 },
  fxName: { ...TYPE.label, fontSize: 10 },
  thumb: { borderRadius: RADIUS.sm, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: COLORS.BACKGROUND_PRINCIPAL },
  thumbOn: { borderColor: COLORS.ACCENT_COLOR, ...GLOW },
  formatRow: { flexDirection: 'row', gap: SPACING.sm },
  formatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    backgroundColor: COLORS.BACKGROUND_PRINCIPAL,
  },
  formatOn: { borderColor: COLORS.ACCENT_COLOR },
  formatBox: { borderWidth: 1.5, borderColor: COLORS.TEXT_SECONDARY, borderRadius: 4 },
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
    minHeight: 60,
    color: COLORS.TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    backgroundColor: COLORS.BACKGROUND_PRINCIPAL,
  },
  fontChip: {
    width: 64,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
  },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: COLORS.BORDER_STRONG },
  swatchOn: { borderWidth: 2, borderColor: COLORS.ACCENT_COLOR, transform: [{ scale: 1.12 }] },
});
