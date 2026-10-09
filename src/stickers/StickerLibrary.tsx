/**
 * Biblioteca infinita de figurinhas (FlashList, 4 colunas).
 *
 * Performance:
 *  - FlashList recicla células (não monta 180+ Views): só ~30 existem de fato.
 *  - expo-image decodifica fora da thread JS, com cache em memória + disco e
 *    `recyclingKey` para não piscar a imagem antiga ao reciclar a célula.
 *  - `onEndReachedThreshold=0.6` + prefetch de 2 páginas no hook = o usuário
 *    praticamente nunca vê o spinner do fim da lista.
 *
 * Tile especial "Da galeria": escolhe qualquer foto do aparelho e transforma em
 * figurinha com a remoção de fundo local (U²-Net) — fonte infinita e offline.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { COLORS, HAIRLINE, RADIUS, SPACING, TYPE } from '../theme';
import { useStickerSearch, type StickerItem } from './stickerProvider';
import { removeBackground } from '../engine/localAI';

export interface PickedSticker {
  uri: string;
  width: number;
  height: number;
  credit?: string;
}

const COLS = 4;
type Cell = { kind: 'gallery' } | ({ kind: 'item' } & StickerItem);

export function StickerLibrary({ onPick }: { onPick: (s: PickedSticker) => void }) {
  const [query, setQuery] = useState('fire png');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [onlyTransparent, setOnlyTransparent] = useState(true);
  const { items, loading, error, hasMore, loadMore } = useStickerSearch(query);

  const visible = onlyTransparent ? items.filter((i) => i.transparent !== false) : items;
  const data: Cell[] = [{ kind: 'gallery' }, ...visible.map((i) => ({ kind: 'item' as const, ...i }))];

  const pickFromGallery = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled) return;
    setBusyId('gallery');
    try {
      const cut = await removeBackground(res.assets[0].uri);
      onPick({ uri: cut.uri, width: cut.width, height: cut.height });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }, [onPick]);

  const pickItem = useCallback(
    async (it: StickerItem) => {
      if (!it.localUri) return;
      const credit = [it.creator, it.license].filter(Boolean).join(' · ') || undefined;
      if (it.transparent) return onPick({ uri: it.localUri, width: it.width, height: it.height, credit });
      // sem alpha → recorta localmente antes de usar
      setBusyId(it.id);
      try {
        const cut = await removeBackground(it.localUri);
        onPick({ uri: cut.uri, width: cut.width, height: cut.height, credit });
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [onPick],
  );

  const renderItem = useCallback(
    ({ item }: { item: Cell }) => {
      if (item.kind === 'gallery') {
        return (
          <Pressable style={[s.cell, s.galleryCell]} onPress={pickFromGallery}>
            {busyId === 'gallery' ? (
              <ActivityIndicator color={COLORS.TEXT_PRIMARY} />
            ) : (
              <>
                <Feather name="image" size={18} color={COLORS.TEXT_PRIMARY} />
                <Text style={s.galleryText}>Galeria{'\n'}+ IA</Text>
              </>
            )}
          </Pressable>
        );
      }
      return (
        <Pressable style={s.cell} onPress={() => pickItem(item)} disabled={!item.localUri}>
          <Image
            source={{ uri: item.localUri ?? item.thumbUrl }}
            recyclingKey={item.id}
            style={s.img}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
          />
          {item.transparent === false && (
            <View style={s.badge}>
              <Feather name="scissors" size={9} color={COLORS.ACCENT_INK} />
            </View>
          )}
          {(busyId === item.id || !item.localUri) && (
            <View style={s.overlay}>
              <ActivityIndicator size="small" color={COLORS.TEXT_PRIMARY} />
            </View>
          )}
        </Pressable>
      );
    },
    [busyId, pickFromGallery, pickItem],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchRow}>
        <Feather name="search" size={14} color={COLORS.TEXT_SECONDARY} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar figurinhas…"
          placeholderTextColor={COLORS.TEXT_SECONDARY}
          style={s.input}
          returnKeyType="search"
          autoCorrect={false}
        />
        <Pressable onPress={() => setOnlyTransparent((v) => !v)} style={[s.chip, onlyTransparent && s.chipOn]}>
          <Text style={[s.chipText, onlyTransparent && { color: COLORS.ACCENT_INK }]}>PNG ✓</Text>
        </Pressable>
      </View>

      <Text style={[TYPE.overline, { marginVertical: SPACING.sm }]}>
        {visible.length} figurinhas · imagens com licença livre
      </Text>

      <FlashList
        data={data}
        numColumns={COLS}
        keyExtractor={(c) => (c.kind === 'gallery' ? 'gallery' : c.id)}
        getItemType={(c) => c.kind}
        renderItem={renderItem}
        onEndReached={() => hasMore && loadMore()}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          <View style={s.footer}>
            {loading && <ActivityIndicator color={COLORS.TEXT_SECONDARY} />}
            {!!error && (
              <Pressable onPress={loadMore}>
                <Text style={TYPE.label}>{error} Toque para tentar de novo.</Text>
              </Pressable>
            )}
            {!hasMore && !loading && items.length > 0 && <Text style={TYPE.label}>Fim dos resultados</Text>}
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    backgroundColor: COLORS.BACKGROUND_PRINCIPAL,
  },
  input: { flex: 1, color: COLORS.TEXT_PRIMARY, fontSize: 13, paddingVertical: 0 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill, borderWidth: HAIRLINE, borderColor: COLORS.BORDER_STRONG },
  chipOn: { backgroundColor: COLORS.ACCENT_COLOR, borderColor: COLORS.ACCENT_COLOR },
  chipText: { fontSize: 10, fontWeight: '700', color: COLORS.TEXT_SECONDARY },
  cell: {
    flex: 1,
    aspectRatio: 1,
    margin: 3,
    borderRadius: RADIUS.sm,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    backgroundColor: COLORS.BACKGROUND_PRINCIPAL,
    overflow: 'hidden',
  },
  galleryCell: { alignItems: 'center', justifyContent: 'center', gap: 4, borderStyle: 'dashed', borderColor: COLORS.BORDER_STRONG },
  galleryText: { ...TYPE.label, fontSize: 9, textAlign: 'center', color: COLORS.TEXT_PRIMARY },
  img: { flex: 1, margin: 6 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.ACCENT_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.SCRIM, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: SPACING.xl, alignItems: 'center' },
});
