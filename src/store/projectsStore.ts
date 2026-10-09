/**
 * Projetos salvos no aparelho (JSON em documentDirectory).
 *
 * A mídia escolhida na galeria é COPIADA para a pasta do app: o URI que o
 * seletor devolve fica no cache e pode ser apagado pelo sistema a qualquer
 * momento, o que quebraria projetos antigos.
 */
import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as ImagePicker from 'expo-image-picker';
import { useEditor, type Aspect, type ColorAdjust, type MediaSource, type StickerLayer } from './editorStore';
import { Skia, ImageFormat } from '@shopify/react-native-skia';

const DIR = `${FileSystem.documentDirectory}projects/`;
const INDEX = `${DIR}index.json`;

export interface Project {
  id: string;
  name: string;
  media: MediaSource;
  thumbUri: string;
  stickers: StickerLayer[];
  adjust: ColorAdjust;
  effect?: string;
  aspect?: Aspect;
  createdAt: number;
  updatedAt: number;
}

interface ProjectsState {
  projects: Project[];
  loaded: boolean;
  currentId: string | null;
  load: () => Promise<void>;
  /** Abre a galeria, copia a mídia, cria o projeto e já carrega no editor. */
  createFromPicker: (kind: 'video' | 'image' | 'any') => Promise<Project | null>;
  open: (id: string) => Project | null;
  /** Formato estilo Canva: canvas em branco/degradê na proporção escolhida. */
  createBlank: (aspect: Aspect, colors: [string, string], name: string) => Promise<Project>;
  saveCurrent: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
}

const uid = () => `prj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function persist(projects: Project[]) {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  await FileSystem.writeAsStringAsync(INDEX, JSON.stringify(projects));
}

async function makeThumb(media: MediaSource, folder: string): Promise<string> {
  if (media.kind === 'image') return media.uri;
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(media.uri, { time: 0, quality: 0.5 });
    const dest = `${folder}thumb.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return '';
  }
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  loaded: false,
  currentId: null,

  load: async () => {
    try {
      const raw = await FileSystem.readAsStringAsync(INDEX);
      const list: Project[] = JSON.parse(raw);
      set({ projects: list.sort((a, b) => b.updatedAt - a.updatedAt), loaded: true });
    } catch {
      set({ projects: [], loaded: true });
    }
  },

  createFromPicker: async (kind) => {
    const mediaTypes: ImagePicker.MediaType[] = kind === 'video' ? ['videos'] : kind === 'image' ? ['images'] : ['videos', 'images'];
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 1 });
    if (res.canceled) return null;
    const a = res.assets[0];

    const id = uid();
    const folder = `${DIR}${id}/`;
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    const ext = (a.fileName?.split('.').pop() ?? (a.type === 'video' ? 'mp4' : 'jpg')).toLowerCase();
    const dest = `${folder}media.${ext}`;
    await FileSystem.copyAsync({ from: a.uri, to: dest });

    const media: MediaSource = {
      uri: dest,
      kind: a.type === 'video' ? 'video' : 'image',
      durationMs: a.type === 'video' ? Math.max(500, a.duration ?? 0) : 10_000,
      width: a.width,
      height: a.height,
    };
    const now = Date.now();
    const n = get().projects.length + 1;
    const project: Project = {
      id,
      name: `Projeto ${String(n).padStart(2, '0')}`,
      media,
      thumbUri: await makeThumb(media, folder),
      stickers: [],
      adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0 },
      aspect: a.width > a.height * 1.2 ? '16:9' : '9:16',
      createdAt: now,
      updatedAt: now,
    };
    const projects = [project, ...get().projects];
    set({ projects, currentId: id });
    await persist(projects);

    useEditor.setState({
      media,
      stickers: [],
      selectedId: null,
      cutPoints: [],
      playheadMs: 0,
      isPlaying: false,
      activeTool: null,
      adjust: project.adjust,
      aspect: project.aspect!,
      effectId: 'original',
    });
    return project;
  },

  open: (id) => {
    const p = get().projects.find((x) => x.id === id);
    if (!p) return null;
    set({ currentId: id });
    useEditor.setState({
      media: p.media,
      stickers: p.stickers,
      selectedId: null,
      cutPoints: [],
      playheadMs: 0,
      isPlaying: false,
      activeTool: null,
      adjust: p.adjust,
      aspect: p.aspect ?? '9:16',
      effectId: p.effect ?? 'original',
    });
    return p;
  },

  createBlank: async (aspect, colors, name) => {
    const id = uid();
    const folder = `${DIR}${id}/`;
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    const ratio = { '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 }[aspect];
    const W = ratio >= 1 ? 1920 : 1080;
    const H = Math.round(W / ratio);
    const surface = Skia.Surface.Make(W, H);
    if (!surface) throw new Error('Falha ao criar o fundo.');
    const paint = Skia.Paint();
    paint.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: 0, y: 0 },
        { x: W * 0.3, y: H },
        [Skia.Color(colors[0]), Skia.Color(colors[1])],
        null,
        0,
      ),
    );
    surface.getCanvas().drawRect(Skia.XYWHRect(0, 0, W, H), paint);
    surface.flush();
    const uri = `${folder}fundo.png`;
    await FileSystem.writeAsStringAsync(uri, surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG, 100), {
      encoding: FileSystem.EncodingType.Base64,
    });
    const media: MediaSource = { uri, kind: 'image', durationMs: 10_000, width: W, height: H };
    const now = Date.now();
    const project: Project = {
      id, name, media, thumbUri: uri, stickers: [], aspect, effect: 'original',
      adjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0 }, createdAt: now, updatedAt: now,
    };
    const projects = [project, ...get().projects];
    set({ projects, currentId: id });
    await persist(projects);
    useEditor.setState({
      media, stickers: [], selectedId: null, cutPoints: [], playheadMs: 0, isPlaying: false,
      activeTool: null, adjust: project.adjust, aspect, effectId: 'original',
    });
    return project;
  },

  saveCurrent: async () => {
    const { currentId, projects } = get();
    const ed = useEditor.getState();
    if (!currentId || !ed.media) return;
    // Mídia gerada no editor (corte viral, super-resolução) nasce no cache: traz para o projeto
    const folder = `${DIR}${currentId}/`;
    if (!ed.media.uri.startsWith(folder)) {
      const dest = `${folder}media_${Date.now()}.${ed.media.kind === 'video' ? 'mp4' : 'png'}`;
      try {
        await FileSystem.copyAsync({ from: ed.media.uri, to: dest });
        useEditor.setState({ media: { ...ed.media, uri: dest } });
      } catch {
        /* mantém o caminho original */
      }
    }
    const media = useEditor.getState().media!;
    const next = projects
      .map((p) =>
        p.id === currentId
          ? { ...p, media, stickers: ed.stickers, adjust: ed.adjust, effect: ed.effectId, aspect: ed.aspect, updatedAt: Date.now() }
          : p,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
    set({ projects: next });
    await persist(next);
  },

  remove: async (id) => {
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects, currentId: get().currentId === id ? null : get().currentId });
    await persist(projects);
    await FileSystem.deleteAsync(`${DIR}${id}/`, { idempotent: true });
  },

  rename: async (id, name) => {
    const projects = get().projects.map((p) => (p.id === id ? { ...p, name } : p));
    set({ projects });
    await persist(projects);
  },
}));
