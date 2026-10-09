/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Studio IA — IA Local (ONNX Runtime + Skia como "ISP" de pixels)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Nada sai do aparelho. Os modelos .onnx ficam em /assets/models e são
 *  empacotados no app (Metro: assetExts += 'onnx').
 *
 *  Por que Skia aqui (e não um canvas/JS puro)?
 *   - Decodificar PNG/JPEG, redimensionar e compor alpha em JS seria ~100× mais
 *     lento. Skia faz decode nativo, `drawImageRect` com filtro bilinear/mipmap e
 *     blend modes (DstIn) em C++ — e nos devolve um `Uint8Array` RGBA via
 *     `readPixels`, que vira tensor Float32 com um único loop.
 *
 *  Modelos sugeridos (todos com licença permissiva, rodam offline):
 *   - Remoção de fundo:  U²-Netp (4.7 MB, 320×320) ou MODNet (para retratos).
 *   - Super-resolução:   Real-ESRGAN "realesr-general-x4v3" (≈4.8 MB, ×4).
 *
 *  Execution Providers:
 *   - iOS     → CoreML (Neural Engine / GPU)
 *   - Android → NNAPI (DSP/GPU/NPU) com fallback para CPU (XNNPACK)
 */
import { NativeModules, Platform } from 'react-native';
import type { InferenceSession as OrtSession, Tensor as OrtTensor } from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Skia,
  AlphaType,
  ColorType,
  BlendMode,
  FilterMode,
  MipmapMode,
  ImageFormat,
  type SkImage,
} from '@shopify/react-native-skia';
import { useCallback, useRef, useState } from 'react';

// ───────────────────────────── Registro de modelos ──────────────────────────

const MODELS = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  bgRemoval: () => require('../../assets/models/u2netp.onnx'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  superRes: () => require('../../assets/models/realesr-general-x4v3.onnx'),
} as const;
type ModelKey = keyof typeof MODELS;

/**
 * Carregamento PREGUIÇOSO do ONNX Runtime: o módulo instala a ponte JSI no
 * momento do import. Fazer isso na abertura do app derruba tudo se a ponte
 * falhar; aqui ele só carrega quando o usuário usa uma função de IA, e uma
 * falha vira mensagem de erro, não um crash.
 */
type OrtModule = typeof import('onnxruntime-react-native');
let ortCache: OrtModule | null = null;
function ort(): OrtModule {
  if (ortCache) return ortCache;
  // Checa o módulo nativo ANTES do require: se o import do binding falhar, o
  // Metro reporta como erro fatal global (não dá para capturar com try/catch).
  if (!NativeModules.Onnxruntime) {
    throw new Error(
      'A IA local ainda não é compatível com esta versão do Android. Essa função volta numa próxima atualização.',
    );
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: OrtModule = require('onnxruntime-react-native');
    // o binding expõe um Proxy que lança se a instalação JSI falhou
    if (typeof (globalThis as any).OrtApi === 'undefined') throw new Error('ponte JSI não instalada');
    ortCache = mod;
    return mod;
  } catch (e) {
    throw new Error(`A IA local não está disponível neste aparelho (${(e as Error).message}).`);
  }
}

/** A IA local pode ser usada neste aparelho/versão? (módulo nativo registrado) */
export const aiAvailable = () => !!NativeModules.Onnxruntime;

const sessions = new Map<ModelKey, Promise<OrtSession>>();

/** Carrega (uma vez) e mantém a sessão em memória. Tenta acelerador → CPU. */
function getSession(key: ModelKey): Promise<OrtSession> {
  const cached = sessions.get(key);
  if (cached) return cached;

  const p = (async () => {
    const { InferenceSession } = ort();
    const asset = Asset.fromModule(MODELS[key]());
    await asset.downloadAsync(); // em produção apenas copia do bundle p/ disco
    const path = (asset.localUri ?? asset.uri).replace(/^file:\/\//, '');
    const accel = Platform.OS === 'ios' ? 'coreml' : 'nnapi';
    try {
      return await InferenceSession.create(path, {
        executionProviders: [accel, 'cpu'],
        graphOptimizationLevel: 'all',
      });
    } catch {
      // Alguns chipsets não suportam todos os ops no NNAPI/CoreML.
      return InferenceSession.create(path, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' });
    }
  })();
  sessions.set(key, p);
  p.catch(() => sessions.delete(key)); // permite retry após erro
  return p;
}

export async function releaseModels() {
  for (const [k, p] of sessions) {
    try {
      await (await p).release();
    } catch {
      /* noop */
    }
    sessions.delete(k);
  }
}

// ───────────────────────────── Skia pixel I/O ───────────────────────────────

const RGBA = { colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear };

async function loadImage(uri: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) throw new Error('Não foi possível decodificar a imagem.');
  return img;
}

/** Redimensiona (ou recorta `src`) para W×H e devolve RGBA 8-bit. */
function readResized(img: SkImage, W: number, H: number, src = Skia.XYWHRect(0, 0, img.width(), img.height())): Uint8Array {
  const surface = Skia.Surface.Make(W, H); // raster (CPU): readPixels sem round-trip GPU
  if (!surface) throw new Error('Falha ao alocar superfície.');
  const canvas = surface.getCanvas();
  canvas.drawImageRectOptions(img, src, Skia.XYWHRect(0, 0, W, H), SAMPLING.filter, SAMPLING.mipmap);
  surface.flush();
  const px = surface.makeImageSnapshot().readPixels(0, 0, { width: W, height: H, ...RGBA });
  if (!px) throw new Error('readPixels retornou nulo.');
  return px as Uint8Array;
}

function imageFromRGBA(bytes: Uint8Array, W: number, H: number): SkImage {
  const img = Skia.Image.MakeImage({ width: W, height: H, ...RGBA }, Skia.Data.fromBytes(bytes), W * 4);
  if (!img) throw new Error('Falha ao montar imagem a partir dos pixels.');
  return img;
}

async function savePNG(img: SkImage, prefix: string): Promise<string> {
  const dir = `${FileSystem.cacheDirectory}studio-ia/ai/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const uri = `${dir}${prefix}_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(uri, img.encodeToBase64(ImageFormat.PNG, 100), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

// RGBA (HWC, uint8) → Float32 NCHW normalizado
function toNCHW(px: Uint8Array, W: number, H: number, mean = [0, 0, 0], std = [1, 1, 1]): Float32Array {
  const plane = W * H;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    out[i] = (px[p] / 255 - mean[0]) / std[0];
    out[i + plane] = (px[p + 1] / 255 - mean[1]) / std[1];
    out[i + 2 * plane] = (px[p + 2] / 255 - mean[2]) / std[2];
  }
  return out;
}

// ───────────────────────────── Remoção de fundo ─────────────────────────────

export interface CutoutResult {
  uri: string; // PNG transparente recortado no bounding box do objeto
  width: number;
  height: number;
}

/**
 * 1. Reduz para 320×320 e normaliza (ImageNet mean/std) → tensor 1×3×320×320
 * 2. U²-Net devolve o mapa de saliência d0 (1×1×320×320), já em sigmoid
 * 3. Min-max + curva de contraste suave → máscara alpha 8-bit
 * 4. COMPOSIÇÃO NA SKIA: desenha a imagem original e, por cima, a máscara
 *    ampliada com BlendMode.DstIn → o alpha da máscara "recorta" o original
 *    com interpolação bilinear (bordas suaves, sem serrilhado de 320px).
 * 5. Auto-crop pelo bounding box da máscara → figurinha pronta.
 */
export async function removeBackground(uri: string, onProgress?: (r: number) => void): Promise<CutoutResult> {
  const S = 320;
  const session = await getSession('bgRemoval');
  onProgress?.(0.15);

  const src = await loadImage(uri);
  const W = src.width();
  const H = src.height();
  const px = readResized(src, S, S);
  const { Tensor } = ort();
  const input: OrtTensor = new Tensor('float32', toNCHW(px, S, S, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]), [1, 3, S, S]);
  onProgress?.(0.3);

  const outputs = await session.run({ [session.inputNames[0]]: input });
  const pred = outputs[session.outputNames[0]].data as Float32Array;
  onProgress?.(0.75);

  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < pred.length; i++) {
    if (pred[i] < mn) mn = pred[i];
    if (pred[i] > mx) mx = pred[i];
  }
  const range = mx - mn || 1;
  const mask = new Uint8Array(S * S * 4);
  let x0 = S, y0 = S, x1 = 0, y1 = 0;
  for (let i = 0; i < S * S; i++) {
    let a = (pred[i] - mn) / range;
    a = a * a * (3 - 2 * a); // smoothstep: endurece a borda sem serrilhar
    const v = Math.round(a * 255);
    mask[i * 4 + 3] = v; // só o alpha importa para DstIn
    if (v > 24) {
      const x = i % S;
      const y = (i / S) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 <= x0 || y1 <= y0) throw new Error('Nenhum objeto em destaque encontrado na imagem.');

  // Composição em resolução cheia
  const full = Skia.Surface.Make(W, H);
  if (!full) throw new Error('Falha ao alocar superfície.');
  const c = full.getCanvas();
  c.drawImage(src, 0, 0);
  const maskPaint = Skia.Paint();
  maskPaint.setBlendMode(BlendMode.DstIn);
  c.drawImageRectOptions(
    imageFromRGBA(mask, S, S),
    Skia.XYWHRect(0, 0, S, S),
    Skia.XYWHRect(0, 0, W, H),
    SAMPLING.filter,
    SAMPLING.mipmap,
    maskPaint,
  );
  full.flush();
  const composed = full.makeImageSnapshot();

  // Auto-crop (bbox da máscara + 2% de margem), ainda via GPU/Skia
  const pad = 0.02;
  const bx = Math.max(0, (x0 / S - pad) * W);
  const by = Math.max(0, (y0 / S - pad) * H);
  const bw = Math.min(W - bx, ((x1 - x0) / S + 2 * pad) * W);
  const bh = Math.min(H - by, ((y1 - y0) / S + 2 * pad) * H);
  const crop = Skia.Surface.Make(Math.round(bw), Math.round(bh));
  if (!crop) throw new Error('Falha ao alocar superfície.');
  crop.getCanvas().drawImageRect(composed, Skia.XYWHRect(bx, by, bw, bh), Skia.XYWHRect(0, 0, bw, bh), Skia.Paint());
  crop.flush();
  const out = crop.makeImageSnapshot();

  const saved = await savePNG(out, 'cutout');
  onProgress?.(1);
  return { uri: saved, width: out.width(), height: out.height() };
}

// ───────────────────────────── Super-resolução ×4 ───────────────────────────

/**
 * Real-ESRGAN em TILES: a imagem inteira não cabe na memória de NPU de um
 * celular. Cada tile de 128px (+ 10px de sobreposição para esconder costura) é
 * inferido separadamente e desenhado numa superfície ×4 — só a área "interna"
 * de cada tile é usada, então as bordas com artefato ficam de fora.
 */
export async function superResolve(uri: string, onProgress?: (r: number) => void, maxInputSide = 768): Promise<string> {
  const SCALE = 4;
  const TILE = 128;
  const OV = 10;
  const session = await getSession('superRes');

  let src = await loadImage(uri);
  // proteção de memória: 768px → 3072px de saída (~36 MB RGBA)
  const f = Math.min(1, maxInputSide / Math.max(src.width(), src.height()));
  if (f < 1) {
    const w = Math.round(src.width() * f);
    const h = Math.round(src.height() * f);
    src = imageFromRGBA(readResized(src, w, h), w, h);
  }
  const W = src.width();
  const H = src.height();
  const outSurf = Skia.Surface.Make(W * SCALE, H * SCALE);
  if (!outSurf) throw new Error('Imagem grande demais para super-resolução.');
  const oc = outSurf.getCanvas();

  const tilesX = Math.ceil(W / TILE);
  const tilesY = Math.ceil(H / TILE);
  const total = tilesX * tilesY;
  let done = 0;

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      // região interna (o que realmente vai para a saída)
      const ix = tx * TILE;
      const iy = ty * TILE;
      const iw = Math.min(TILE, W - ix);
      const ih = Math.min(TILE, H - iy);
      // região expandida (com sobreposição) que vai para o modelo
      const ex = Math.max(0, ix - OV);
      const ey = Math.max(0, iy - OV);
      const ew = Math.min(W, ix + iw + OV) - ex;
      const eh = Math.min(H, iy + ih + OV) - ey;

      const px = readResized(src, ew, eh, Skia.XYWHRect(ex, ey, ew, eh));
      const input: OrtTensor = new (ort().Tensor)('float32', toNCHW(px, ew, eh), [1, 3, eh, ew]);
      const res = await session.run({ [session.inputNames[0]]: input });
      const o = res[session.outputNames[0]];
      const [, , OH, OW] = o.dims as number[];
      const data = o.data as Float32Array;

      const plane = OW * OH;
      const rgba = new Uint8Array(plane * 4);
      for (let i = 0; i < plane; i++) {
        rgba[i * 4] = Math.max(0, Math.min(255, data[i] * 255));
        rgba[i * 4 + 1] = Math.max(0, Math.min(255, data[i + plane] * 255));
        rgba[i * 4 + 2] = Math.max(0, Math.min(255, data[i + 2 * plane] * 255));
        rgba[i * 4 + 3] = 255;
      }
      const tileImg = imageFromRGBA(rgba, OW, OH);
      // corta a margem de sobreposição e posiciona no ×4
      oc.drawImageRect(
        tileImg,
        Skia.XYWHRect((ix - ex) * SCALE, (iy - ey) * SCALE, iw * SCALE, ih * SCALE),
        Skia.XYWHRect(ix * SCALE, iy * SCALE, iw * SCALE, ih * SCALE),
        Skia.Paint(),
      );
      onProgress?.(++done / total);
      // cede o thread JS entre tiles para a UI continuar respondendo
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  outSurf.flush();
  return savePNG(outSurf.makeImageSnapshot(), 'upscaled');
}

// ───────────────────────────── Hook React ───────────────────────────────────

export type AIStatus = 'idle' | 'loading-model' | 'running' | 'done' | 'error';

export function useLocalAI() {
  const [status, setStatus] = useState<AIStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const wrap = useCallback(
    <T,>(fn: (p: (r: number) => void) => Promise<T>) =>
      async (): Promise<T | null> => {
        if (busy.current) return null;
        busy.current = true;
        setError(null);
        setProgress(0);
        setStatus('loading-model');
        try {
          const r = await fn((x) => {
            setStatus('running');
            setProgress(x);
          });
          setStatus('done');
          return r;
        } catch (e) {
          setError((e as Error).message);
          setStatus('error');
          return null;
        } finally {
          busy.current = false;
        }
      },
    [],
  );

  return {
    status,
    progress,
    error,
    removeBackground: (uri: string) => wrap((p) => removeBackground(uri, p))(),
    superResolve: (uri: string) => wrap((p) => superResolve(uri, p))(),
  };
}
