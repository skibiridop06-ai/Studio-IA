/**
 * Provedores de figurinhas + hook de busca paginada infinita.
 *
 * A busca é desacoplada da fonte (interface `StickerProvider`). O provedor
 * padrão usa o Openverse — índice aberto de imagens com licença livre
 * (Creative Commons / domínio público), gratuito e sem chave de API — então
 * cada figurinha vem com autor e licença para crédito no export.
 *
 * Fluxo por página:
 *   query → provider.search(page) → download com cache LRU (4 em paralelo)
 *         → filtro de transparência local (cabeçalho PNG) → append na lista.
 *
 * Itens sem alpha não são descartados: ficam marcados `needsCutout` e o
 * usuário pode recortá-los com a IA local (U²-Net) com um toque.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCached, hasAlphaChannel } from './stickerCache';

export interface StickerHit {
  id: string;
  remoteUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  title: string;
  creator?: string;
  license?: string;
  licenseUrl?: string;
}

export interface StickerItem extends StickerHit {
  localUri: string | null; // preenchido quando o download termina
  transparent: boolean | null; // null = ainda verificando
}

export interface StickerProvider {
  name: string;
  pageSize: number;
  search(query: string, page: number, signal: AbortSignal): Promise<{ hits: StickerHit[]; hasMore: boolean }>;
}

// ───────────────────────────── Openverse ────────────────────────────────────

export const OpenverseProvider: StickerProvider = {
  name: 'Openverse',
  pageSize: 20,
  async search(query, page, signal) {
    const q = encodeURIComponent(query.replace(/\bpng\b/gi, '').trim() || query);
    const url =
      `https://api.openverse.org/v1/images/?q=${q}&page=${page}&page_size=${this.pageSize}` +
      `&extension=png&mature=false`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (res.status === 429) throw new Error('Muitas buscas seguidas — aguarde alguns segundos.');
    if (!res.ok) throw new Error(`Busca falhou (HTTP ${res.status}).`);
    const json = await res.json();
    const hits: StickerHit[] = (json.results ?? []).map((r: any) => ({
      id: `ov_${r.id}`,
      remoteUrl: r.url,
      thumbUrl: r.thumbnail ?? r.url,
      width: r.width ?? 512,
      height: r.height ?? 512,
      title: r.title ?? query,
      creator: r.creator,
      license: r.license ? `CC ${String(r.license).toUpperCase()} ${r.license_version ?? ''}`.trim() : undefined,
      licenseUrl: r.license_url,
    }));
    return { hits, hasMore: page < (json.page_count ?? 0) };
  },
};

// ───────────────────────────── Hook de busca infinita ───────────────────────

const PREFETCH_PAGES = 2; // mantém sempre ~40 itens à frente do scroll

export function useStickerSearch(query: string, provider: StickerProvider = OpenverseProvider) {
  const [items, setItems] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(0);
  const seen = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true); // ref: evita closure velha após reset da busca

  /** Atualiza um item sem recriar a lista inteira (FlashList recicla células). */
  const patch = useCallback((id: string, p: Partial<StickerItem>) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      if (i < 0) return prev;
      const next = prev.slice();
      next[i] = { ...next[i], ...p };
      return next;
    });
  }, []);

  const hydrate = useCallback(
    (hit: StickerHit) => {
      getCached(hit.remoteUrl)
        .then(async (localUri) => {
          const transparent = await hasAlphaChannel(localUri);
          patch(hit.id, { localUri, transparent });
        })
        .catch(() => {
          // remove itens cujo download falhou (link morto, 403 etc.)
          setItems((prev) => prev.filter((x) => x.id !== hit.id));
        });
    },
    [patch],
  );

  const loadPage = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current || !query.trim()) return;
    loadingRef.current = true;
    setLoading(true);
    const ctrl = abortRef.current ?? new AbortController();
    abortRef.current = ctrl;
    try {
      for (let k = 0; k < PREFETCH_PAGES; k++) {
        const page = ++pageRef.current;
        const { hits, hasMore: more } = await provider.search(query, page, ctrl.signal);
        const fresh = hits.filter((h) => !seen.current.has(h.id) && seen.current.add(h.id));
        setItems((prev) => [...prev, ...fresh.map((h) => ({ ...h, localUri: null, transparent: null }))]);
        fresh.forEach(hydrate);
        if (!more) {
          hasMoreRef.current = false;
          setHasMore(false);
          break;
        }
      }
      setError(null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        pageRef.current = Math.max(0, pageRef.current - 1); // permite retry da mesma página
        setError((e as Error).message);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [query, provider, hydrate]);

  // Reset com debounce a cada nova busca
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pageRef.current = 0;
    seen.current = new Set();
    setItems([]);
    hasMoreRef.current = true;
    setHasMore(true);
    setError(null);
    if (!query.trim()) return;
    const t = setTimeout(() => {
      loadingRef.current = false;
      loadPage();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, provider]);

  return { items, loading, error, hasMore, loadMore: loadPage, patch };
}
