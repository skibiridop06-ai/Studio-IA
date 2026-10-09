/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Studio IA — Video Intelligence Engine (FFmpeg local, zero servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Pipeline "Viral Sync" (Vídeo Referência → Vídeo do Usuário):
 *
 *   1. probe()            → duração/dimensões via FFprobe (sem decodificar frames).
 *   2. detectScenes()     → roda o filtro `select='gt(scene,T)'` + `metadata=print`
 *                           sobre uma versão reduzida (scale=320) do vídeo. O filtro
 *                           `scene` calcula a diferença média absoluta (SAD) de luma
 *                           entre frames consecutivos, normalizada 0..1. Reduzir para
 *                           320px corta ~90% do custo de CPU sem mudar os cortes.
 *   3. adaptiveCuts()     → threshold adaptativo (média + k·desvio) + distância
 *                           mínima entre cortes, porque vídeos de "edit" têm flashes
 *                           e shakes que geram falso positivo com threshold fixo.
 *   4. buildCutPlan()     → mapeia as durações dos planos da referência sobre o
 *                           vídeo do usuário, "encaixando" cada início no corte de
 *                           cena mais próximo do próprio vídeo do usuário.
 *   5. renderCutPlan()    → um único `filter_complex` (split → trim → concat) com a
 *                           trilha de áudio da referência (a música viral).
 *
 *  Tudo roda via `FFmpegKit.executeWithArgumentsAsync`: argumentos em array →
 *  nenhum problema de escape com espaços/aspas em caminhos de arquivo.
 *
 *  ⚠ O ffmpeg-kit original foi descontinuado em 2025. Usamos o fork
 *  @wokcito/ffmpeg-kit-react-native (mesma API; binários Android no Maven
 *  Central, páginas de 16 KB). Toda a dependência está isolada neste arquivo.
 */
import { Platform } from 'react-native';
import {
  FFmpegKit,
  FFprobeKit,
  ReturnCode,
  type FFmpegSession,
  type Log,
  type Statistics,
} from '@wokcito/ffmpeg-kit-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { ASPECT_RATIO, type Aspect, type ColorAdjust, type StickerLayer } from '../store/editorStore';
import { RESOLUTIONS, type Resolution } from '../theme';
import type { Effect } from './effectsData';
import { buildExportArgs, targetSize } from './exportGraph';

// ───────────────────────────── Tipos públicos ───────────────────────────────

export interface ProbeResult {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export interface SceneCut {
  ms: number;
  score: number; // 0..1 (lavfi.scene_score)
}

export interface CutSegment {
  srcStartMs: number;
  srcEndMs: number;
  outStartMs: number;
}

export interface ViralSyncResult {
  referenceCutsMs: number[]; // timestamps no vídeo referência
  plan: CutSegment[]; // como recortar o vídeo do usuário
  outputUri?: string; // presente se render=true
}

export type ProgressFn = (ratio: number, stage: string) => void;

export class FFmpegError extends Error {
  constructor(
    message: string,
    public readonly stage: string,
    public readonly returnCode: number | null,
    public readonly logTail: string,
  ) {
    super(message);
    this.name = 'FFmpegError';
  }
}

// ───────────────────────────── Infra / util ─────────────────────────────────

const WORK_DIR = `${FileSystem.cacheDirectory}studio-ia/render/`;

async function ensureWorkDir() {
  const info = await FileSystem.getInfoAsync(WORK_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(WORK_DIR, { intermediates: true });
}

/** FFmpeg não entende `file://` em todos os builds — normaliza para path POSIX. */
const toPath = (uri: string) => decodeURI(uri.replace(/^file:\/\//, ''));

const sec = (ms: number) => (ms / 1000).toFixed(3);

/** Sessões ativas — permite cancelar tudo ao sair da tela. */
const activeSessions = new Set<number>();

export async function cancelAll() {
  for (const id of activeSessions) await FFmpegKit.cancel(id);
  activeSessions.clear();
}

/**
 * Executa FFmpeg de forma "promisificada", com:
 *  - captura incremental de logs (o callback chega numa thread nativa e é
 *    serializado para JS — por isso acumulamos em array e não em string),
 *  - progresso derivado de `Statistics.getTime()` (ms de saída já codificados),
 *  - erro tipado com o final do log (as últimas linhas contêm a causa real).
 */
function run(
  args: string[],
  stage: string,
  opts: { expectedDurationMs?: number; onProgress?: ProgressFn; onLog?: (line: string) => void } = {},
): Promise<{ logs: string[]; session: FFmpegSession }> {
  const logs: string[] = [];
  return new Promise((resolve, reject) => {
    FFmpegKit.executeWithArgumentsAsync(
      args,
      async (session) => {
        activeSessions.delete(session.getSessionId());
        const rc = await session.getReturnCode();
        if (ReturnCode.isSuccess(rc)) return resolve({ logs, session });
        if (ReturnCode.isCancel(rc)) {
          return reject(new FFmpegError('Operação cancelada pelo usuário.', stage, rc.getValue(), ''));
        }
        const tail = logs.slice(-25).join('');
        const failStack = (await session.getFailStackTrace()) ?? '';
        reject(
          new FFmpegError(
            `FFmpeg falhou em "${stage}" (rc=${rc?.getValue() ?? 'null'}). ${humanizeFFmpegError(tail)}`,
            stage,
            rc?.getValue() ?? null,
            tail + failStack,
          ),
        );
      },
      (log: Log) => {
        const msg = String(log.getMessage());
        logs.push(msg);
        opts.onLog?.(msg);
      },
      (stats: Statistics) => {
        if (opts.expectedDurationMs && opts.onProgress) {
          opts.onProgress(Math.min(0.999, stats.getTime() / opts.expectedDurationMs), stage);
        }
      },
    )
      .then((s) => activeSessions.add(s.getSessionId()))
      .catch((e) => reject(new FFmpegError(String(e?.message ?? e), stage, null, '')));
  });
}

/** Traduz os erros mais comuns do FFmpeg em mensagens acionáveis. */
function humanizeFFmpegError(tail: string): string {
  if (/No such file or directory/i.test(tail)) return 'Arquivo de entrada não encontrado.';
  if (/Invalid data found when processing input/i.test(tail)) return 'Formato de vídeo não suportado ou corrompido.';
  if (/Unknown encoder|Encoder not found/i.test(tail)) return 'Codec indisponível neste build do FFmpeg.';
  if (/Permission denied/i.test(tail)) return 'Sem permissão de leitura/escrita.';
  if (/No space left/i.test(tail)) return 'Armazenamento cheio.';
  if (/Error initializing filter|Invalid argument/i.test(tail)) return 'Grafo de filtros inválido.';
  return 'Veja o log técnico para detalhes.';
}

// ───────────────────────────── 1. Probe ─────────────────────────────────────

export async function probe(uri: string): Promise<ProbeResult> {
  const session = await FFprobeKit.getMediaInformation(toPath(uri));
  const info = session.getMediaInformation();
  if (!info) {
    throw new FFmpegError('Não foi possível ler os metadados do vídeo.', 'probe', null, (await session.getOutput()) ?? '');
  }
  const streams = info.getStreams();
  const v = streams.find((s) => s.getType() === 'video');
  const a = streams.find((s) => s.getType() === 'audio');
  if (!v) throw new FFmpegError('O arquivo não contém trilha de vídeo.', 'probe', null, '');

  const [num, den] = (v.getAverageFrameRate() ?? '30/1').split('/').map(Number);
  return {
    // o binding tipa como number, mas o valor nativo chega como string ("12.345")
    durationMs: Math.round(Number(info.getDuration() ?? 0) * 1000),
    width: v.getWidth() ?? 0,
    height: v.getHeight() ?? 0,
    fps: den ? num / den : num || 30,
    hasAudio: !!a,
  };
}

// ───────────────────────────── 2. Scene detection ───────────────────────────

/**
 * Coleta TODOS os candidatos com score > `floor` numa única passada.
 * O threshold final é decidido depois, em JS, sem decodificar o vídeo de novo.
 *
 * Saída do `metadata=print` (stderr), por frame selecionado:
 *   frame:12   pts:6144   pts_time:0.4
 *   lavfi.scene_score=0.512340
 */
export async function detectScenes(uri: string, onProgress?: ProgressFn, floor = 0.12): Promise<SceneCut[]> {
  const meta = await probe(uri);
  const args = [
    '-hide_banner', '-nostdin',
    '-i', toPath(uri),
    '-an', '-sn', '-dn',
    '-vf', `scale=320:-2,select='gt(scene\\,${floor})',metadata=print`,
    '-f', 'null', '-',
  ];
  const { logs } = await run(args, 'scene-detect', { expectedDurationMs: meta.durationMs, onProgress });

  const cuts: SceneCut[] = [];
  let pendingTime: number | null = null;
  for (const chunk of logs) {
    for (const line of chunk.split('\n')) {
      const t = line.match(/pts_time:([\d.]+)/);
      if (t) {
        pendingTime = parseFloat(t[1]);
        continue;
      }
      const s = line.match(/lavfi\.scene_score=([\d.]+)/);
      if (s && pendingTime !== null) {
        cuts.push({ ms: Math.round(pendingTime * 1000), score: parseFloat(s[1]) });
        pendingTime = null;
      }
    }
  }
  return cuts;
}

// ───────────────────────────── 3. Threshold adaptativo ──────────────────────

/**
 * Edits virais têm "flash brancos", shakes e glitches que geram picos de score
 * sem ser corte real. Estratégia:
 *   T = max(minAbs, μ + k·σ) sobre os scores candidatos
 *   + supressão de não-máximos numa janela `minGapMs` (fica o corte mais forte).
 */
export function adaptiveCuts(candidates: SceneCut[], opts = { k: 0.6, minAbs: 0.28, minGapMs: 180 }): number[] {
  if (candidates.length === 0) return [];
  const scores = candidates.map((c) => c.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  const T = Math.max(opts.minAbs, mean + opts.k * std);

  const strong = candidates.filter((c) => c.score >= T).sort((a, b) => a.ms - b.ms);
  const out: SceneCut[] = [];
  for (const c of strong) {
    const last = out[out.length - 1];
    if (last && c.ms - last.ms < opts.minGapMs) {
      if (c.score > last.score) out[out.length - 1] = c; // NMS: mantém o mais forte
    } else out.push(c);
  }
  return out.map((c) => c.ms);
}

// ───────────────────────────── 4. Plano de cortes ───────────────────────────

/**
 * Converte os cortes da referência em durações de plano e distribui esses planos
 * ao longo do vídeo do usuário.
 *
 * - `stride` avança pelo vídeo do usuário proporcionalmente, para usar material
 *   do começo ao fim (e não só os primeiros segundos).
 * - Cada início é "imantado" (snap) ao corte de cena mais próximo do vídeo do
 *   usuário dentro de ±snapMs, para não começar um plano no meio de um movimento.
 * - Se o vídeo do usuário for menor que a soma dos planos, faz wrap-around.
 */
export function buildCutPlan(
  refCutsMs: number[],
  refDurationMs: number,
  userDurationMs: number,
  userCutsMs: number[] = [],
  snapMs = 400,
): CutSegment[] {
  const bounds = [0, ...refCutsMs.filter((t) => t > 0 && t < refDurationMs), refDurationMs];
  const shots = bounds.slice(1).map((end, i) => end - bounds[i]).filter((d) => d >= 60);
  if (shots.length === 0 || userDurationMs <= 0) return [];

  const total = shots.reduce((a, b) => a + b, 0);
  const stride = userDurationMs > total ? (userDurationMs - total) / Math.max(1, shots.length) : 0;

  const snap = (t: number) => {
    let best = t;
    let bestDist = snapMs;
    for (const c of userCutsMs) {
      const d = Math.abs(c - t);
      if (d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  };

  const plan: CutSegment[] = [];
  let cursor = 0;
  let out = 0;
  for (const d of shots) {
    let start = snap(cursor);
    // plano mais longo que o vídeo do usuário → usa o vídeo inteiro (concat repete)
    if (d >= userDurationMs) start = 0;
    // passou do fim → wrap-around para o começo
    else if (start + d > userDurationMs) start = snap(0);
    start = Math.max(0, Math.min(start, Math.max(0, userDurationMs - d)));
    const end = Math.min(start + d, userDurationMs);
    plan.push({ srcStartMs: start, srcEndMs: end, outStartMs: out });
    cursor = end + stride;
    if (cursor >= userDurationMs) cursor = 0;
    out += end - start;
  }
  return plan;
}

// ───────────────────────────── 5. Render do plano ───────────────────────────

/**
 * Um único passo de encode (sem arquivos intermediários):
 *   [0:v] split=N → trim/setpts em cada ramo → concat → scale/pad para 9:16
 *   áudio = trilha da referência (-map 1:a), cortada com -shortest.
 */
export async function renderCutPlan(
  userUri: string,
  refUri: string,
  plan: CutSegment[],
  target: { w: number; h: number; bitrate: string },
  onProgress?: ProgressFn,
): Promise<string> {
  if (plan.length === 0) throw new FFmpegError('Plano de cortes vazio.', 'render', null, '');
  await ensureWorkDir();
  const out = `${WORK_DIR}viral_${Date.now()}.mp4`;
  const n = plan.length;

  const split = `[0:v]split=${n}${plan.map((_, i) => `[c${i}]`).join('')}`;
  const trims = plan.map(
    (s, i) => `[c${i}]trim=start=${sec(s.srcStartMs)}:end=${sec(s.srcEndMs)},setpts=PTS-STARTPTS[s${i}]`,
  );
  const concat = `${plan.map((_, i) => `[s${i}]`).join('')}concat=n=${n}:v=1:a=0[cat]`;
  const fit =
    `[cat]scale=${target.w}:${target.h}:force_original_aspect_ratio=decrease,` +
    `pad=${target.w}:${target.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30[vout]`;

  const ref = await probe(refUri);
  const totalMs = plan[n - 1].outStartMs + (plan[n - 1].srcEndMs - plan[n - 1].srcStartMs);

  const args = [
    '-y', '-hide_banner',
    '-i', toPath(userUri),
    '-i', toPath(refUri),
    '-filter_complex', [split, ...trims, concat, fit].join(';'),
    '-map', '[vout]',
    ...(ref.hasAudio ? ['-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k'] : []),
    ...videoEncoderArgs(target.bitrate),
    '-t', sec(totalMs),
    '-shortest',
    '-movflags', '+faststart',
    toPath(out),
  ];

  await runWithEncoderFallback(args, 'viral-render', totalMs, onProgress);
  return out;
}

// ───────────────────────────── Orquestrador principal ───────────────────────

/**
 * Função pedida no item B: recebe o Vídeo Referência + Vídeo Original,
 * detecta as mudanças de cena da referência localmente e devolve os timestamps
 * de corte (e opcionalmente já o MP4 renderizado no ritmo da referência).
 */
export async function syncToViralReference(
  referenceUri: string,
  userUri: string,
  options: {
    render?: boolean;
    target?: { w: number; h: number; bitrate: string };
    onProgress?: ProgressFn;
  } = {},
): Promise<ViralSyncResult> {
  const { onProgress } = options;
  const stage = (from: number, to: number): ProgressFn => (r, s) => onProgress?.(from + r * (to - from), s);

  try {
    const [refMeta, userMeta] = await Promise.all([probe(referenceUri), probe(userUri)]);
    if (refMeta.durationMs < 500) throw new FFmpegError('Vídeo referência curto demais.', 'validate', null, '');
    if (userMeta.durationMs < 500) throw new FFmpegError('Seu vídeo é curto demais.', 'validate', null, '');

    // As duas detecções são sequenciais de propósito: em celulares médios rodar
    // dois decoders H.264 em paralelo causa thermal throttling e fica MAIS lento.
    const refCandidates = await detectScenes(referenceUri, stage(0, 0.35));
    const refCuts = adaptiveCuts(refCandidates);

    const userCandidates = await detectScenes(userUri, stage(0.35, 0.6), 0.2);
    const userCuts = adaptiveCuts(userCandidates, { k: 0.3, minAbs: 0.22, minGapMs: 300 });

    const plan = buildCutPlan(refCuts, refMeta.durationMs, userMeta.durationMs, userCuts);
    if (plan.length === 0) {
      throw new FFmpegError('Nenhum corte detectado na referência. Tente outro vídeo.', 'plan', null, '');
    }

    let outputUri: string | undefined;
    if (options.render) {
      outputUri = await renderCutPlan(
        userUri,
        referenceUri,
        plan,
        options.target ?? { w: 1080, h: 1920, bitrate: '12M' },
        stage(0.6, 1),
      );
    }
    onProgress?.(1, 'done');
    return { referenceCutsMs: refCuts, plan, outputUri: outputUri ? `file://${toPath(outputUri)}` : undefined };
  } catch (e) {
    if (e instanceof FFmpegError) throw e;
    throw new FFmpegError(String((e as Error)?.message ?? e), 'viral-sync', null, '');
  }
}

// ───────────────────────────── Export final (composição) ────────────────────

/**
 * Exporta o projeto (vídeo MP4 ou foto PNG) aplicando formato, cor, efeito e
 * camadas. O grafo é montado em exportGraph.ts (código puro, testado contra o
 * FFmpeg real). Preview (Skia) e export usam o mesmo fator k = saída/preview.
 */
export async function exportProject(params: {
  mediaUri: string;
  mediaKind: 'video' | 'image';
  durationMs: number;
  preview: { w: number; h: number };
  target: { w: number; h: number; bitrate: string };
  adjust: ColorAdjust;
  effect: Effect;
  stickers: StickerLayer[];
  asPhoto?: boolean;
  onProgress?: ProgressFn;
}): Promise<string> {
  const { mediaUri, mediaKind, durationMs, preview, target, adjust, effect, stickers, onProgress } = params;
  const asPhoto = !!params.asPhoto;
  await ensureWorkDir();
  const out = `${WORK_DIR}export_${Date.now()}.${asPhoto ? 'png' : 'mp4'}`;
  const hasAudio = mediaKind === 'video' ? (await probe(mediaUri)).hasAudio : false;

  const { pre, post } = buildExportArgs({
    mediaPath: toPath(mediaUri),
    mediaKind,
    durationMs,
    preview,
    target,
    adjust,
    effect,
    layers: stickers.map((s) => ({ ...s, uri: toPath(s.uri) })),
    asPhoto,
    outPath: toPath(out),
    hasAudio,
  });

  if (asPhoto) {
    await run([...pre, ...post], 'export-photo');
    onProgress?.(1, 'export-photo');
  } else {
    await runWithEncoderFallback([...pre, ...videoEncoderArgs(target.bitrate), ...post], 'export', durationMs, onProgress);
  }
  return `file://${toPath(out)}`;
}

/** Resolução × formato → tamanho e bitrate de saída. */
export function targetFor(res: Resolution, aspect: Aspect) {
  const short = { '720P': 720, '1080P': 1080, '4K': 2160 }[res];
  const { w, h } = targetSize(short, ASPECT_RATIO[aspect]);
  return { w, h, bitrate: RESOLUTIONS[res].bitrate };
}

// ───────────────────────────── Encoder com fallback ─────────────────────────

/** Encoder de hardware primeiro (VideoToolbox / MediaCodec): 5–10× mais rápido e frio. */
function videoEncoderArgs(bitrate: string): string[] {
  if (Platform.OS === 'ios') return ['-c:v', 'h264_videotoolbox', '-b:v', bitrate, '-pix_fmt', 'yuv420p'];
  return ['-c:v', 'h264_mediacodec', '-b:v', bitrate, '-pix_fmt', 'yuv420p'];
}

const SOFTWARE_FALLBACKS: string[][] = [
  ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'],
  ['-c:v', 'mpeg4', '-q:v', '3', '-pix_fmt', 'yuv420p'], // último recurso: build sem GPL
];

/**
 * Se o encoder de hardware não existir no build (ou falhar em certos chipsets
 * Android, comum com MediaCodec), troca para software e tenta de novo.
 * Erros que NÃO são de encoder (arquivo ausente, filtro inválido) sobem direto.
 */
async function runWithEncoderFallback(args: string[], stage: string, durationMs: number, onProgress?: ProgressFn) {
  const cvIdx = args.indexOf('-c:v');
  const outPath = args[args.length - 1];
  const head = args.slice(0, cvIdx);
  const tail = args.slice(cvIdx).filter((_, i, arr) => {
    // remove o bloco do encoder original (-c:v X -b:v Y -pix_fmt Z)
    const encFlags = ['-c:v', '-b:v', '-pix_fmt'];
    return !(encFlags.includes(arr[i]) || (i > 0 && encFlags.includes(arr[i - 1])));
  });

  const attempts = [args, ...SOFTWARE_FALLBACKS.map((enc) => [...head, ...enc, ...tail])];
  let lastErr: FFmpegError | null = null;
  for (const attempt of attempts) {
    try {
      await run(attempt, stage, { expectedDurationMs: durationMs, onProgress });
      onProgress?.(1, stage);
      return;
    } catch (e) {
      lastErr = e as FFmpegError;
      const encoderIssue = /Unknown encoder|Encoder not found|Error while opening encoder|mediacodec|videotoolbox/i.test(
        lastErr.logTail,
      );
      if (!encoderIssue || lastErr.message.includes('cancelada')) throw lastErr;
      await FileSystem.deleteAsync(`file://${outPath}`, { idempotent: true });
    }
  }
  throw lastErr ?? new FFmpegError('Nenhum encoder disponível.', stage, null, '');
}
