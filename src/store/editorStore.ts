/**
 * Estado global do editor (zustand).
 *
 * Regra de ouro de performance: o store guarda o estado "comprometido" (committed).
 * Durante um gesto, a posição/escala/rotação de cada figurinha vive SOMENTE em
 * SharedValues na UI thread (Reanimated). O store só é atualizado no `onEnd`
 * do gesto — assim um arrasto a 120 Hz não dispara 120 re-renders/s no React.
 */
import { create } from 'zustand';
import type { Resolution } from '../theme';

export type ToolId = 'cut' | 'audio' | 'text' | 'effects' | 'filters' | 'ai' | 'stickers' | 'format';

export interface StickerLayer {
  id: string;
  uri: string; // file:// local (já em cache) — nunca URL remota no canvas
  width: number; // tamanho base em pontos (preview)
  height: number;
  x: number; // translação relativa ao centro do canvas, em pontos
  y: number;
  scale: number;
  rotation: number; // radianos
  startMs: number; // janela de visibilidade na timeline
  endMs: number;
  zIndex: number;
  opacity?: number; // 0..1 (padrão 1)
  flipX?: boolean; // espelhado na horizontal
}

/** Fotografia do que o usuário edita — base do desfazer/refazer. */
interface Snapshot {
  stickers: StickerLayer[];
  adjust: ColorAdjust;
  effectId: string;
  aspect: Aspect;
}

export interface ColorAdjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  temperature: number; // -100..100
}

export type Aspect = '9:16' | '1:1' | '4:5' | '16:9';
export const ASPECT_RATIO: Record<Aspect, number> = { '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };

export interface MediaSource {
  uri: string;
  kind: 'video' | 'image';
  durationMs: number;
  width: number;
  height: number;
}

interface EditorState {
  media: MediaSource | null;
  stickers: StickerLayer[];
  selectedId: string | null;
  playheadMs: number;
  isPlaying: boolean;
  resolution: Resolution;
  activeTool: ToolId | null;
  adjust: ColorAdjust;
  cutPoints: number[]; // timestamps (ms) vindos do beat-sync / scene detection
  aspect: Aspect; // proporção do canvas (formatos estilo Canva)
  effectId: string; // efeito ativo (ver engine/effects.ts)

  setMedia: (m: MediaSource) => void;
  addSticker: (s: Omit<StickerLayer, 'id' | 'zIndex'>) => string;
  updateSticker: (id: string, patch: Partial<StickerLayer>) => void;
  removeSticker: (id: string) => void;
  bringToFront: (id: string) => void;
  select: (id: string | null) => void;
  setPlayhead: (ms: number) => void;
  setPlaying: (p: boolean) => void;
  setResolution: (r: Resolution) => void;
  setTool: (t: ToolId | null) => void;
  setAdjust: (patch: Partial<ColorAdjust>) => void;
  setCutPoints: (pts: number[]) => void;
  setAspect: (a: Aspect) => void;
  setEffect: (id: string, adjust?: ColorAdjust) => void;
  duplicateSticker: (id: string) => void;

  // histórico
  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;
  resetHistory: () => void;
}

const HISTORY_LIMIT = 60;
const COALESCE_MS = 450; // mudanças seguidas do mesmo tipo (ex.: arrastar slider) viram 1 passo
let lastPush = { at: 0, kind: '' };

let seq = 0;
const uid = () => `stk_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export const useEditor = create<EditorState>((set, get) => {
  const snap = (): Snapshot => {
    const s = get();
    return { stickers: s.stickers, adjust: s.adjust, effectId: s.effectId, aspect: s.aspect };
  };
  /** Guarda o estado ATUAL antes de uma mudança (agrupando rajadas do mesmo tipo). */
  const record = (kind: string) => {
    const now = Date.now();
    if (kind === lastPush.kind && now - lastPush.at < COALESCE_MS) {
      lastPush.at = now;
      return;
    }
    lastPush = { at: now, kind };
    set((st) => ({ past: [...st.past.slice(-HISTORY_LIMIT + 1), snap()], future: [] }));
  };

  return {
  media: null,
  stickers: [],
  selectedId: null,
  playheadMs: 0,
  isPlaying: false,
  resolution: '1080P',
  activeTool: null,
  adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0 },
  cutPoints: [],
  aspect: '9:16',
  effectId: 'original',

  past: [],
  future: [],

  setMedia: (media) => set({ media, playheadMs: 0, cutPoints: [] }),

  addSticker: (s) => {
    record('add');
    const id = uid();
    const zIndex = get().stickers.reduce((m, x) => Math.max(m, x.zIndex), 0) + 1;
    set((st) => ({ stickers: [...st.stickers, { ...s, id, zIndex }], selectedId: id }));
    return id;
  },

  updateSticker: (id, patch) => {
    record(`upd:${id}:${Object.keys(patch).sort().join(',')}`);
    set((st) => ({ stickers: st.stickers.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  },

  removeSticker: (id) => {
    record('remove');
    set((st) => ({
      stickers: st.stickers.filter((s) => s.id !== id),
      selectedId: st.selectedId === id ? null : st.selectedId,
    }));
  },

  duplicateSticker: (id) => {
    const src = get().stickers.find((s) => s.id === id);
    if (!src) return;
    record('dup');
    const nid = uid();
    const zIndex = get().stickers.reduce((m, x) => Math.max(m, x.zIndex), 0) + 1;
    set((st) => ({ stickers: [...st.stickers, { ...src, id: nid, x: src.x + 24, y: src.y + 24, zIndex }], selectedId: nid }));
  },

  bringToFront: (id) => {
    const top = get().stickers.reduce((m, x) => Math.max(m, x.zIndex), 0);
    get().updateSticker(id, { zIndex: top + 1 });
  },

  select: (selectedId) => set({ selectedId }),
  setPlayhead: (playheadMs) => set({ playheadMs }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setResolution: (resolution) => set({ resolution }),
  setTool: (activeTool) => set((st) => ({ activeTool: st.activeTool === activeTool ? null : activeTool })),
  setAdjust: (patch) => {
    record(`adj:${Object.keys(patch).join(',')}`);
    set((st) => ({ adjust: { ...st.adjust, ...patch } }));
  },
  setCutPoints: (cutPoints) => set({ cutPoints }),
  setAspect: (aspect) => {
    record('aspect');
    set({ aspect });
  },
  setEffect: (effectId, adjust) => {
    record('effect');
    set(adjust ? { effectId, adjust } : { effectId });
  },

  undo: () => {
    const { past } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    lastPush = { at: 0, kind: '' };
    set((st) => ({ ...prev, past: st.past.slice(0, -1), future: [snap(), ...st.future], selectedId: null }));
  },
  redo: () => {
    const { future } = get();
    if (!future.length) return;
    const next = future[0];
    lastPush = { at: 0, kind: '' };
    set((st) => ({ ...next, future: st.future.slice(1), past: [...st.past, snap()], selectedId: null }));
  },
  resetHistory: () => {
    lastPush = { at: 0, kind: '' };
    set({ past: [], future: [] });
  },
  };
});
