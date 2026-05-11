// Design system inspired by tapzi-barber glassmorphism style

import { Platform, type ViewStyle } from 'react-native';

// ─── Brand ──────────────────────────────────────────────
export const Brand = {
  primary: '#0A66C2',          // linkedin-600 — main brand blue
  primaryLight: '#0A85F4',     // linkedin-500 — lighter blue, links
  indigo: '#6366F1',           // indigo accent
  navy: '#05305C',             // deep navy — shadows
  gradientStart: '#4481EB',    // button gradient — top-left
  gradientEnd: '#0A66C2',      // button gradient — bottom-right (FIXED from #040EFD)
  primaryMuted: '#E8F3FF',     // very light blue tint for backgrounds / badges
  // Web-synced palette (matches website-tapzi globals.css)
  webPrimary: '#2D3AF5',       // royal blue — matches website hero/CTA
  webSecondary: '#00B4D8',     // cyan — paired with webPrimary in gradients
  black: '#1A1A1A',
  white: '#FFFFFF',
};

// ─── Palette ────────────────────────────────────────────
const tintColorLight = Brand.primary;
const tintColorDark = '#fff';

// ─── Light mode values ───────────────────────────────────
// Defined separately so they can be spread into the flat Colors object
// for backward compat (existing 100+ files use Colors.text, Colors.background, etc.)
const _light = {
  text: '#191919',
  textSecondary: '#65676B',
  textTertiary: '#999999',
  background: '#F0F4F8',
  backgroundSecondary: '#F4F5F7',
  tint: tintColorLight,
  icon: '#65676B',
  tabIconDefault: '#8E8E93',
  tabIconSelected: tintColorLight,
  primary: Brand.primary,
  primaryLight: Brand.primaryLight,
  primaryMuted: Brand.primaryMuted,
  gradientStart: Brand.gradientStart,
  gradientEnd: Brand.gradientEnd,
  indigo: Brand.indigo,
  navy: Brand.navy,
  inputBackground: '#F8FAFF',
  inputBorder: '#E1E8F0',
  inputFocusBorder: Brand.gradientStart,
  inputFocusGlow: 'rgba(68, 129, 235, 0.1)',
  separator: '#E8E8E8',
  error: '#E53935',
  errorPressed: '#C62828',
  errorMuted: '#FDECEC',
  success: '#2E7D32',
  successMuted: '#E8F5E9',
  card: 'rgba(255, 255, 255, 0.8)',
  cardBorder: 'rgba(255, 255, 255, 0.5)',
  cardShadow: 'rgba(0,0,0,0.08)',
  glassLight: 'rgba(255,255,255,0.5)',
  glassBorder: 'rgba(255,255,255,0.6)',
  floatingCardBorder: 'rgba(255,255,255,0.75)',
  handleBar: 'rgba(0,0,0,0.15)',
  backdropBlack: '#000',
  badge: '#FF3B30',
  overlay: 'rgba(0,0,0,0.04)',
  white: '#FFFFFF',
} as const;

const _dark = {
  text: '#F0F0F0',
  textSecondary: '#A0A0A0',
  textTertiary: '#707070',
  background: '#0A0A0F',
  backgroundSecondary: '#1C1C1E',
  tint: tintColorDark,
  icon: '#A0A0A0',
  tabIconDefault: '#8E8E93',
  tabIconSelected: tintColorDark,
  primary: Brand.primaryLight,
  primaryLight: Brand.primary,
  primaryMuted: '#1A2D4A',
  gradientStart: Brand.gradientStart,
  gradientEnd: Brand.gradientEnd,
  indigo: Brand.indigo,
  navy: Brand.navy,
  inputBackground: 'rgba(30, 32, 34, 0.8)',
  inputBorder: 'rgba(255, 255, 255, 0.08)',
  inputFocusBorder: Brand.primaryLight,
  inputFocusGlow: 'rgba(10, 133, 244, 0.15)',
  separator: '#2C2C2E',
  error: '#EF5350',
  errorPressed: '#C62828',
  errorMuted: '#2D1515',
  success: '#66BB6A',
  successMuted: '#1A2E1A',
  card: 'rgba(28, 28, 30, 0.75)',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  cardShadow: 'rgba(0,0,0,0.4)',
  glassLight: 'rgba(255,255,255,0.12)',
  glassBorder: 'rgba(255,255,255,0.15)',
  floatingCardBorder: 'rgba(255,255,255,0.2)',
  handleBar: 'rgba(255,255,255,0.25)',
  backdropBlack: '#000',
  badge: '#FF453A',
  overlay: 'rgba(255,255,255,0.04)',
  white: '#FFFFFF',
} as const;

/**
 * Colors — dual-mode object required by shop/marketplace components.
 * New code: `const colors = Colors[colorScheme]` then `colors.text`, etc.
 *
 * Backward compat: existing barber-store code that does `Colors.text`,
 * `Colors.background`, etc. still works because all light-mode keys are
 * also spread at the top level. The `ColorsFlat` alias points to `Colors.light`
 * for explicit flat usage in new code that doesn't need dark mode.
 */
export const Colors = {
  // Nested dual-mode (used by ported shop components)
  light: _light,
  dark: _dark,
  // Flat light-mode keys spread at top level for backward compat
  ..._light,
};

/**
 * ColorsFlat — explicit flat alias for new code that wants light-mode only.
 * Existing files already use `Colors.text` directly (which works via the spread above).
 */
export const ColorsFlat = _light;

// ─── FontFamily (Euclid Circular A) ─────────────────────
export const FontFamily = {
  light: 'EuclidCircularA-Light',
  regular: 'EuclidCircularA-Regular',
  medium: 'EuclidCircularA-Medium',
  semiBold: 'EuclidCircularA-SemiBold',
  bold: 'EuclidCircularA-Bold',
} as const;

// ─── Typography ──────────────────────────────────────────
export const Typography = {
  h1: { fontFamily: FontFamily.bold, fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: FontFamily.bold, fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: FontFamily.semiBold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: FontFamily.regular, fontSize: 16, lineHeight: 22 },
  bodySemiBold: { fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 18 },
  captionSemiBold: { fontFamily: FontFamily.semiBold, fontSize: 14, lineHeight: 18 },
  small: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16 },
  smallSemiBold: { fontFamily: FontFamily.semiBold, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: FontFamily.semiBold, fontSize: 16, lineHeight: 20, letterSpacing: 0.2 },
} as const;

// ─── Spacing (4-pt grid) ─────────────────────────────────
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

// ─── Radius ──────────────────────────────────────────────
export const Radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 30,
  full: 9999,
} as const;

/**
 * Bubble — asymmetric "organic" corners inspired by LinkedIn button design.
 * 3 corners at 25 px, top-right at 12 px + a subtle blue bottom-border.
 * Use on cards, buttons, chips, tiles — everything interactive.
 */
export const Bubble = {
  /** Asymmetric corner radii for the card/button shape */
  radii: {
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
  } as ViewStyle,
  /** Small variant (icon buttons, compact chips) */
  radiiSm: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
  } as ViewStyle,
  /** Large variant (modals, sheets) */
  radiiLg: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 30,
    borderBottomLeftRadius: 30,
  } as ViewStyle,
  /** Sheet variant (bottom sheets — open bottom) */
  sheetRadii: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
  } as ViewStyle,
  /** Floating (uniform, modal-style) */
  floatingRadii: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 24,
  } as ViewStyle,
  /** Subtle blue bottom-border accent */
  accent: {
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(10,102,194,0.18)',
  } as ViewStyle,
} as const;

// ─── Shadows ─────────────────────────────────────────────
export const Shadows = {
  sm: Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.10, shadowRadius: 3 },
    android: { elevation: 2 },
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
  /** Soft diffuse card shadow — glassmorphism */
  glass: Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 25 }, shadowOpacity: 0.08, shadowRadius: 50 },
    android: { elevation: 8 },
    default: {},
  })!,
  /** Blue glow — for primary buttons */
  glow: Platform.select<ViewStyle>({
    ios: { shadowColor: Brand.gradientStart, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
    android: { elevation: 10 },
    default: {},
  })!,
} as const;

// ─── Fonts (platform system fonts) ───────────────────────
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// ─── Target-only tokens (not in Tapzi source — kept for barber-store) ────────
export const AvatarSize = {
  xs: 26,
  sm: 34,
  md: 42,
  lg: 56,
  xl: 72,
  input: 36,
};

export const FAB = {
  size: 56,
  iconSize: 28,
  pedestalSize: 68,
  protrusion: 14,
  borderWidth: 1.5,
  borderColor: 'rgba(255, 255, 255, 0.55)',
  pedestalBg: 'rgba(255, 255, 255, 0.72)',
  pedestalBorder: 'rgba(255, 255, 255, 0.9)',
  shadow: Platform.select<ViewStyle>({
    ios: {
      shadowColor: Brand.gradientStart,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45,
      shadowRadius: 28,
    },
    android: { elevation: 14 },
    default: {},
  })!,
  liftShadow: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#1A1A2E',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
    },
    android: { elevation: 12 },
    default: {},
  })!,
} as const;

export const CreateMenuColors = {
  booking: { icon: '#2563EB', bg: 'rgba(37, 99, 235, 0.10)' },
  tryon: { icon: '#7C3AED', bg: 'rgba(124, 58, 237, 0.10)' },
  today: { icon: '#D97706', bg: 'rgba(217, 119, 6, 0.10)' },
  shop: { icon: '#0891B2', bg: 'rgba(8, 145, 178, 0.10)' },
  live: { icon: '#DC2626', bg: 'rgba(220, 38, 38, 0.08)' },
} as const;
