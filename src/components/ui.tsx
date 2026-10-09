/**
 * Primitivas de UI do Studio IA: Header, Toolbox, BottomSheet, Slider, Pill.
 * Tudo consome tokens de `theme.ts`.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { COLORS, GLOW, HAIRLINE, RADIUS, RESOLUTIONS, SPACING, TYPE, type Resolution } from '../theme';
import type { ToolId } from '../store/editorStore';

// ───────────────────────────── Header ───────────────────────────────────────

export function EditorHeader(props: {
  resolution: Resolution;
  onResolution: (r: Resolution) => void;
  onClose: () => void;
  onExport: () => void;
  exportDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={hs.row}>
      <Pressable onPress={props.onClose} hitSlop={12} style={hs.icon}>
        <Feather name="x" size={22} color={COLORS.TEXT_PRIMARY} />
      </Pressable>

      <View>
        <Pressable onPress={() => setOpen((o) => !o)} style={hs.resPill}>
          <Text style={hs.resText}>{props.resolution}</Text>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={12} color={COLORS.TEXT_PRIMARY} />
        </Pressable>
        {open && (
          <View style={hs.menu}>
            {(Object.keys(RESOLUTIONS) as Resolution[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => {
                  props.onResolution(r);
                  setOpen(false);
                }}
                style={[hs.menuItem, r === props.resolution && hs.menuItemActive]}
              >
                <Text style={[hs.resText, r !== props.resolution && { color: COLORS.TEXT_SECONDARY }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Pressable
        onPress={props.onExport}
        disabled={props.exportDisabled}
        style={[hs.export, props.exportDisabled && { opacity: 0.35 }]}
      >
        <Feather name="upload" size={13} color={COLORS.ACCENT_INK} />
        <Text style={hs.exportText}>Exportar</Text>
      </Pressable>
    </View>
  );
}

const hs = StyleSheet.create({
  row: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    zIndex: 20,
  },
  icon: { width: 36, height: 36, justifyContent: 'center' },
  resPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
  },
  resText: { ...TYPE.label, color: COLORS.TEXT_PRIMARY, fontWeight: '600' },
  menu: {
    position: 'absolute',
    top: 36,
    alignSelf: 'center',
    padding: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    minWidth: 88,
  },
  menuItem: { paddingVertical: 8, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm, alignItems: 'center' },
  menuItemActive: { backgroundColor: COLORS.BORDER_COLOR },
  export: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.ACCENT_COLOR,
    ...GLOW,
  },
  exportText: { fontSize: 12, fontWeight: '700', color: COLORS.ACCENT_INK, letterSpacing: 0.2 },
});

// ───────────────────────────── Toolbox ──────────────────────────────────────

const TOOLS: { id: ToolId; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { id: 'effects', label: 'Efeitos', icon: 'star' },
  { id: 'text', label: 'Texto', icon: 'type' },
  { id: 'stickers', label: 'Figurinhas', icon: 'smile' },
  { id: 'filters', label: 'Ajustes', icon: 'sliders' },
  { id: 'format', label: 'Formato', icon: 'crop' },
  { id: 'cut', label: 'Corte viral', icon: 'zap' },
  { id: 'ai', label: 'IA', icon: 'cpu' },
  { id: 'audio', label: 'Áudio', icon: 'volume-2' },
];

export function Toolbox({ active, onPress }: { active: ToolId | null; onPress: (t: ToolId) => void }) {
  return (
    <View style={ts.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ts.row}>
        {TOOLS.map((t) => {
          const on = active === t.id;
          return (
            <Pressable key={t.id} onPress={() => onPress(t.id)} style={ts.btn}>
              <View style={[ts.iconWrap, on && ts.iconWrapOn]}>
                <Feather name={t.id === 'audio' && on ? 'volume-x' : t.icon} size={19} color={on ? COLORS.ACCENT_INK : COLORS.TEXT_PRIMARY} />
              </View>
              <Text numberOfLines={1} style={[ts.label, on && { color: COLORS.TEXT_PRIMARY }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const ts = StyleSheet.create({
  wrap: { borderTopWidth: HAIRLINE, borderColor: COLORS.BORDER_COLOR, backgroundColor: COLORS.BACKGROUND_PRINCIPAL },
  row: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.xs },
  btn: { width: 68, alignItems: 'center', gap: 6 },
  iconWrap: { width: 42, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  iconWrapOn: { backgroundColor: COLORS.ACCENT_COLOR, ...GLOW },
  label: { ...TYPE.label, fontSize: 10 },
});

// ───────────────────────────── Bottom sheet ─────────────────────────────────

export function Sheet({
  visible,
  onClose,
  title,
  children,
  height = '55%',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  height?: ViewStyle['height'];
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Modais vivem fora da árvore raiz: precisam do próprio root de gestos */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={ss.scrim} onPress={onClose} />
        <View style={[ss.sheet, { height }]}>
          <View style={ss.grabber} />
          <View style={ss.head}>
            <Text style={TYPE.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={18} color={COLORS.TEXT_SECONDARY} />
            </Pressable>
          </View>
          {children}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const ss = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: COLORS.SCRIM },
  sheet: {
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.BORDER_STRONG, marginTop: SPACING.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md },
});

// ───────────────────────────── Slider (gesto na UI thread) ──────────────────

export function Slider({
  label,
  icon,
  value,
  min = -100,
  max = 100,
  onChange,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const width = useSharedValue(1);
  const x = useSharedValue(0);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    setDisplay(value);
    x.value = ((value - min) / (max - min)) * width.value;
  }, [value, min, max, x, width]);

  const emit = (v: number) => {
    setDisplay(v);
    onChange(v);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      x.value = Math.max(0, Math.min(width.value, e.x));
      runOnJS(emit)(Math.round(min + (x.value / width.value) * (max - min)));
    })
    .onUpdate((e) => {
      x.value = Math.max(0, Math.min(width.value, e.x));
      runOnJS(emit)(Math.round(min + (x.value / width.value) * (max - min)));
    });

  const fill = useAnimatedStyle(() => ({ width: x.value }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - 7 }] }));

  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
    x.value = ((value - min) / (max - min)) * width.value;
  };

  return (
    <View style={sl.row}>
      <Feather name={icon} size={14} color={COLORS.TEXT_SECONDARY} />
      <Text style={sl.label}>{label}</Text>
      <GestureDetector gesture={pan}>
        <View style={sl.track} onLayout={onLayout} hitSlop={{ top: 14, bottom: 14 }}>
          <Animated.View style={[sl.fill, fill]} />
          <Animated.View style={[sl.knob, knob]} />
        </View>
      </GestureDetector>
      <Text style={sl.value}>{display}</Text>
    </View>
  );
}

const sl = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, height: 40 },
  label: { ...TYPE.label, color: COLORS.TEXT_PRIMARY, width: 78 },
  track: { flex: 1, height: 2, backgroundColor: COLORS.BORDER_STRONG, borderRadius: 1, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, height: 2, backgroundColor: COLORS.TEXT_SECONDARY, borderRadius: 1 },
  knob: { position: 'absolute', left: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.ACCENT_COLOR, ...GLOW },
  value: { ...TYPE.mono, width: 32, textAlign: 'right' },
});

// ───────────────────────────── Botão primário / linha de ação ───────────────

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[pb.btn, disabled && { opacity: 0.4 }]}>
      <Text style={pb.text}>{label}</Text>
    </Pressable>
  );
}

export function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[pb.row, disabled && { opacity: 0.4 }]}>
      <View style={pb.rowIcon}>
        <Feather name={icon} size={18} color={COLORS.TEXT_PRIMARY} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={TYPE.body}>{title}</Text>
        <Text style={[TYPE.label, { marginTop: 2 }]}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.TEXT_SECONDARY} />
    </Pressable>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={pb.progTrack}>
      <View style={[pb.progFill, { width: `${Math.round(value * 100)}%` }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  btn: {
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.ACCENT_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    ...GLOW,
  },
  text: { color: COLORS.ACCENT_INK, fontWeight: '700', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
    backgroundColor: COLORS.BACKGROUND_PRINCIPAL,
    marginBottom: SPACING.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progTrack: { height: 3, borderRadius: 2, backgroundColor: COLORS.BORDER_STRONG, overflow: 'hidden', marginVertical: SPACING.md },
  progFill: { height: 3, backgroundColor: COLORS.ACCENT_COLOR },
});
