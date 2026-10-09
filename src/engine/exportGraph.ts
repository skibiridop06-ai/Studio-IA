/**
 * Monta o comando FFmpeg da exportação final (código PURO, sem React Native:
 * é testado fora do app contra o FFmpeg real).
 *
 * Ordem do grafo (igual à ordem do preview na GPU):
 *   mídia → enquadra no formato → cor (eq + colorbalance) → efeito → camadas
 */
import { ffmpegFxGraph, type ColorAdjust, type Effect } from './effectsData';

export interface ExportLayer {
  uri: string; // caminho POSIX
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  startMs: number;
  endMs: number;
  zIndex: number;
  opacity?: number;
  flipX?: boolean;
}

export interface ExportSpec {
  mediaPath: string;
  mediaKind: 'video' | 'image';
  durationMs: number;
  preview: { w: number; h: number };
  target: { w: number; h: number };
  adjust: ColorAdjust;
  effect: Effect;
  layers: ExportLayer[];
  asPhoto: boolean;
  outPath: string;
  hasAudio: boolean;
}

const sec = (ms: number) => (ms / 1000).toFixed(3);

/** Devolve os argumentos SEM o bloco de encoder de vídeo (adicionado por quem chama). */
export function buildExportArgs(spec: ExportSpec): { pre: string[]; post: string[] } {
  const { mediaPath, mediaKind, durationMs, preview, target, adjust, effect, layers, asPhoto, outPath, hasAudio } = spec;
  const W = target.w;
  const H = target.h;
  const k = W / preview.w;

  const inputs: string[] =
    mediaKind === 'image'
      ? asPhoto
        ? ['-i', mediaPath]
        : ['-loop', '1', '-framerate', '30', '-t', sec(durationMs), '-i', mediaPath]
      : ['-i', mediaPath];
  const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);
  ordered.forEach((s) => inputs.push(...(asPhoto ? ['-i', s.uri] : ['-loop', '1', '-framerate', '30', '-i', s.uri])));

  const b = (adjust.brightness / 100) * 0.25;
  const c = 1 + adjust.contrast / 100;
  const sat = 1 + adjust.saturation / 100;
  const temp = adjust.temperature / 100;
  const graph: string[] = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=rgb24,` +
      `eq=brightness=${b.toFixed(3)}:contrast=${c.toFixed(3)}:saturation=${sat.toFixed(3)},` +
      `colorbalance=rm=${(temp * 0.15).toFixed(3)}:bm=${(-temp * 0.15).toFixed(3)}[col]`,
    ffmpegFxGraph(effect, 'col', 'base0', k, W, H),
  ];

  ordered.forEach((s, i) => {
    const w = Math.max(2, Math.round(s.width * s.scale * k));
    const cx = Math.round(W / 2 + s.x * k);
    const cy = Math.round(H / 2 + s.y * k);
    const a = s.rotation.toFixed(5);
    const op = s.opacity ?? 1;
    const pre = [`format=rgba`, `scale=${w}:-1`, ...(s.flipX ? ['hflip'] : []), ...(op < 0.999 ? [`colorchannelmixer=aa=${op.toFixed(3)}`] : [])];
    graph.push(`[${i + 1}:v]${pre.join(',')},rotate=${a}:c=none:ow=rotw(${a}):oh=roth(${a})[sk${i}]`);
    const enable = asPhoto ? '' : `:enable='between(t\\,${sec(s.startMs)}\\,${sec(s.endMs)})'`;
    graph.push(`[base${i}][sk${i}]overlay=x=${cx}-overlay_w/2:y=${cy}-overlay_h/2${enable}:shortest=1[base${i + 1}]`);
  });
  const last = `base${ordered.length}`;
  graph.push(`[${last}]format=${asPhoto ? 'rgb24' : 'yuv420p'}[vout]`);

  const pre = ['-y', '-hide_banner', ...inputs, '-filter_complex', graph.join(';'), '-map', '[vout]'];
  if (asPhoto) return { pre, post: ['-frames:v', '1', outPath] };
  return {
    pre: [...pre, ...(mediaKind === 'video' && hasAudio ? ['-map', '0:a?', '-c:a', 'aac', '-b:a', '192k'] : [])],
    post: ['-t', sec(durationMs), '-movflags', '+faststart', outPath],
  };
}

/** Tamanho de saída para resolução × formato (lado curto = resolução; pares para o H.264). */
export function targetSize(shortSide: number, ratio: number): { w: number; h: number } {
  const even = (n: number) => Math.round(n / 2) * 2;
  return ratio < 1 ? { w: shortSide, h: even(shortSide / ratio) } : { w: even(shortSide * ratio), h: shortSide };
}
