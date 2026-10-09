/**
 * Tela inicial com abas: Início · Modelos · IA · Projetos · Eu.
 * Layout inspirado nos editores populares (cards grandes de criar, projetos
 * recentes, grade de ferramentas, carrossel de modelos), no tema Ultra-Dark.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Canvas, Circle, Group, LinearGradient, Rect, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { COLORS, GLOW, HAIRLINE, RADIUS, SPACING, TYPE } from '../theme';
import { useProjects, type Project } from '../store/projectsStore';
import type { Aspect } from '../store/editorStore';
import { TEMPLATES, type EditorTool, type Template, type TemplateArt } from '../home/templates';
import { aiAvailable } from '../engine/localAI';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/icon.png');

export interface OpenEditor {
  tool?: EditorTool | null;
  effect?: string | null;
}
type FeatherName = React.ComponentProps<typeof Feather>['name'];
type Tab = 'home' | 'templates' | 'ai' | 'projects' | 'me';

const TABS: { id: Tab; label: string; icon: FeatherName }[] = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'templates', label: 'Modelos', icon: 'grid' },
  { id: 'ai', label: 'IA', icon: 'cpu' },
  { id: 'projects', label: 'Projetos', icon: 'folder' },
  { id: 'me', label: 'Eu', icon: 'user' },
];

const DESIGN_FORMATS: { aspect: Aspect; name: string; hint: string; colors: [string, string] }[] = [
  { aspect: '9:16', name: 'Story', hint: 'Reels · TikTok', colors: ['#1C1C22', '#050506'] },
  { aspect: '1:1', name: 'Post', hint: 'Quadrado', colors: ['#2A2A31', '#0B0B0D'] },
  { aspect: '4:5', name: 'Feed', hint: 'Retrato', colors: ['#202027', '#08080A'] },
  { aspect: '16:9', name: 'YouTube', hint: 'Thumbnail', colors: ['#25252B', '#09090B'] },
];
const BACKGROUNDS: { name: string; colors: [string, string] }[] = [
  { name: 'Grafite', colors: ['#1C1C22', '#050506'] },
  { name: 'Branco', colors: ['#FFFFFF', '#E4E4E7'] },
  { name: 'Noite', colors: ['#1E2A44', '#05070D'] },
  { name: 'Pôr do sol', colors: ['#FF7A59', '#5B1A6E'] },
  { name: 'Neon', colors: ['#7C3AED', '#0EA5E9'] },
  { name: 'Floresta', colors: ['#14532D', '#020617'] },
];

export function HomeScreen({ onOpenEditor }: { onOpenEditor: (o?: OpenEditor) => void }) {
  const [tab, setTab] = useState<Tab>('home');
  const projects = useProjects((s) => s.projects);

  /** Cria um projeto escolhendo mídia da galeria e abre o editor. */
  const start = async (media: 'video' | 'image' | 'any', o?: OpenEditor) => {
    try {
      const p = await useProjects.getState().createFromPicker(media);
      if (p) onOpenEditor(o);
    } catch (e) {
      Alert.alert('Não foi possível abrir', (e as Error).message);
    }
  };
  const startBlank = async (aspect: Aspect, colors: [string, string], name: string) => {
    try {
      await useProjects.getState().createBlank(aspect, colors, name);
      onOpenEditor({ tool: 'text' });
    } catch (e) {
      Alert.alert('Não foi possível criar', (e as Error).message);
    }
  };
  const useTemplate = (t: Template) => start(t.media, { tool: t.tool ?? null, effect: t.effect });
  const openProject = (p: Project) => {
    if (useProjects.getState().open(p.id)) onOpenEditor();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomeTab
            projects={projects}
            start={start}
            startBlank={startBlank}
            useTemplate={useTemplate}
            openProject={openProject}
            goTab={setTab}
          />
        )}
        {tab === 'templates' && <TemplatesTab useTemplate={useTemplate} startBlank={startBlank} />}
        {tab === 'ai' && <AITab start={start} />}
        {tab === 'projects' && <ProjectsTab projects={projects} openProject={openProject} start={start} />}
        {tab === 'me' && <MeTab projects={projects} />}
      </View>

      {/* Barra de abas */}
      <SafeAreaView edges={['bottom']} style={styles.tabBar}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)} style={styles.tabBtn}>
              <Feather name={t.icon} size={21} color={on ? COLORS.TEXT_PRIMARY : COLORS.TEXT_SECONDARY} />
              <Text style={[styles.tabLabel, on && { color: COLORS.TEXT_PRIMARY }]}>{t.label}</Text>
              {on && <View style={styles.tabDot} />}
            </Pressable>
          );
        })}
      </SafeAreaView>
    </SafeAreaView>
  );
}

// ═════════════════════════════ Início ═══════════════════════════════════════

const TOOLS: { label: string; icon: FeatherName; media: 'video' | 'image' | 'any'; o: OpenEditor; ai?: boolean }[] = [
  { label: 'Corte viral', icon: 'zap', media: 'video', o: { tool: 'cut' } },
  { label: 'Efeitos', icon: 'star', media: 'any', o: { tool: 'effects' } },
  { label: 'Texto', icon: 'type', media: 'any', o: { tool: 'text' } },
  { label: 'Figurinhas', icon: 'smile', media: 'any', o: { tool: 'stickers' } },
  { label: 'Ajustes', icon: 'sliders', media: 'any', o: { tool: 'filters' } },
  { label: 'Redimensionar', icon: 'crop', media: 'any', o: { tool: 'format' } },
  { label: 'Remover fundo', icon: 'scissors', media: 'image', o: { tool: 'ai' }, ai: true },
  { label: 'Melhorar foto', icon: 'maximize', media: 'image', o: { tool: 'ai' }, ai: true },
  { label: 'Colagem', icon: 'layout', media: 'image', o: { tool: 'stickers' } },
];

function HomeTab(props: {
  projects: Project[];
  start: (m: 'video' | 'image' | 'any', o?: OpenEditor) => void;
  startBlank: (a: Aspect, c: [string, string], n: string) => void;
  useTemplate: (t: Template) => void;
  openProject: (p: Project) => void;
  goTab: (t: Tab) => void;
}) {
  const { width } = useWindowDimensions();
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
      {/* Halo de fundo */}
      <Canvas style={[StyleSheet.absoluteFill, { height: 360 }]} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={360}>
          <RadialGradient c={vec(width * 0.75, -40)} r={360} colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']} />
        </Rect>
      </Canvas>

      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
          <Image source={LOGO} style={styles.miniLogo} />
          <Text style={styles.brand}>Studio IA</Text>
        </View>
        <View style={styles.offline}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>100% offline</Text>
        </View>
      </View>

      <View style={styles.heroText}>
        <Text style={TYPE.overline}>Criar</Text>
        <Text style={styles.heroTitle}>O que vamos fazer hoje?</Text>
      </View>

      <View style={styles.bigRow}>
        <BigCard icon="plus" title="Novo vídeo" sub="Editar um vídeo" onPress={() => props.start('video')} primary />
        <BigCard icon="image" title="Editar foto" sub="Efeitos e camadas" onPress={() => props.start('image')} />
      </View>

      {/* Formatos estilo Canva */}
      <SectionHeader title="Criar design" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
        {DESIGN_FORMATS.map((f) => (
          <FormatCard key={f.aspect} f={f} onPress={() => props.startBlank(f.aspect, f.colors, `${f.name} ${f.aspect}`)} />
        ))}
      </ScrollView>

      {/* Projetos recentes */}
      {props.projects.length > 0 && (
        <>
          <SectionHeader title="Recentes" action="Ver tudo" onAction={() => props.goTab('projects')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {props.projects.slice(0, 10).map((p) => (
              <Pressable key={p.id} onPress={() => props.openProject(p)} style={styles.recent}>
                {p.thumbUri ? <Image source={{ uri: p.thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <View style={styles.recentScrim} />
                <View style={styles.recentLabel}>
                  <Feather name="scissors" size={10} color={COLORS.TEXT_PRIMARY} />
                  <Text numberOfLines={1} style={styles.recentText}>{p.name}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* Ferramentas */}
      <SectionHeader title="Ferramentas" />
      <View style={styles.toolGrid}>
        {TOOLS.map((t) => {
          const off = t.ai && !aiAvailable();
          return (
            <Pressable
              key={t.label}
              style={[styles.tool, off && { opacity: 0.45 }]}
              onPress={() =>
                off
                  ? Alert.alert(t.label, 'Essa função de IA está sendo adaptada para o Android novo e volta na próxima atualização.')
                  : props.start(t.media, t.o)
              }
            >
              <View style={styles.toolIcon}>
                <Feather name={t.icon} size={22} color={COLORS.TEXT_PRIMARY} />
              </View>
              <Text style={styles.toolLabel}>{t.label}</Text>
              {off && <Text style={styles.soon}>em breve</Text>}
            </Pressable>
          );
        })}
      </View>

      {/* Modelos */}
      <SectionHeader title="Modelos" action="Ver todos" onAction={() => props.goTab('templates')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
        {TEMPLATES.map((t) => (
          <TemplateCard key={t.id} t={t} onPress={() => props.useTemplate(t)} />
        ))}
      </ScrollView>
    </ScrollView>
  );
}

function BigCard({ icon, title, sub, onPress, primary }: { icon: FeatherName; title: string; sub: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.big, primary && styles.bigPrimary, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.bigIcon, primary && { backgroundColor: COLORS.ACCENT_INK }]}>
        <Feather name={icon} size={22} color={primary ? COLORS.ACCENT_COLOR : COLORS.ACCENT_INK} />
      </View>
      <Text style={[styles.bigTitle, primary && { color: COLORS.ACCENT_INK }]}>{title}</Text>
      <Text style={[styles.bigSub, primary && { color: '#3F3F46' }]}>{sub}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={TYPE.label}>{action}</Text>
          <Feather name="chevron-right" size={14} color={COLORS.TEXT_SECONDARY} />
        </Pressable>
      )}
    </View>
  );
}

function FormatCard({ f, onPress }: { f: (typeof DESIGN_FORMATS)[number]; onPress: () => void }) {
  const r = { '9:16': 9 / 16, '1:1': 1, '4:5': 0.8, '16:9': 16 / 9 }[f.aspect];
  const box = 46;
  const w = r >= 1 ? box : box * r;
  const h = r >= 1 ? box / r : box;
  return (
    <Pressable onPress={onPress} style={styles.format}>
      <View style={{ height: box, justifyContent: 'center' }}>
        <View style={[styles.formatBox, { width: w, height: h }]} />
      </View>
      <Text style={styles.formatName}>{f.name}</Text>
      <Text style={styles.formatHint}>{f.hint}</Text>
    </Pressable>
  );
}

// ───────────── Arte dos modelos (desenhada com Skia, sem imagens) ───────────

function TemplateArtView({ art, w, h }: { art: TemplateArt; w: number; h: number }) {
  const buildings = useMemo(() => {
    const out: { x: number; w: number; h: number }[] = [];
    let x = -4;
    let seed = art.moonY * 997 + art.glow * 131;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    while (x < w) {
      const bw = 8 + rnd() * 18;
      out.push({ x, w: bw, h: (0.12 + rnd() * 0.32) * h * art.skyline });
      x += bw + 1;
    }
    return out;
  }, [art, w, h]);
  const stars = useMemo(() => (art.stars ? Array.from({ length: 18 }, (_, i) => ({ x: ((i * 53) % 97) / 97 * w, y: ((i * 31) % 59) / 59 * h * 0.55, r: (i % 3) * 0.4 + 0.5 })) : []), [art, w, h]);
  const mx = w * 0.62;
  const my = h * art.moonY;
  return (
    <Canvas style={{ width: w, height: h }}>
      <Rect x={0} y={0} width={w} height={h}>
        <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[art.top, art.bottom]} />
      </Rect>
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} color="rgba(255,255,255,0.7)" />
      ))}
      <Circle cx={mx} cy={my} r={w * 0.38} opacity={art.glow * 0.35}>
        <RadialGradient c={vec(mx, my)} r={w * 0.38} colors={[art.moon, 'transparent']} />
      </Circle>
      <Circle cx={mx} cy={my} r={w * 0.11} color={art.moon}>
        <BlurMask blur={1.5} style="solid" />
      </Circle>
      <Group>
        {buildings.map((b, i) => (
          <Rect key={i} x={b.x} y={h - b.h} width={b.w} height={b.h} color="#030304" />
        ))}
      </Group>
      <Rect x={0} y={h * 0.55} width={w} height={h * 0.45}>
        <LinearGradient start={vec(0, h * 0.55)} end={vec(0, h)} colors={['transparent', 'rgba(0,0,0,0.75)']} />
      </Rect>
    </Canvas>
  );
}

function TemplateCard({ t, onPress, wide }: { t: Template; onPress: () => void; wide?: boolean }) {
  const w = wide ? 160 : 118;
  const h = w * (16 / 9) * 0.9;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: w }, pressed && { opacity: 0.85 }]}>
      <View style={[styles.tplCard, { width: w, height: h }]}>
        <TemplateArtView art={t.art} w={w} h={h} />
        <View style={styles.tplTag}>
          <Text style={styles.tplTagText}>{t.tag}</Text>
        </View>
        <View style={styles.tplUse}>
          <Text style={styles.tplUseText}>Usar</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.tplName}>{t.name}</Text>
      {wide && <Text numberOfLines={2} style={styles.tplDesc}>{t.description}</Text>}
    </Pressable>
  );
}

// ═════════════════════════════ Modelos ══════════════════════════════════════

function TemplatesTab({ useTemplate, startBlank }: { useTemplate: (t: Template) => void; startBlank: (a: Aspect, c: [string, string], n: string) => void }) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
      <Text style={styles.pageTitle}>Modelos</Text>
      <Text style={[TYPE.label, { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg }]}>
        Escolha um visual pronto e aplique no seu vídeo ou foto.
      </Text>
      <View style={styles.tplGrid}>
        {TEMPLATES.map((t) => (
          <TemplateCard key={t.id} t={t} wide onPress={() => useTemplate(t)} />
        ))}
      </View>
      <SectionHeader title="Fundos para designs" />
      <View style={styles.bgGrid}>
        {BACKGROUNDS.map((b) => (
          <Pressable key={b.name} onPress={() => startBlank('9:16', b.colors, `Design ${b.name}`)} style={styles.bgItem}>
            <Canvas style={{ width: '100%', height: 90 }}>
              <Rect x={0} y={0} width={200} height={90}>
                <LinearGradient start={vec(0, 0)} end={vec(60, 90)} colors={b.colors} />
              </Rect>
            </Canvas>
            <Text style={styles.bgName}>{b.name}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// ═════════════════════════════ IA ═══════════════════════════════════════════

function AITab({ start }: { start: (m: 'video' | 'image' | 'any', o?: OpenEditor) => void }) {
  const ok = aiAvailable();
  const items: { icon: FeatherName; title: string; desc: string; ready: boolean; go?: () => void }[] = [
    { icon: 'zap', title: 'Corte viral', desc: 'Copia o ritmo de cortes de um vídeo viral e remonta o seu vídeo com a mesma música.', ready: true, go: () => start('video', { tool: 'cut' }) },
    { icon: 'scissors', title: 'Remover fundo de foto', desc: 'Recorta pessoas e objetos, sem tela verde.', ready: ok, go: () => start('image', { tool: 'ai' }) },
    { icon: 'maximize', title: 'Melhorar qualidade ×4', desc: 'Aumenta a resolução de fotos pequenas ou pixeladas.', ready: ok, go: () => start('image', { tool: 'ai' }) },
    { icon: 'film', title: 'Remover fundo de vídeo', desc: 'Isola a pessoa quadro a quadro, sem chroma key.', ready: false },
    { icon: 'message-square', title: 'Legendas automáticas', desc: 'Transcreve a fala do vídeo em legendas estilizadas, sem internet.', ready: false },
    { icon: 'target', title: 'Reenquadrar automático', desc: 'Converte vídeo horizontal em vertical seguindo o rosto.', ready: false },
    { icon: 'image', title: 'Foto em anime', desc: 'Transforma sua foto em ilustração estilo anime.', ready: false },
    { icon: 'delete', title: 'Borracha mágica', desc: 'Apaga objetos e pessoas da foto e preenche o fundo.', ready: false },
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
      <Text style={styles.pageTitle}>Laboratório de IA</Text>
      <Text style={[TYPE.label, { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, lineHeight: 16 }]}>
        Toda a inteligência roda no seu aparelho: nada é enviado para servidores e funciona sem internet.
      </Text>
      <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
        {items.map((it) => (
          <Pressable
            key={it.title}
            onPress={() => (it.ready && it.go ? it.go() : Alert.alert(it.title, 'Essa função está em desenvolvimento e chega numa próxima atualização.'))}
            style={[styles.aiCard, !it.ready && { opacity: 0.55 }]}
          >
            <View style={styles.aiIcon}>
              <Feather name={it.icon} size={20} color={COLORS.TEXT_PRIMARY} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <Text style={TYPE.title}>{it.title}</Text>
                <View style={[styles.badge, it.ready && styles.badgeOn]}>
                  <Text style={[styles.badgeText, it.ready && { color: COLORS.ACCENT_INK }]}>{it.ready ? 'Pronto' : 'Em breve'}</Text>
                </View>
              </View>
              <Text style={[TYPE.label, { marginTop: 3, lineHeight: 15 }]}>{it.desc}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// ═════════════════════════════ Projetos ═════════════════════════════════════

function ProjectsTab({ projects, openProject, start }: { projects: Project[]; openProject: (p: Project) => void; start: (m: 'any') => void }) {
  const { width } = useWindowDimensions();
  const cell = (width - SPACING.lg * 2 - SPACING.sm * 2) / 3;
  const remove = (p: Project) =>
    Alert.alert(p.name, 'O que deseja fazer?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => useProjects.getState().remove(p.id) },
    ]);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
      <Text style={styles.pageTitle}>Meus projetos</Text>
      {projects.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="folder" size={32} color={COLORS.TEXT_SECONDARY} />
          <Text style={TYPE.label}>Nenhum projeto ainda.</Text>
          <Pressable onPress={() => start('any')} style={styles.emptyBtn}>
            <Text style={{ color: COLORS.ACCENT_INK, fontWeight: '700' }}>Criar o primeiro</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.projGrid}>
          {projects.map((p) => (
            <Pressable key={p.id} onPress={() => openProject(p)} onLongPress={() => remove(p)} style={{ width: cell }}>
              <View style={[styles.projThumb, { width: cell, height: cell * 1.3 }]}>
                {p.thumbUri ? <Image source={{ uri: p.thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                {p.media.kind === 'video' && (
                  <View style={styles.projDur}>
                    <Text style={styles.projDurText}>{Math.round(p.media.durationMs / 1000)}s</Text>
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={styles.projName}>{p.name}</Text>
              <Text style={styles.projDate}>{new Date(p.updatedAt).toLocaleDateString('pt-BR')}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {projects.length > 0 && <Text style={[TYPE.label, { textAlign: 'center', marginTop: SPACING.lg }]}>Segure um projeto para excluir</Text>}
    </ScrollView>
  );
}

// ═════════════════════════════ Eu ═══════════════════════════════════════════

function MeTab({ projects }: { projects: Project[] }) {
  const clearCache = async () => {
    await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}studio-ia/`, { idempotent: true });
    Alert.alert('Pronto', 'Arquivos temporários apagados. Seus projetos continuam salvos.');
  };
  const rows: { icon: FeatherName; label: string; onPress: () => void }[] = [
    { icon: 'trash-2', label: 'Limpar arquivos temporários', onPress: clearCache },
    { icon: 'shield', label: 'Privacidade', onPress: () => Alert.alert('Privacidade', 'Suas fotos e vídeos nunca saem do aparelho. O Studio IA não usa servidores nem coleta dados.') },
    { icon: 'info', label: 'Sobre', onPress: () => Alert.alert('Studio IA', 'Editor de vídeo e foto com processamento 100% local.') },
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
      <View style={styles.meHead}>
        <Image source={LOGO} style={styles.meLogo} />
        <Text style={[TYPE.title, { fontSize: 18 }]}>Criador</Text>
        <Text style={TYPE.label}>Studio IA</Text>
      </View>
      <View style={styles.stats}>
        <Stat n={projects.length} l="Projetos" />
        <Stat n={projects.filter((p) => p.media.kind === 'video').length} l="Vídeos" />
        <Stat n={projects.filter((p) => p.media.kind === 'image').length} l="Fotos" />
      </View>
      <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
        {rows.map((r) => (
          <Pressable key={r.label} onPress={r.onPress} style={styles.meRow}>
            <Feather name={r.icon} size={18} color={COLORS.TEXT_PRIMARY} />
            <Text style={[TYPE.body, { flex: 1 }]}>{r.label}</Text>
            <Feather name="chevron-right" size={16} color={COLORS.TEXT_SECONDARY} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={TYPE.label}>{l}</Text>
    </View>
  );
}

// ═════════════════════════════ Estilos ══════════════════════════════════════

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.BACKGROUND_PRINCIPAL },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  miniLogo: { width: 30, height: 30, borderRadius: 8 },
  brand: { color: COLORS.TEXT_PRIMARY, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: RADIUS.pill,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
  },
  offlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  offlineText: { fontSize: 10, color: COLORS.TEXT_SECONDARY, fontWeight: '600' },
  heroText: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xxl, gap: 6 },
  heroTitle: { color: COLORS.TEXT_PRIMARY, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  bigRow: { flexDirection: 'row', gap: SPACING.md, paddingHorizontal: SPACING.lg, marginTop: SPACING.lg },
  big: {
    flex: 1,
    height: 132,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    justifyContent: 'flex-end',
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_STRONG,
  },
  bigPrimary: { backgroundColor: COLORS.ACCENT_COLOR, borderColor: COLORS.ACCENT_COLOR, ...GLOW, shadowOpacity: 0.25 },
  bigIcon: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.ACCENT_COLOR,
  },
  bigTitle: { color: COLORS.TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  bigSub: { color: COLORS.TEXT_SECONDARY, fontSize: 11, marginTop: 2 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, marginTop: SPACING.xl, marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  hList: { gap: SPACING.md, paddingHorizontal: SPACING.lg },
  format: {
    width: 92,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    gap: 4,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
  },
  formatBox: { borderWidth: 1.5, borderColor: COLORS.TEXT_PRIMARY, borderRadius: 4 },
  formatName: { color: COLORS.TEXT_PRIMARY, fontSize: 12, fontWeight: '600', marginTop: 4 },
  formatHint: { color: COLORS.TEXT_SECONDARY, fontSize: 9 },
  recent: { width: 96, height: 96, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.BACKGROUND_CARD_MODAL },
  recentScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  recentLabel: { position: 'absolute', left: 6, right: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  recentText: { color: COLORS.TEXT_PRIMARY, fontSize: 10, fontWeight: '600', flex: 1 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.sm, rowGap: SPACING.lg },
  tool: { width: '33.33%', alignItems: 'center', gap: 6 },
  toolIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
  },
  toolLabel: { color: COLORS.TEXT_PRIMARY, fontSize: 12, fontWeight: '500' },
  soon: { fontSize: 9, color: COLORS.TEXT_SECONDARY, marginTop: -4 },
  tplCard: { borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: HAIRLINE, borderColor: COLORS.BORDER_COLOR },
  tplTag: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill, backgroundColor: COLORS.SCRIM },
  tplTagText: { color: COLORS.TEXT_PRIMARY, fontSize: 9, fontWeight: '600' },
  tplUse: { position: 'absolute', bottom: 8, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.ACCENT_COLOR },
  tplUseText: { color: COLORS.ACCENT_INK, fontSize: 11, fontWeight: '700' },
  tplName: { color: COLORS.TEXT_PRIMARY, fontSize: 12, fontWeight: '600', marginTop: 6 },
  tplDesc: { color: COLORS.TEXT_SECONDARY, fontSize: 10, marginTop: 2, lineHeight: 13 },
  tplGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: SPACING.lg, paddingHorizontal: SPACING.sm },
  pageTitle: { color: COLORS.TEXT_PRIMARY, fontSize: 24, fontWeight: '800', paddingHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  bgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingHorizontal: SPACING.lg },
  bgItem: { width: '31.5%', borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: HAIRLINE, borderColor: COLORS.BORDER_COLOR },
  bgName: { position: 'absolute', bottom: 6, left: 8, color: COLORS.TEXT_PRIMARY, fontSize: 10, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 },
  aiCard: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
  },
  aiIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.BORDER_COLOR },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: RADIUS.pill, borderWidth: HAIRLINE, borderColor: COLORS.BORDER_STRONG },
  badgeOn: { backgroundColor: COLORS.ACCENT_COLOR, borderColor: COLORS.ACCENT_COLOR },
  badgeText: { fontSize: 9, fontWeight: '700', color: COLORS.TEXT_SECONDARY },
  empty: { alignItems: 'center', gap: SPACING.md, marginTop: 80 },
  emptyBtn: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, backgroundColor: COLORS.ACCENT_COLOR },
  projGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginTop: SPACING.md },
  projThumb: { borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.BACKGROUND_CARD_MODAL },
  projDur: { position: 'absolute', right: 4, bottom: 4, paddingHorizontal: 5, borderRadius: 4, backgroundColor: COLORS.SCRIM },
  projDurText: { color: COLORS.TEXT_PRIMARY, fontSize: 9, fontWeight: '600' },
  projName: { color: COLORS.TEXT_PRIMARY, fontSize: 11, fontWeight: '600', marginTop: 5 },
  projDate: { color: COLORS.TEXT_SECONDARY, fontSize: 9 },
  meHead: { alignItems: 'center', gap: 4, marginTop: SPACING.xxl },
  meLogo: { width: 84, height: 84, borderRadius: 42, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.BORDER_STRONG },
  stats: { flexDirection: 'row', margin: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: HAIRLINE, borderColor: COLORS.BORDER_COLOR, backgroundColor: COLORS.BACKGROUND_CARD_MODAL },
  stat: { flex: 1, alignItems: 'center', paddingVertical: SPACING.lg, gap: 2 },
  statN: { color: COLORS.TEXT_PRIMARY, fontSize: 20, fontWeight: '800' },
  meRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.BACKGROUND_CARD_MODAL,
    borderWidth: HAIRLINE,
    borderColor: COLORS.BORDER_COLOR,
  },
  tabBar: { flexDirection: 'row', borderTopWidth: HAIRLINE, borderColor: COLORS.BORDER_COLOR, backgroundColor: COLORS.BACKGROUND_PRINCIPAL, paddingTop: SPACING.sm },
  tabBtn: { flex: 1, alignItems: 'center', gap: 3, paddingBottom: SPACING.sm },
  tabLabel: { fontSize: 10, color: COLORS.TEXT_SECONDARY, fontWeight: '500' },
  tabDot: { position: 'absolute', top: -SPACING.sm, width: 18, height: 2, borderRadius: 1, backgroundColor: COLORS.ACCENT_COLOR },
});
