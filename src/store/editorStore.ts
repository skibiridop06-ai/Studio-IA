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

export type ToolId = 'cut' | 'audio' | 'text' | 'effects' | 'filters' | 'ai';

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
}

export interface ColorAdjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  temperature: number; // -100..100
}

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
}

let seq = 0;
const uid = () => `stk_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export const useEditor = create<EditorState>((set, get) => ({
  media: null,
  stickers: [],
  selectedId: null,
  playheadMs: 0,
  isPlaying: false,
  resolution: '1080P',
  activeTool: null,
  adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0 },
  cutPoints: [],

  setMedia: (media) => set({ media, playheadMs: 0, cutPoints: [] }),

  addSticker: (s) => {
    const id = uid();
    const zIndex = get().stickers.reduce((m, x) => Math.max(m, x.zIndex), 0) + 1;
    set((st) => ({ stickers: [...st.stickers, { ...s, id, zIndex }], selectedId: id }));
    return id;
  },

  updateSticker: (id, patch) =>
    set((st) => ({ stickers: st.stickers.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),

  removeSticker: (id) =>
    set((st) => ({
      stickers: st.stickers.filter((s) => s.id !== id),
      selectedId: st.selectedId === id ? null : st.selectedId,
    })),

  bringToFront: (id) => {
    const top = get().stickers.reduce((m, x) => Math.max(m, x.zIndex), 0);
    get().updateSticker(id, { zIndex: top + 1 });
  },

  select: (selectedId) => set({ selectedId }),
  setPlayhead: (playheadMs) => set({ playheadMs }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setResolution: (resolution) => set({ resolution }),
  setTool: (activeTool) => set((st) => ({ activeTool: st.activeTool === activeTool ? null : activeTool })),
  setAdjust: (patch) => set((st) => ({ adjust: { ...st.adjust, ...patch } })),
  setCutPoints: (cutPoints) => set({ cutPoints }),
}));
