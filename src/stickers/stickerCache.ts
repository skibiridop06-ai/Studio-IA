/**
 * Cache local de figurinhas em disco (LRU) + fila de download com concorrência
 * limitada + verificação de transparência lendo o cabeçalho PNG.
 *
 *  - Chave = SHA-1 da URL → nome de arquivo estável e sem caracteres inválidos.
 *  - Índice LRU persistido em JSON; ao passar de MAX_FILES, remove os mais antigos.
 *  - Downloads idênticos simultâneos são deduplicados (mesma Promise).
 *  - Máximo de 4 downloads em paralelo: rolar rápido uma lista de 180+ itens
 *    não abre 180 sockets nem estoura memória.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

const DIR = `${FileSystem.cacheDirectory}studio-ia/stickers/`;
const INDEX = `${DIR}index.json`;
const MAX_FILES = 400;
const CONCURRENCY = 4;

type Index = Record<string, number>; // filename → lastAccess
let index: Index | null = null;
let indexDirty = false;

async function loadIndex(): Promise<Index> {
  if (index) return index;
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  try {
    index = JSON.parse(await FileSystem.readAsStringAsync(INDEX));
  } catch {
    index = {};
  }
  return index!;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush() {
  indexDirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (!indexDirty || !index) return;
    indexDirty = false;
    await FileSystem.writeAsStringAsync(INDEX, JSON.stringify(index)).catch(() => {});
    await evict();
  }, 1500);
}

async function evict() {
  if (!index) return;
  const entries = Object.entries(index);
  if (entries.length <= MAX_FILES) return;
  entries.sort((a, b) => a[1] - b[1]);
  for (const [file] of entries.slice(0, entries.length - MAX_FILES)) {
    delete index[file];
    await FileSystem.deleteAsync(DIR + file, { idempotent: true });
  }
  await FileSystem.writeAsStringAsync(INDEX, JSON.stringify(index)).catch(() => {});
}

// ───────────── Fila de concorrência ─────────────
let running = 0;
const queue: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

const inflight = new Map<string, Promise<string>>();

/** Devolve um file:// local para a URL, baixando se necessário. */
export async function getCached(url: string): Promise<string> {
  const idx = await loadIndex();
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, url);
  const file = `${hash}.png`;
  const path = DIR + file;

  if (idx[file]) {
    idx[file] = Date.now();
    scheduleFlush();
    return path;
  }
  const existing = inflight.get(file);
  if (existing) return existing;

  const p = withSlot(async () => {
    const res = await FileSystem.downloadAsync(url, path);
    if (res.status < 200 || res.status >= 300) {
      await FileSystem.deleteAsync(path, { idempotent: true });
      throw new Error(`HTTP ${res.status}`);
    }
    idx[file] = Date.now();
    scheduleFlush();
    return path;
  }).finally(() => inflight.delete(file));
  inflight.set(file, p);
  return p;
}

/**
 * Verifica transparência real SEM decodificar a imagem:
 * lê só os primeiros ~4 KB do PNG.
 *   - IHDR.colorType (byte 25): 4 = gray+alpha, 6 = RGBA → tem canal alpha
 *   - colorType 3 (paleta) só é transparente se existir um chunk `tRNS`
 */
export async function hasAlphaChannel(localUri: string): Promise<boolean> {
  try {
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4096,
    });
    const bin = globalThis.atob(b64);
    const sig = [0x89, 0x50, 0x4e, 0x47];
    if (!sig.every((v, i) => bin.charCodeAt(i) === v)) return false; // não é PNG
    const colorType = bin.charCodeAt(25);
    if (colorType === 4 || colorType === 6) return true;
    if (colorType === 3) return bin.includes('tRNS');
    return false;
  } catch {
    return false;
  }
}

export async function clearStickerCache() {
  await FileSystem.deleteAsync(DIR, { idempotent: true });
  index = null;
}
