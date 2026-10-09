/**
 * Catálogo de efeitos. Cada efeito existe em DOIS lugares, que precisam bater:
 *   • preview — Skia na GPU (ColorMatrix + shader SkSL `FX_SHADER` + blur/vinheta)
 *   • export  — filtros FFmpeg equivalentes (`ffmpegFxGraph`)
 * Este arquivo é PURO (sem React Native) para ser testado contra o FFmpeg real.
 */
export interface ColorAdjust {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
}

export type FxKind =
  | 'none' | 'rgbsplit' | 'vhs' | 'pixelate' | 'posterize' | 'invert' | 'mirror' | 'scanlines'
  | 'shake' | 'zoompulse' | 'kenburns' | 'strobe' | 'fisheye' | 'edges' | 'sketch' | 'emboss'
  | 'sharpen' | 'bloom' | 'kaleido' | 'mirrorv' | 'gradient';

export const FX_INDEX: Record<FxKind, number> = {
  none: 0, rgbsplit: 1, vhs: 2, pixelate: 3, posterize: 4, invert: 5, mirror: 6, scanlines: 7,
  shake: 8, zoompulse: 9, kenburns: 10, strobe: 11, fisheye: 12, edges: 13, sketch: 14, emboss: 15,
  sharpen: 16, bloom: 17, kaleido: 18, mirrorv: 19, gradient: 20,
};

export type EffectCategory = 'Em alta' | 'Movimento' | 'Glitch' | 'Cinema' | 'Retrô' | 'Cores' | 'Luz' | 'Arte' | 'Básico';

export interface Effect {
  id: string;
  name: string;
  category: EffectCategory;
  adjust: ColorAdjust;
  blur: number; // px no preview
  vignette: boolean;
  fx: FxKind;
  amount: number; // parâmetro principal do fx
  p2: number; // parâmetro secundário (velocidade, período, k2…)
  stops: [string, string, string]; // mapa de gradiente (sombras → meios → luzes)
  grain: number; // granulado extra 0..0.3
  letterbox: boolean; // faixas pretas de cinema
}

const A = (brightness = 0, contrast = 0, saturation = 0, temperature = 0): ColorAdjust => ({ brightness, contrast, saturation, temperature });
type Extra = Partial<Omit<Effect, 'id' | 'name' | 'category' | 'adjust'>>;
const E = (id: string, name: string, category: EffectCategory, adjust: ColorAdjust, extra: Extra = {}): Effect => ({
  id, name, category, adjust,
  blur: 0, vignette: false, fx: 'none', amount: 0, p2: 0,
  stops: ['#000000', '#808080', '#FFFFFF'], grain: 0, letterbox: false,
  ...extra,
});
const G = (a: string, b: string, c: string): Pick<Effect, 'fx' | 'stops'> => ({ fx: 'gradient', stops: [a, b, c] });

export const EFFECTS: Effect[] = [
  // ── Em alta (os que mais aparecem em edits virais) ──
  E('original', 'Original', 'Básico', A()),
  E('shake', 'Tremor', 'Em alta', A(0, 15, 5, 0), { fx: 'shake', amount: 5, p2: 1 }),
  E('beatzoom', 'Zoom na Batida', 'Em alta', A(0, 10, 10, 0), { fx: 'zoompulse', amount: 0.08, p2: 2 }),
  E('strobe', 'Flash Branco', 'Em alta', A(), { fx: 'strobe', amount: 0.55, p2: 0.5 }),
  E('blink', 'Piscar Preto', 'Em alta', A(0, 20, 0, 0), { fx: 'strobe', amount: -0.7, p2: 0.5 }),
  E('glitchhot', 'Glitch', 'Em alta', A(0, 20, 10, 0), { fx: 'rgbsplit', amount: 6 }),
  E('y2k', 'Y2K', 'Em alta', A(10, 5, 35, -10), { fx: 'bloom', amount: 10, grain: 0.06 }),
  E('edit', 'Edit Sombrio', 'Em alta', A(-15, 45, -60, -10), { vignette: true, letterbox: true, grain: 0.08 }),
  E('cleangirl', 'Clean Girl', 'Em alta', A(15, -10, -15, 10), { blur: 0.8 }),
  E('cozy', 'Aconchego', 'Em alta', A(5, -5, 5, 45), { vignette: true, grain: 0.05 }),
  E('anime', 'Anime', 'Em alta', A(5, 25, 40, -15), { fx: 'bloom', amount: 7 }),

  // ── Movimento (animados) ──
  E('shakehard', 'Terremoto', 'Movimento', A(0, 20, 0, 0), { fx: 'shake', amount: 12, p2: 1.6 }),
  E('shakesoft', 'Tremor Leve', 'Movimento', A(), { fx: 'shake', amount: 2.5, p2: 0.7 }),
  E('pulse', 'Pulsar', 'Movimento', A(), { fx: 'zoompulse', amount: 0.05, p2: 1 }),
  E('heartbeat', 'Batimento', 'Movimento', A(0, 15, 15, 10), { fx: 'zoompulse', amount: 0.12, p2: 1.5, vignette: true }),
  E('kenburns', 'Zoom Lento', 'Movimento', A(), { fx: 'kenburns', amount: 0.03 }),
  E('kenburnsfast', 'Zoom Dramático', 'Movimento', A(-5, 25, -10, 0), { fx: 'kenburns', amount: 0.09, vignette: true }),
  E('strobefast', 'Estroboscópio', 'Movimento', A(0, 20, 0, 0), { fx: 'strobe', amount: 0.7, p2: 0.25 }),
  E('blinkslow', 'Apagão', 'Movimento', A(), { fx: 'strobe', amount: -0.9, p2: 1 }),

  // ── Glitch ──
  E('glitch2', 'Glitch Forte', 'Glitch', A(0, 35, 25, 0), { fx: 'rgbsplit', amount: 14 }),
  E('chroma', 'Aberração', 'Glitch', A(0, 10, 0, 0), { fx: 'rgbsplit', amount: 3, vignette: true }),
  E('pixel', 'Pixelado', 'Glitch', A(), { fx: 'pixelate', amount: 10 }),
  E('pixel8', '8-bit', 'Glitch', A(0, 25, 20, 0), { fx: 'pixelate', amount: 18 }),
  E('mosaic', 'Mosaico', 'Glitch', A(), { fx: 'pixelate', amount: 28 }),
  E('invert', 'Negativo', 'Glitch', A(), { fx: 'invert' }),
  E('xray', 'Raio-X', 'Glitch', A(0, 30, -100, -30), { fx: 'invert' }),
  E('digital', 'Digital', 'Glitch', A(0, 30, 20, -20), { fx: 'scanlines', amount: 0.3, grain: 0.06 }),

  // ── Cinema ──
  E('noir', 'Noir', 'Cinema', A(-20, 70, -100, 0), { vignette: true, grain: 0.12, letterbox: true }),
  E('night', 'Noite', 'Cinema', A(-20, 25, -40, -45), { vignette: true }),
  E('blockbuster', 'Blockbuster', 'Cinema', A(0, 30, 10, -30), { vignette: true, letterbox: true }),
  E('tealorange', 'Teal & Orange', 'Cinema', A(0, 25, 20, 0), { ...G('#0B2A33', '#7A8C8A', '#FFC48A'), letterbox: true }),
  E('drama', 'Drama', 'Cinema', A(-10, 50, -30, 5), { vignette: true }),
  E('thriller', 'Suspense', 'Cinema', A(-25, 40, -50, -35), { vignette: true, grain: 0.1 }),
  E('dream', 'Sonho', 'Cinema', A(25, -10, 5, 10), { blur: 2.5 }),
  E('blur', 'Desfoque', 'Cinema', A(), { blur: 9 }),
  E('widescreen', 'Widescreen', 'Cinema', A(0, 10, 0, 0), { letterbox: true }),

  // ── Retrô ──
  E('vhs', 'VHS', 'Retrô', A(5, -10, -20, 25), { fx: 'vhs', amount: 4 }),
  E('vintage', 'Vintage', 'Retrô', A(5, -15, -35, 40), { vignette: true }),
  E('film', 'Filme', 'Retrô', A(-5, 40, -60, 10), { vignette: true, grain: 0.18 }),
  E('crt', 'TV Antiga', 'Retrô', A(0, 20, -30, 5), { fx: 'scanlines', amount: 0.35, vignette: true }),
  E('sepia', 'Sépia', 'Retrô', A(0, 10, 0, 0), { ...G('#1E140A', '#8A6B45', '#F2E3C6'), grain: 0.06 }),
  E('polaroid', 'Polaroid', 'Retrô', A(15, -20, -20, 25), { vignette: true, grain: 0.04 }),
  E('super8', 'Super 8', 'Retrô', A(5, 20, -25, 35), { vignette: true, grain: 0.2, blur: 0.6 }),
  E('vaporwave', 'Vaporwave', 'Retrô', A(5, 15, 30, 0), { ...G('#2B0A3D', '#FF4FB8', '#5CF2FF'), fx: 'gradient', grain: 0.05 }),
  E('arcade', 'Fliperama', 'Retrô', A(0, 30, 40, 0), { fx: 'pixelate', amount: 6, grain: 0.04 }),

  // ── Cores (mapas de gradiente) ──
  E('mono', 'Preto e Branco', 'Cores', A(0, 10, -100, 0)),
  E('flash', 'Flash Preto', 'Cores', A(-10, 55, -100, 0), { vignette: true }),
  E('cyberpunk', 'Cyberpunk', 'Cores', A(0, 20, 0, 0), G('#12002B', '#D1007A', '#00F0FF')),
  E('thermal', 'Térmico', 'Cores', A(), G('#16007A', '#FF2A00', '#FFF35C')),
  E('nightvision', 'Visão Noturna', 'Cores', A(10, 20, 0, 0), { ...G('#001400', '#1EB33A', '#C8FFC0'), grain: 0.14, vignette: true }),
  E('matrix', 'Matrix', 'Cores', A(0, 30, 0, 0), { ...G('#000000', '#00A83A', '#B6FFB0'), fx: 'gradient', grain: 0.04 }),
  E('golden', 'Dourado', 'Cores', A(5, 15, 0, 0), G('#1A0E00', '#B8741A', '#FFF0C2')),
  E('ocean', 'Oceano', 'Cores', A(0, 10, 0, 0), G('#00121F', '#1C6FA8', '#C9F3FF')),
  E('rose', 'Rosé', 'Cores', A(10, 0, 0, 0), G('#2A0A16', '#D46A8C', '#FFE4EE')),
  E('purple', 'Roxo Neon', 'Cores', A(0, 15, 0, 0), G('#0D0024', '#7B2BFF', '#F0D9FF')),
  E('bloodred', 'Sangue', 'Cores', A(-5, 30, 0, 0), { ...G('#0A0000', '#A3000E', '#FFD9D9'), vignette: true }),

  // ── Luz ──
  E('glow', 'Brilho', 'Luz', A(30, 10, 10, 5), { blur: 1.5 }),
  E('bloom', 'Bloom', 'Luz', A(5, 10, 10, 0), { fx: 'bloom', amount: 12 }),
  E('cold', 'Luz Fria', 'Luz', A(5, 15, -20, -70), { vignette: true }),
  E('sunset', 'Pôr do Sol', 'Luz', A(5, 10, 20, 70)),
  E('fade', 'Desbotado', 'Luz', A(15, -35, -25, 0)),
  E('vivid', 'Vívido', 'Luz', A(5, 15, 35, 5)),
  E('soft', 'Suave', 'Luz', A(10, -15, -10, 5)),
  E('hdr', 'HDR', 'Luz', A(0, 25, 25, 0), { fx: 'sharpen' }),
  E('dark', 'Escuro', 'Luz', A(-30, 30, -10, -5), { vignette: true }),

  // ── Arte ──
  E('poster', 'Pôster', 'Arte', A(0, 20, 30, 0), { fx: 'posterize', amount: 4 }),
  E('comic', 'Quadrinho', 'Arte', A(0, 50, 40, 0), { fx: 'posterize', amount: 3 }),
  E('sketch', 'Desenho', 'Arte', A(10, 20, -100, 0), { fx: 'sketch' }),
  E('neon', 'Contorno Neon', 'Arte', A(), { fx: 'edges' }),
  E('emboss', 'Relevo', 'Arte', A(0, 0, -60, 0), { fx: 'emboss' }),
  E('fisheye', 'Olho de Peixe', 'Arte', A(), { fx: 'fisheye', amount: 0.35, p2: 0.1, vignette: true }),
  E('bulge', 'Lente', 'Arte', A(), { fx: 'fisheye', amount: -0.25, p2: 0 }),
  E('mirror', 'Espelho', 'Arte', A(), { fx: 'mirror' }),
  E('mirrorv', 'Espelho Vertical', 'Arte', A(), { fx: 'mirrorv' }),
  E('kaleido', 'Caleidoscópio', 'Arte', A(0, 10, 20, 0), { fx: 'kaleido' }),
];

export const EFFECT_CATEGORIES: EffectCategory[] = ['Em alta', 'Movimento', 'Glitch', 'Cinema', 'Retrô', 'Cores', 'Luz', 'Arte', 'Básico'];
export const getEffect = (id: string | null | undefined) => EFFECTS.find((e) => e.id === id) ?? EFFECTS[0];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ───────────────────────────── Export: grafo FFmpeg ─────────────────────────

/**
 * Instruções de filter_complex que levam [inp] → [out] com o mesmo efeito do
 * preview. `k` = escala preview→saída (px do preview viram px de saída).
 * Vírgulas dentro de expressões são escapadas (\,) para o parser do grafo.
 */
export function ffmpegFxGraph(e: Effect, inp: string, out: string, k: number, W: number, H: number): string {
  const pre: string[] = [];
  if (e.blur > 0) pre.push(`gblur=sigma=${(e.blur * k * 0.6).toFixed(2)}`);
  const px = Math.max(1, Math.round(e.amount * k));
  const post: string[] = [];
  if (e.grain > 0) post.push(`noise=alls=${Math.round(e.grain * 140)}:allf=t`);
  if (e.vignette) post.push('vignette=PI/4.5');
  if (e.letterbox) {
    const bh = Math.round(H * 0.11);
    post.push(`drawbox=x=0:y=0:w=iw:h=${bh}:c=black:t=fill`, `drawbox=x=0:y=ih-${bh}:w=iw:h=${bh}:c=black:t=fill`);
  }
  const chain = (parts: string[]) => (parts.length ? parts.join(',') : 'null');
  const simple = (mid: string[]) => `[${inp}]${chain([...pre, ...mid, ...post])}[${out}]`;

  switch (e.fx) {
    case 'rgbsplit':
      return simple([`rgbashift=rh=-${px}:bh=${px}`]);
    case 'vhs':
      return simple([`rgbashift=rh=-${px}:bh=${px}`, 'noise=alls=14:allf=t', `drawgrid=w=iw:h=${Math.max(2, Math.round(3 * k))}:t=${Math.max(1, Math.round(k))}:c=black@0.25`]);
    case 'pixelate':
      return simple([`scale=trunc(iw/${px}):trunc(ih/${px}):flags=neighbor`, `scale=${W}:${H}:flags=neighbor`]);
    case 'posterize': {
      const s = Math.round(256 / e.amount);
      return simple([`lutrgb=r='trunc(val/${s})*${s}':g='trunc(val/${s})*${s}':b='trunc(val/${s})*${s}'`]);
    }
    case 'invert':
      return simple(['negate']);
    case 'scanlines':
      return simple([`drawgrid=w=iw:h=${Math.max(2, Math.round(3 * k))}:t=${Math.max(1, Math.round(k))}:c=black@${e.amount.toFixed(2)}`]);
    case 'shake': {
      const a = Math.max(1, Math.round(e.amount * k));
      const f1 = (37 * e.p2).toFixed(2);
      const f2 = (29 * e.p2).toFixed(2);
      return simple([`scale=${W + 4 * a}:${H + 4 * a}`, `crop=${W}:${H}:${2 * a}+${a}*sin(${f1}*t):${2 * a}+${a}*cos(${f2}*t)`]);
    }
    case 'zoompulse': {
      const s = `(1+${e.amount}*abs(sin(t*PI*${e.p2})))`;
      return simple([`scale=w='2*trunc(${W}*${s}/2)':h='2*trunc(${H}*${s}/2)':eval=frame`, `crop=${W}:${H}`]);
    }
    case 'kenburns': {
      const s = `min(1.5\\,1+${e.amount}*t)`;
      return simple([`scale=w='2*trunc(${W}*${s}/2)':h='2*trunc(${H}*${s}/2)':eval=frame`, `crop=${W}:${H}`]);
    }
    case 'strobe':
      return simple([`eq=brightness='${e.amount}*lt(mod(t\\,${e.p2})\\,0.08)':eval=frame`]);
    case 'fisheye':
      return simple([`lenscorrection=k1=${e.amount}:k2=${e.p2}`]);
    case 'edges':
      return simple(['edgedetect=mode=wires:low=0.08:high=0.2']);
    case 'sketch':
      return simple(['edgedetect=mode=wires:low=0.08:high=0.2', 'negate']);
    case 'emboss': {
      const m = '-2 -1 0 -1 1 1 0 1 2';
      return simple([`convolution='${m}:${m}:${m}:${m}'`]);
    }
    case 'sharpen': {
      const m = '0 -1 0 -1 5 -1 0 -1 0';
      return simple([`convolution='${m}:${m}:${m}:${m}'`]);
    }
    case 'bloom':
      return (
        `[${inp}]${chain(pre)},split[bA][bB];[bB]gblur=sigma=${(e.amount * k * 0.5).toFixed(1)}[bC];` +
        `[bA][bC]blend=all_mode=screen,${chain(post)}[${out}]`
      );
    case 'gradient': {
      const [a, b, c] = e.stops.map(hex);
      const ch = (i: number) =>
        `if(lt(val\\,128)\\,${a[i]}+(${b[i] - a[i]})*val/128\\,${b[i]}+(${c[i] - b[i]})*(val-128)/127)`;
      return simple(['hue=s=0', `lutrgb=r='${ch(0)}':g='${ch(1)}':b='${ch(2)}'`]);
    }
    case 'mirror':
      return (
        `[${inp}]${chain(pre)},split[mL][mR];[mL]crop=iw/2:ih:0:0[mL2];[mR]crop=iw/2:ih:0:0,hflip[mR2];` +
        `[mL2][mR2]hstack,scale=${W}:${H},${chain(post)}[${out}]`
      );
    case 'mirrorv':
      return (
        `[${inp}]${chain(pre)},split[vT][vB];[vT]crop=iw:ih/2:0:0[vT2];[vB]crop=iw:ih/2:0:0,vflip[vB2];` +
        `[vT2][vB2]vstack,scale=${W}:${H},${chain(post)}[${out}]`
      );
    case 'kaleido':
      return (
        `[${inp}]${chain(pre)},crop=iw/2:ih/2:0:0,split=4[q1][q2][q3][q4];[q2]hflip[q2f];[q3]vflip[q3f];[q4]hflip,vflip[q4f];` +
        `[q1][q2f]hstack[qt];[q3f][q4f]hstack[qb];[qt][qb]vstack,scale=${W}:${H},${chain(post)}[${out}]`
      );
    default:
      return simple([]);
  }
}
