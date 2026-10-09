// Baixa os modelos ONNX usados pela IA local para assets/models/.
// Rode uma vez: `npm run models`. Os arquivos são empacotados no app (offline).
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const OUT = new URL('../assets/models/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const MODELS = [
  {
    file: 'u2netp.onnx',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
  },
];

for (const m of MODELS) {
  const dest = new URL(m.file, OUT);
  if (existsSync(dest)) {
    console.log(`✓ ${m.file} já existe`);
    continue;
  }
  console.log(`↓ ${m.file}`);
  const res = await fetch(m.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${m.file}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`✓ ${m.file}`);
}

if (!existsSync(new URL('realesr-general-x4v3.onnx', OUT))) {
  console.log('\n• Super-resolução: gere o ONNX com `python scripts/export_realesrgan.py` (veja o README).');
}
