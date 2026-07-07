// Loyalty tier badge art. PNG icons live in assets/tiers/*.png and are rendered
// as <Image> by components/loyalty/TierArt.tsx.
//
//   rookie — turquoise circle   pro — blue rhombus
//   elite  — violet hexagon     icon — golden star

export type TierArtKey = 'rookie' | 'pro' | 'elite' | 'icon';

export const TIER_IMAGE: Record<TierArtKey, ReturnType<typeof require>> = {
  rookie: require('@/assets/tiers/rookie.png'),
  pro: require('@/assets/tiers/pro.png'),
  elite: require('@/assets/tiers/elite.png'),
  icon: require('@/assets/tiers/icon.png'),
};
