/**
 * Biblioteca de figurinhas OFFLINE: Emojis · Formas · Galeria.
 * Nada é baixado da internet: emojis vêm da fonte do sistema e formas são
 * desenhadas pelo app (ver localStickers.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { COLORS, HAIRLINE, RADIUS, SPACING, TYPE } from '../theme';
import { EMOJI_GROUPS, SHAPES, STICKER_COLORS, renderEmoji, renderShape } from './localStickers';

export interface PickedSticker {
  uri: string;
  width: number;
  height: number;
}

type Tab = 'emoji' | 'shapes' | 'gallery';
const TABS: { id: Tab; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { id: 'emoji', label: 'Emojis', icon: 'smile' },
  { id: 'shapes', label: 'Formas', icon: 'star' },
  { id: 'gallery', label: 'Galeria', icon: 'image' },
];

export function StickerLibrary({ onPick }: { onPick: (s: PickedSticker) => void }) {
  const [tab, setTab] = useState<Tab>('emoji');
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<PickedSticker>) => {
    if (busy) return;
    setBusy(key);
    try {
      onPick(await fn());
    } catch (e) {
      Alert.alert('Não foi possível adicionar', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[s.tab, tab === t.id && s.tabOn]}>
            <Feather name={t.icon} size={14} color={tab === t.id ? COLORS.ACCENT_INK : COLORS.TEXT_SECONDARY} />
            <Text style={[s.tabText, tab === t.id && { color: COLORS.ACCENT_INK }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'emoji' && <EmojiGrid busy={busy} onPick={(e) => run(e, () => renderEmoji(e))} />}
      {tab === 'shapes' && <ShapesGrid busy={busy} run={run} />}
      {tab === 'gallery' && <GalleryPane busy={busy} run={run} />}
    </View>
  );
}

// ───────────────────────────── Emojis ───────────────────────────────────────

type Row = { kind: 'header'; title: string } | { kind: 'emoji'; e: string };

function EmojiGrid({ busy, onPick }: { busy: string | null; onPick: (e: string) => void }) {
  const data = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of EMOJI_GROUPS) {
      out.push({ kind: 'header', title: g.name });
      const items = g.items.split(' ').filter(Boolean);
      items.forEach((e) => out.push({ kind: 'emoji', e }));
    }
    return out;
  }, []);

  return (
    <FlashList
      data={data}
      numColumns={7}
      getItemType={(r) => r.kind}
      keyExtractor={(r, i) => (r.kind === 'header' ? `h_${r.title}` : `e_${i}`)}
      overrideItemLayout={(layout, item) => {
        if (item.kind === 'header') layout.span = 7;
      }}
      renderItem={({ item }) =>
        item.kind === 'header' ? (
          <Text style={[TYPE.overline, { marginTop: SPACING.md, marginBottom: SPACING.xs }]}>{item.title}</Text>
        ) : (
          <Pressable style={s.emojiCell} onPress={() => onPick(item.e)}>
            {busy === item.e ? <ActivityIndicator color={COLORS.TEXT_PRIMARY} /> : <Text style={s.emoji}>{item.e}</Text>}
          </Pressable>
        )
      }
    />
  );
}

// ───────────────────────────── Formas ───────────────────────────────────────

function ShapesGrid({ busy, run }: { busy: string | null; run: (k: string, fn: () => Promise<PickedSticker>) => void }) {
  const [color, setColor] = useState(STICKER_COLORS[0]);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const sh of SHAPES) {
        const r = await renderShape(sh, color, 160);
        out[sh.id] = r.uri;
        if (alive) setPreviews({ ...out });
      }
    })();
    return () => {
      alive = false;
    };
  }, [color]);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingVertical: SPACING.sm }}>
        {STICKER_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} style={[s.swatch, { backgroundColor: c }, color === c && s.swatchOn]} />
        ))}
      </ScrollView>
      <View style={s.grid}>
        {SHAPES.map((sh) => (
          <Pressable key={sh.id} style={s.shapeCell} onPress={() => run(sh.id, () => renderShape(sh, color))}>
            {previews[sh.id] ? (
              <Image source={{ uri: previews[sh.id] }} style={{ width: 44, height: 44 }} contentFit="contain" />
            ) : (
              <ActivityIndicator color={COLORS.TEXT_SECONDARY} />
            )}
            <Text style={s.shapeName}>{busy === sh.id ? '…' : sh.name}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// ───────────────────────────── Galeria ──────────────────────────────────────

function GalleryPane({ busy, run }: { busy: string | null; run: (k: string, fn: () => Promise<PickedSticker>) => void }) {
  const pick = () =>
    run('gallery', async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled) throw new Error('Nenhuma imagem escolhida.');
      const a = res.assets[0];
      return { uri: a.uri, width: a.width, height: a.height };
    });
  return (
    <View style={{ gap: SPACING.md, paddingTop: SPACING.md }}>
      <Pressable style={s.galleryBtn} onPress={pick}>
        {busy === 'gallery' ? <ActivityIndicator color={COLORS.TEXT_PRIMARY} /> : <Feather name="image" size={24} color={COLORS.TEXT_PRIMARY} />}
        <Text style={TYPE.body}>Escolher foto da galeria</Text>
        <Text style={[TYPE.label, { textAlign: 'center' }]}>
          A foto entra como camada: arraste, gire, mude o tamanho e a transparência. Ótimo para colagens e montagens.
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    height: 32,
    borderRadius: RADIUS.pill,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
  },
  tabOn: { backgroundColor: COLORS.ACCENT_COLOR, borderColor: COLORS.ACCENT_COLOR },
  tabText: { ...TYPE.label, fontWeight: '600' },
  emojiCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 30 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  shapeCell: {
    width: '22.5%',
    aspectRatio: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    backgroundColor: '#1F1F23',
  },
  shapeName: { ...TYPE.label, fontSize: 10 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: COLORS.BORDER_STRONG },
  swatchOn: { borderWidth: 2, borderColor: COLORS.ACCENT_COLOR, transform: [{ scale: 1.12 }] },
  galleryBtn: {
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
    borderWidth: HAIRLINE,
    borderStyle: 'dashed',
    borderColor: COLORS.BORDER_STRONG,
  },
});
