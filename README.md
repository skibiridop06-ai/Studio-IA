# Studio IA

Editor de vídeo/foto mobile (React Native + Expo SDK 57) com processamento 100% local:
Skia na GPU para o preview, FFmpeg para cortes/export e ONNX Runtime para IA no aparelho.

## Rodar

```bash
npm install
npx expo install --fix          # alinha versões nativas com o SDK
npm run prebuild
npm run android   # ou: npm run ios
```

Não roda no Expo Go: Skia, FFmpeg e ONNX são módulos nativos. Os modelos ONNX já
vêm em `assets/models` (para regenerar: `npm run models` e `scripts/export_realesrgan.py`).

## Baixar o APK

Cada envio para o branch `main` dispara o workflow **Gerar APK** (GitHub Actions), que
compila o app e publica o `app-release.apk` na aba **Releases**. Dá para acompanhar as
atualizações pelo Obtainium apontando para este repositório.

## FFmpeg

O `ffmpeg-kit` original foi descontinuado em 2025. O projeto usa o fork
`@wokcito/ffmpeg-kit-react-native` (mesma API, binários Android no Maven Central).
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
