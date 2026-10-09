# Studio IA

Editor de vídeo/foto mobile (React Native + Expo SDK 57) com processamento 100% local:
Skia na GPU para o preview, FFmpeg para cortes/export e ONNX Runtime para IA no aparelho.

## Rodar

```bash
npm install
npx expo install --fix          # alinha versões nativas com o SDK
npm run models                  # baixa o U²-Netp (remoção de fundo)
python scripts/export_realesrgan.py   # opcional: gera o modelo de super-resolução
npm run prebuild
npm run android   # ou: npm run ios
```

Não roda no Expo Go: Skia, FFmpeg e ONNX são módulos nativos, então é preciso um
development build (`expo-dev-client`).

## FFmpeg: atenção

O projeto oficial `ffmpeg-kit` foi descontinuado em 2025 e os binários pré-compilados
saíram do Maven/CocoaPods, então `ffmpeg-kit-react-native@6.0.2` instala mas o build
nativo falha. Opções:

1. Usar um fork mantido com a mesma API (há vários no npm sob `*/ffmpeg-kit-react-native`)
   via alias: `"ffmpeg-kit-react-native": "npm:<fork>@<versão>"`. Confira se o fork
   publica binários e se a licença (LGPL/GPL) é compatível com o seu app.
2. Compilar o ffmpeg-kit a partir do código-fonte e apontar o pod/aar local.

Todo o acesso ao FFmpeg está isolado em `src/engine/ffmpegEngine.ts`.

## Estrutura

| Arquivo | Papel |
|---|---|
| `src/theme.ts` | Tokens do tema Ultra-Dark (cores, raio, tipografia, glow) |
| `src/store/editorStore.ts` | Estado comitado (zustand); gestos vivem em SharedValues |
| `src/screens/EditorScreen.tsx` | Workspace: header, canvas, timeline, toolbox, sheets |
| `src/components/EditorCanvas.tsx` | Skia: vídeo/foto + ColorMatrix + blur + vinheta; camada de figurinhas |
| `src/components/TransformableSticker.tsx` | Pan + Pinch + Rotate simultâneos na UI thread, snap de 45° com háptico |
| `src/components/Timeline.tsx` | Régua em ms, faixa de frames, trilhas de camadas, agulha, botão `+` |
| `src/components/ToolPanels.tsx` | Ajustes, efeitos, texto (render Skia → PNG), corte viral, IA, export |
| `src/engine/ffmpegEngine.ts` | Probe, detecção de cena, threshold adaptativo, plano de cortes, render e export |
| `src/engine/localAI.ts` | Remoção de fundo (U²-Net) e super-resolução ×4 em tiles (Real-ESRGAN) |
| `src/stickers/*` | Busca paginada infinita, cache LRU em disco, verificação de alpha do PNG |

## Figurinhas

A busca usa o Openverse (imagens Creative Commons, gratuito, sem chave). Cada item
guarda autor e licença. Imagens sem canal alpha aparecem com um ícone de tesoura e são
recortadas pela IA local ao tocar. O tile "Galeria + IA" transforma qualquer foto do
aparelho em figurinha. Para outras fontes, implemente a interface `StickerProvider`.
