// Loyalty tier badge art. WebP icons live in assets/tiers/*.webp and are rendered
// as <Image> by components/loyalty/TierArt.tsx.
//
//   rookie — turquoise circle   pro — blue rhombus
//   elite  — violet hexagon     icon — golden star

export type TierArtKey = 'rookie' | 'pro' | 'elite' | 'icon';

export const TIER_IMAGE: Record<TierArtKey, ReturnType<typeof require>> = {
  rookie: require('@/assets/tiers/rookie.webp'),
  pro: require('@/assets/tiers/pro.webp'),
  elite: require('@/assets/tiers/elite.webp'),
  icon: require('@/assets/tiers/icon.webp'),
};
