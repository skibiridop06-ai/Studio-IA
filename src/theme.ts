/**
 * Studio IA — Design tokens ("Ultra-Dark Cyber-Minimalist")
 * Única fonte de verdade para cor, espaçamento, raio e tipografia.
 * Nenhum componente deve declarar cor hex diretamente.
 */
export const COLORS = {
  BACKGROUND_PRINCIPAL: '#09090B',
  BACKGROUND_CARD_MODAL: '#141416',
  BACKGROUND_ELEVATED: '#1A1A1D',
  BORDER_COLOR: '#222226',
  BORDER_STRONG: '#2E2E33',
  TEXT_PRIMARY: '#FFFFFF',
  TEXT_SECONDARY: '#71717A',
  TEXT_TERTIARY: '#3F3F46',
  ACCENT_COLOR: '#FFFFFF',
  ACCENT_GLOW: 'rgba(255,255,255,0.18)',
  ACCENT_INK: '#09090B', // texto sobre botão branco
  DANGER: '#F4F4F5',
  SCRIM: 'rgba(9,9,11,0.72)',
} as const;

export const SPACING = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;
export const HAIRLINE = 1;

export const TYPE = {
  title: { fontSize: 15, fontWeight: '600' as const, letterSpacing: 0.2, color: COLORS.TEXT_PRIMARY },
  label: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.3, color: COLORS.TEXT_SECONDARY },
  body: { fontSize: 13, fontWeight: '400' as const, color: COLORS.TEXT_PRIMARY },
  mono: { fontSize: 10, fontVariant: ['tabular-nums'] as ('tabular-nums')[], color: COLORS.TEXT_SECONDARY },
  overline: { fontSize: 10, fontWeight: '600' as const, letterSpacing: 2.4, textTransform: 'uppercase' as const, color: COLORS.TEXT_SECONDARY },
};

/** "Brilho sutil" dos elementos ativos: sombra branca difusa (iOS) + elevação (Android). */
export const GLOW = {
  shadowColor: COLORS.ACCENT_COLOR,
  shadowOpacity: 0.35,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 0 },
  elevation: 6,
};

export type Resolution = '720P' | '1080P' | '4K';
export const RESOLUTIONS: Record<Resolution, { w: number; h: number; bitrate: string }> = {
  '720P': { w: 720, h: 1280, bitrate: '6M' },
  '1080P': { w: 1080, h: 1920, bitrate: '12M' },
  '4K': { w: 2160, h: 3840, bitrate: '40M' },
};
