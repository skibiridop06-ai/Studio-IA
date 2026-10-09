/**
 * Figurinhas 100% locais (nenhuma internet):
 *  - Emojis: renderizados com a fonte de emoji do próprio sistema (Skia Paragraph)
 *  - Formas: desenhadas com caminhos vetoriais (Skia Path) na cor escolhida
 * Tudo vira um PNG transparente em cache, igual a qualquer outra figurinha.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Skia, ImageFormat, PaintStyle, StrokeJoin, TextAlign, type SkPath } from '@shopify/react-native-skia';

const DIR = `${FileSystem.cacheDirectory}studio-ia/local-stickers/`;
const ensureDir = () => FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});

export const EMOJI_GROUPS: { name: string; items: string }[] = [
  { name: 'Rostos', items: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😔 😢 😭 😤 😡 🤬 🤯 😳 🥵 🥶 😱 🤔 🤫 🙄 😴 🤤 😵 🤠 🤡 👻 💀 ☠️ 👽 🤖 🎃 😺 😸 😹 😻 😼' },
  { name: 'Mãos', items: '👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 🤏 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🦾 ✍️ 💅' },
  { name: 'Corações', items: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ❤️‍🔥' },
  { name: 'Destaques', items: '🔥 ✨ ⭐ 🌟 💫 ⚡ 💥 💯 💢 💨 💦 💤 🎉 🎊 🏆 🥇 👑 💎 💰 💸 📈 🚀 🎯 ✅ ❌ ⚠️ ❓ ❗ 🔴 🟢 🔵 🟣 ⚫ ⚪' },
  { name: 'Natureza', items: '🌙 🌕 🌑 ☀️ 🌈 ☁️ ⛈️ ❄️ 🌊 🌸 🌹 🌺 🌻 🌼 🌷 🍀 🍁 🌴 🌵 🐱 🐶 🦊 🐼 🐸 🦋 🐍 🐉 🦅 🦁 🐺' },
  { name: 'Objetos', items: '🎮 🕹️ 🎧 🎤 🎬 📸 📱 💻 ⌚ 🎸 🎹 🥁 ⚽ 🏀 🏈 🎾 🏐 🎲 ♟️ 🧩 🔫 🗡️ 🛡️ 💣 🔮 🎁 🍕 🍔 🍟 🍩 🍿 🥤 ☕ 🍺 🍷' },
  { name: 'Símbolos', items: '➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ 🔄 🔁 ▶️ ⏸️ ⏹️ ⏺️ ⏭️ 🔊 🔇 🎵 🎶 💬 💭 🗯️ 👁️‍🗨️ 🆕 🆒 🆓 🔝 🔜 ™️ ©️ ®️ ♻️ ☮️ ☯️ ✝️ ☪️ 🕉️' },
];

export const STICKER_COLORS = ['#FFFFFF', '#09090B', '#FF3B3B', '#FFD60A', '#22C55E', '#3B82F6', '#A855F7', '#FF5FA2'];

type ShapeDef = { id: string; name: string; build: (s: number) => SkPath; stroke?: boolean };

const svg = (d: string, s: number, base = 24) => {
  const p = Skia.Path.MakeFromSVGString(d)!;
  const m = Skia.Matrix();
  m.scale(s / base, s / base);
  p.transform(m);
  return p;
};

function starPath(s: number, points: number, inner: number): SkPath {
  const p = Skia.Path.Make();
  const c = s / 2;
  const R = s * 0.47;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? R : R * inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const x = c + r * Math.cos(a);
    const y = c + r * Math.sin(a);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.close();
  return p;
}

export const SHAPES: ShapeDef[] = [
  { id: 'star', name: 'Estrela', build: (s) => starPath(s, 5, 0.45) },
  { id: 'sparkle', name: 'Brilho', build: (s) => starPath(s, 4, 0.22) },
  { id: 'burst', name: 'Explosão', build: (s) => starPath(s, 12, 0.68) },
  { id: 'heart', name: 'Coração', build: (s) => svg('M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.6 0 5.7 3.8 4.2 7.3C19.5 16.4 12 21 12 21z', s) },
  { id: 'bolt', name: 'Raio', build: (s) => svg('M13.5 1.5 3.5 14h7l-1.5 8.5 11-13.5h-7.2l.7-7.5z', s) },
  { id: 'crown', name: 'Coroa', build: (s) => svg('M2.5 18.5h19l-1.6-11-5.2 5-2.7-8-2.7 8-5.2-5-1.6 11z', s) },
  { id: 'moon', name: 'Lua', build: (s) => svg('M20.5 14.2A9 9 0 0 1 9.8 3.5a9 9 0 1 0 10.7 10.7z', s) },
  { id: 'bubble', name: 'Balão', build: (s) => svg('M4 3.5h16a2.5 2.5 0 0 1 2.5 2.5v9.5A2.5 2.5 0 0 1 20 18h-9.5l-5.5 4.5V18H4a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 4 3.5z', s) },
  { id: 'arrow', name: 'Seta', build: (s) => svg('M2 9.5h13V4l7.5 8-7.5 8v-5.5H2z', s) },
  { id: 'circle', name: 'Círculo', build: (s) => { const p = Skia.Path.Make(); p.addCircle(s / 2, s / 2, s * 0.46); return p; } },
  { id: 'ring', name: 'Anel', stroke: true, build: (s) => { const p = Skia.Path.Make(); p.addCircle(s / 2, s / 2, s * 0.4); return p; } },
  { id: 'square', name: 'Quadro', stroke: true, build: (s) => { const p = Skia.Path.Make(); p.addRRect(Skia.RRectXY(Skia.XYWHRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84), s * 0.08, s * 0.08)); return p; } },
  { id: 'check', name: 'Check', stroke: true, build: (s) => svg('M4 12.5l5 5L20 6.5', s) },
  { id: 'x', name: 'X', stroke: true, build: (s) => svg('M5 5l14 14M19 5L5 19', s) },
  { id: 'underline', name: 'Traço', stroke: true, build: (s) => svg('M2 14c4-3 8 2 12-1s6-2 8-1', s) },
  { id: 'play', name: 'Play', build: (s) => svg('M6 3.5v17l14-8.5z', s) },
];

async function savePng(img: { encodeToBase64: (f: ImageFormat, q: number) => string }, name: string) {
  await ensureDir();
  const uri = `${DIR}${name}.png`;
  await FileSystem.writeAsStringAsync(uri, img.encodeToBase64(ImageFormat.PNG, 100), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

/** Desenha uma forma em PNG transparente (com contorno escuro p/ ler em qualquer fundo). */
export async function renderShape(shape: ShapeDef, color: string, size = 512) {
  const key = `shape_${shape.id}_${color.replace('#', '')}_${size}`;
  const uri = `${DIR}${key}.png`;
  if ((await FileSystem.getInfoAsync(uri)).exists) return { uri, width: size, height: size };

  const surface = Skia.Surface.Make(size, size)!;
  const c = surface.getCanvas();
  const pad = size * 0.06;
  const path = shape.build(size - pad * 2);
  const m = Skia.Matrix();
  m.translate(pad, pad);
  path.transform(m);

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  if (shape.stroke) {
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(size * 0.07);
    paint.setStrokeJoin(StrokeJoin.Round);
    paint.setStrokeCap(1); // round
  }
  // contorno sutil (só em formas preenchidas claras) para destacar sobre fundos claros
  if (!shape.stroke && color.toUpperCase() !== '#09090B') {
    const outline = Skia.Paint();
    outline.setAntiAlias(true);
    outline.setColor(Skia.Color('rgba(0,0,0,0.35)'));
    outline.setStyle(PaintStyle.Stroke);
    outline.setStrokeWidth(size * 0.02);
    outline.setStrokeJoin(StrokeJoin.Round);
    c.drawPath(path, outline);
  }
  c.drawPath(path, paint);
  surface.flush();
  return { uri: await savePng(surface.makeImageSnapshot(), key), width: size, height: size };
}

/** Renderiza um emoji colorido usando a fonte de emoji do aparelho. */
export async function renderEmoji(emoji: string, size = 384) {
  const code = Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16)).join('-');
  const key = `emoji_${code}_${size}`;
  const uri = `${DIR}${key}.png`;
  if ((await FileSystem.getInfoAsync(uri)).exists) return { uri, width: size, height: size };

  const surface = Skia.Surface.Make(size, size)!;
  const c = surface.getCanvas();
  const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Center }) // sem provider = fontes do sistema (inclui emoji colorido);
  builder.pushStyle({ fontSize: size * 0.78, color: Skia.Color('#FFFFFF') });
  builder.addText(emoji);
  const para = builder.build();
  para.layout(size);
  const h = para.getHeight();
  para.paint(c, 0, (size - h) / 2);
  surface.flush();
  return { uri: await savePng(surface.makeImageSnapshot(), key), width: size, height: size };
}
