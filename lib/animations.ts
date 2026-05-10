/**
 * Standardized animation library for the marketplace / shop.
 * All values extracted from Tapzi-barber source — do not modify without
 * updating both repos.
 *
 * Usage:
 *   import { SMOOTH, DURATION, SHEET_TIMING_IN } from '@/lib/animations';
 *   withTiming(1, { duration: DURATION.entering, easing: SMOOTH })
 */

import { Platform } from 'react-native';
import {
  Easing,
  FadeInDown,
  FadeInUp,
  FadeOutUp,
  SlideInLeft,
  SlideOutLeft,
} from 'react-native-reanimated';

// Reanimated 4 layout-animation factories (FadeInDown, FadeInUp, etc.) invoke
// internal worklet builders at construction time. On web, the worklet runtime
// isn't initialised at module-load, so calling .duration() / .easing() on these
// factories at the top level crashes. We export `undefined` on web — consumers
// pass these to `<Animated.View entering={...}>`, which accepts undefined and
// simply renders without an entry animation. Native behaviour is unchanged.
const isWeb = Platform.OS === 'web';

// ── Easing curves ───────────────────────────────────────
/** Standard ease — CSS cubic-bezier(0.25, 0.1, 0.25, 1) */
export const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
export const EASE_IN = Easing.in(Easing.cubic);
export const EASE_OUT = Easing.out(Easing.cubic);

// ── Duration presets (ms) ───────────────────────────────
export const DURATION = {
  instant:   80,
  fast:      150,
  standard:  250,
  moderate:  380,
  slow:      500,
  entering:  400,
  exiting:   280,
  snap:      260,
  pulse:     200,
  count:     800,    // XP counting animation
  progress:  900,    // XPProgressBar fill
  confetti: 1200,    // OrderSuccessModal particles
  levelup:   700,    // LevelUpModal particles
} as const;

// ── Button press sequence ───────────────────────────────
// Used on: ProductCard add-to-cart, CartBar pulse
// Full withSequence: scale 1 → 0.7 → 1.1 → 1.0
export const PRESS_SEQUENCE = {
  scaleDown: { duration: 80,  easing: SMOOTH },
  scaleUp:   { duration: 120, easing: SMOOTH },
  settle:    { duration: 100, easing: SMOOTH },
} as const;

// ── Modal sheet slide in/out ────────────────────────────
// Used on: CartModal, MarketplaceCartModal
export const SHEET_TIMING_IN  = { duration: 380, easing: SMOOTH };
export const SHEET_TIMING_OUT = { duration: 280, easing: EASE_IN };
export const SHEET_SNAP       = { duration: 260, easing: SMOOTH };

// ── Backdrop fade ───────────────────────────────────────
export const BACKDROP_IN  = { duration: 280, easing: SMOOTH };
export const BACKDROP_OUT = { duration: 200, easing: SMOOTH };

// ── Cart bar slide in/out ───────────────────────────────
export const CART_BAR_TIMING = { duration: 400, easing: SMOOTH };

// ── Blob entry (GradientBackground) ────────────────────
export const BLOB_ENTRY = { duration: 800, easing: EASE_OUT };

// ── Focus/input ─────────────────────────────────────────
export const FOCUS_TIMING = { duration: 250, easing: SMOOTH };

// ── Particle burst (ProductCard add-to-cart) ────────────
export const PARTICLE = {
  duration: 500,
  easing:   Easing.out(Easing.cubic),
  angle:    (index: number, count: number) => (index / count) * 2 * Math.PI,
  distance: (index: number) => 22 + (index % 3) * 6,
} as const;

// ── XP badge scale pulse ────────────────────────────────
export const XP_PULSE = {
  up:   { duration: 200, easing: SMOOTH }, // → 1.08
  down: { duration: 300, easing: SMOOTH }, // → 1.0
} as const;

// ── Discount badge pulse (withRepeat) ───────────────────
export const DISCOUNT_PULSE = {
  up:   { duration: 1200, easing: SMOOTH }, // → 1.08
  down: { duration: 1200, easing: SMOOTH }, // → 1.0
} as const;

// ── FadeInDown stagger delays (ms) — marketplace index sections ──
// Used staggered: 0, 60, 120, 180, 240, 300, 360 ms
export const STAGGER_DELAYS = [0, 60, 120, 180, 240, 300, 360] as const;

// ── FadeInDown layout animation (sections, cards) ───────
// SLIDE_IN_DOWN is a function — safe at module-load on web, the factory call
// happens later when consumers invoke it from inside a component body.
export const SLIDE_IN_DOWN = (delay = 0) =>
  isWeb
    ? undefined
    : FadeInDown.duration(400)
        .delay(delay)
        .easing(SMOOTH)
        .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] } as never);

// ── FadeInDown for cards (XPBadge, XPProgressBar) ───────
export const CARD_ENTRY = isWeb
  ? undefined
  : FadeInDown.duration(400)
      .easing(SMOOTH)
      .withInitialValues({ transform: [{ translateY: 12 }] } as never);

// ── Toast animations ────────────────────────────────────
export const TOAST_ENTERING = isWeb
  ? undefined
  : FadeInUp.duration(400)
      .easing(SMOOTH)
      .withInitialValues({ transform: [{ translateY: -12 }] } as never);
export const TOAST_EXITING = isWeb ? undefined : FadeOutUp.duration(300).easing(SMOOTH);

// ── Drawer (MarketplaceDrawer) ──────────────────────────
export const DRAWER_ENTERING = isWeb ? undefined : SlideInLeft.duration(300);
export const DRAWER_EXITING  = isWeb ? undefined : SlideOutLeft.duration(250);

// ── Swipe gesture thresholds ────────────────────────────
export const SWIPE = {
  cartModalDismiss:        120,   // px translateY to dismiss sheet
  cartModalVelocity:       800,   // px/s velocity to dismiss
  cartItemDelete:          -80,   // px translateX to delete (negative = left)
  cartItemDeleteVelocity:  -600,  // px/s
  cartItemMaxSwipe:        -120,  // px max left travel
  cartItemDeleteSnap:      -120,  // px snap-to when deleting
} as const;

// ── GradientBackground blob entry ───────────────────────
export const BLOB_1_START = { opacity: 0, scale: 0.8 } as const;
export const BLOB_2_START = { opacity: 0, scale: 0.85 } as const;
export const BLOB_DELAY = 50; // ms delay between blob 1 and blob 2
