import { Platform } from 'react-native';

export const colors = {
  bg: '#0E1113',
  surface: '#161A1D',
  surfaceAlt: '#1E2429',
  raised: '#252C32',
  border: '#2C343B',
  text: '#F3F6F8',
  muted: '#93A0AA',
  faint: '#5F6B75',
  green: '#35D07F',
  greenDim: '#12291F',
  amber: '#F0B429',
  amberDim: '#2A2312',
  red: '#F2555A',
  redDim: '#2C1618',
  blue: '#5AA9FF',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const font = Platform.select({
  default: 'System',
});

export const text = {
  h1: { fontSize: 28, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.muted },
  tiny: { fontSize: 11, color: colors.faint, fontWeight: '600' as const, letterSpacing: 0.4 },
  mono: {
    fontSize: 14,
    color: colors.text,
    fontVariant: ['tabular-nums'] as const,
  },
};
