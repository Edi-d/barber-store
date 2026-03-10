// Design system inspired by tapzi-barber glassmorphism style

import { Platform, type ViewStyle, StyleSheet } from 'react-native';

export const Brand = {
  primary: '#0A66C2',
  primaryLight: '#0A85F4',
  indigo: '#6366F1',
  navy: '#05305C',
  gradientStart: '#4481EB',
  gradientEnd: '#040EFD',
  primaryMuted: '#E8F3FF',
  black: '#1A1A1A',
  white: '#FFFFFF',
};

export const Colors = {
  primary: Brand.primary,
  primaryLight: Brand.primaryLight,
  gradientStart: Brand.gradientStart,
  gradientEnd: Brand.gradientEnd,
  indigo: Brand.indigo,
  navy: Brand.navy,
  primaryMuted: Brand.primaryMuted,

  text: '#191919',
  textSecondary: '#65676B',
  textTertiary: '#999999',

  background: '#F0F4F8',
  white: '#FFFFFF',

  inputBackground: '#F8FAFF',
  inputBorder: '#E1E8F0',
  inputFocusBorder: '#4481EB',

  separator: '#E8E8E8',

  error: '#E53935',
  errorMuted: '#FDECEC',
  success: '#2E7D32',
  successMuted: '#E8F5E9',

  card: 'rgba(255,255,255,0.8)',
  cardBorder: 'rgba(255,255,255,0.5)',

  glassLight: 'rgba(255,255,255,0.5)',
  glassBorder: 'rgba(255,255,255,0.6)',
  handleBar: 'rgba(0,0,0,0.15)',
  backdropBlack: '#000',
};

export const Typography = {
  h1: { fontFamily: 'EuclidCircularA-Bold', fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: 'EuclidCircularA-Bold', fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: 'EuclidCircularA-SemiBold', fontSize: 18, lineHeight: 24 },
  body: { fontFamily: 'EuclidCircularA-Regular', fontSize: 16, lineHeight: 22 },
  bodySemiBold: { fontFamily: 'EuclidCircularA-SemiBold', fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: 'EuclidCircularA-Regular', fontSize: 14, lineHeight: 18 },
  captionSemiBold: { fontFamily: 'EuclidCircularA-SemiBold', fontSize: 14, lineHeight: 18 },
  small: { fontFamily: 'EuclidCircularA-Regular', fontSize: 12, lineHeight: 16 },
  smallSemiBold: { fontFamily: 'EuclidCircularA-SemiBold', fontSize: 12, lineHeight: 16 },
  button: { fontFamily: 'EuclidCircularA-SemiBold', fontSize: 16, lineHeight: 20, letterSpacing: 0.2 },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

export const Bubble = {
  radii: {
    topLeft: 25,
    topRight: 12,
    bottomRight: 25,
    bottomLeft: 25,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
  },
  radiiSm: {
    topLeft: 18,
    topRight: 8,
    bottomRight: 18,
    bottomLeft: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
  },
  radiiLg: {
    topLeft: 30,
    topRight: 14,
    bottomRight: 30,
    bottomLeft: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 30,
    borderBottomLeftRadius: 30,
  },
  sheetRadii: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
  },
  accent: {
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(10,102,194,0.18)',
  } as ViewStyle,
};

export const AvatarSize = {
  xs: 26,
  sm: 34,
  md: 42,
  lg: 56,
  input: 36,
};

export const Radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 30,
  full: 9999,
} as const;

export const Shadows = {
  sm: Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
    android: { elevation: 1 },
    default: {},
  })!,
  md: Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    android: { elevation: 3 },
    default: {},
  })!,
  lg: Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 },
    android: { elevation: 6 },
    default: {},
  })!,
  glass: Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 25 }, shadowOpacity: 0.08, shadowRadius: 50 },
    android: { elevation: 8 },
    default: {},
  })!,
  glow: Platform.select<ViewStyle>({
    ios: { shadowColor: Brand.gradientStart, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
    android: { elevation: 10 },
    default: {},
  })!,
};
