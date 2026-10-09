/**
 * Modelos (templates) da tela inicial. Cada modelo é uma receita local:
 * um preset de efeito + (opcional) uma ferramenta que abre logo de cara.
 * A arte da capa é desenhada com Skia a partir de `art` — nada vem da internet.
 */
import type { ToolId } from '../store/editorStore';

export type EditorTool = ToolId | 'stickers';

export interface TemplateArt {
  top: string; // cor do topo do céu
  bottom: string; // cor da base
  moon: string; // cor da lua / foco de luz
  moonY: number; // 0..1 posição vertical
  glow: number; // 0..1 intensidade do halo
  skyline: number; // 0 = sem prédios, 1 = cidade densa
  stars: boolean;
}

export interface Template {
  id: string;
  name: string;
  tag: string;
  description: string;
  media: 'video' | 'image' | 'any';
  effect: string; // nome do preset em EFFECTS
  tool?: EditorTool;
  art: TemplateArt;
}

export const TEMPLATES: Template[] = [
  {
    id: 'viral',
    name: 'Ritmo Viral',
    tag: 'Corte automático',
    description: 'Recorta seu vídeo no ritmo de um vídeo de referência.',
    media: 'video',
    effect: 'Original',
    tool: 'cut',
    art: { top: '#1A1A1D', bottom: '#09090B', moon: '#FFFFFF', moonY: 0.32, glow: 0.9, skyline: 0.8, stars: true },
  },
  {
    id: 'anime',
    name: 'Anime Vibe',
    tag: 'Noite',
    description: 'Tons frios, contraste suave e vinheta de cinema.',
    media: 'any',
    effect: 'Noite',
    art: { top: '#20232B', bottom: '#0B0C10', moon: '#E4E8F0', moonY: 0.25, glow: 0.7, skyline: 1, stars: true },
  },
  {
    id: 'flash',
    name: 'Flash Preto',
    tag: 'P&B',
    description: 'Preto e branco de alto contraste, estilo edit.',
    media: 'any',
    effect: 'Flash Preto',
    art: { top: '#2A2A2E', bottom: '#050505', moon: '#FFFFFF', moonY: 0.42, glow: 1, skyline: 0.4, stars: false },
  },
  {
    id: 'cold',
    name: 'Luz Fria',
    tag: 'Azulado',
    description: 'Temperatura fria e brilho limpo.',
    media: 'any',
    effect: 'Luz Fria',
    art: { top: '#18212E', bottom: '#080B10', moon: '#CFE3FF', moonY: 0.3, glow: 0.8, skyline: 0.6, stars: true },
  },
  {
    id: 'vintage',
    name: 'Vintage',
    tag: 'Retrô',
    description: 'Tons quentes e desbotados de filme antigo.',
    media: 'any',
    effect: 'Vintage',
    art: { top: '#2B241D', bottom: '#0D0B09', moon: '#FFE6C7', moonY: 0.36, glow: 0.6, skyline: 0.3, stars: false },
  },
  {
    id: 'grain',
    name: 'Granulado',
    tag: 'Textura',
    description: 'Contraste forte e cores lavadas, cara de câmera.',
    media: 'any',
    effect: 'Granulado',
    art: { top: '#232323', bottom: '#0A0A0A', moon: '#DADADA', moonY: 0.5, glow: 0.5, skyline: 0.9, stars: false },
  },
  {
    id: 'dream',
    name: 'Sonho',
    tag: 'Desfoque',
    description: 'Desfoque leve e brilho suave.',
    media: 'any',
    effect: 'Brilho',
    art: { top: '#26262B', bottom: '#0E0E12', moon: '#FFFFFF', moonY: 0.28, glow: 1, skyline: 0, stars: true },
  },
  {
    id: 'text',
    name: 'Better Days',
    tag: 'Texto',
    description: 'Comece com um título grande por cima do vídeo.',
    media: 'any',
    effect: 'Original',
    tool: 'text',
    art: { top: '#1C1C20', bottom: '#09090B', moon: '#FFFFFF', moonY: 0.6, glow: 0.4, skyline: 0.5, stars: true },
  },
];
