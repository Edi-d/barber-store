import type { XpLevelThreshold, XpVoucherTier } from '@/types/database';

// Level semantics:
//   - Level 1..5 match xp_level_thresholds.level column.
//   - Config mirrors DB seed for client-side display. If thresholds change
//     in DB, update here too — DB is source of truth at runtime.

export interface LevelConfig {
  level: number;
  title: string;
  xpRequired: number;
  color: string;         // hex background, client-only
  textColor: string;     // foreground text color that contrasts on `color`
  iconName: string;      // Ionicons glyph name — diversifies tier identity
  perks: string[];
}

// Dark slate for foreground on warm/light tier colors.
// White foreground for dark/saturated tiers.
const DARK_FG = '#1E293B';
const LIGHT_FG = '#FFFFFF';

// Re-skinned to match the barber loyalty tiers (Clipper/Blade/Sharp/Maestru).
// Levels + xp_required mirror xp_level_thresholds (migration 161); icons are now
// the gradient badge art (see components/loyalty/TierArt.tsx), iconName is kept
// only as a harmless fallback and is no longer rendered.
export const LEVEL_CONFIG: Record<number, LevelConfig> = {
  1: {
    level: 1,
    title: 'Clipper',
    xpRequired: 0,
    color: '#8E8E93',      // gray — entry tier
    textColor: LIGHT_FG,
    iconName: 'cut',
    perks: ['Acumulezi XP la fiecare achizitie'],
  },
  2: {
    level: 2,
    title: 'Blade',
    xpRequired: 1000,
    color: '#0A84FF',      // brand blue
    textColor: LIGHT_FG,
    iconName: 'flash',
    perks: ['Acces la produse exclusive'],
  },
  3: {
    level: 3,
    title: 'Sharp',
    xpRequired: 3000,
    color: '#F5A623',      // gold accent
    textColor: DARK_FG,
    iconName: 'star',
    perks: ['Produse deblocate', 'Acces anticipat la produse noi'],
  },
  4: {
    level: 4,
    title: 'Maestru',
    xpRequired: 7000,
    color: '#FFD700',      // legendary gold
    textColor: DARK_FG,
    iconName: 'trophy',
    perks: ['Toate produsele deblocate', 'Prioritate la comenzi'],
  },
};

export const LEVEL_LIST: LevelConfig[] = Object.values(LEVEL_CONFIG).sort((a, b) => a.level - b.level);

export function levelForLifetime(lifetime: number): LevelConfig {
  let pick = LEVEL_LIST[0];
  for (const lvl of LEVEL_LIST) {
    if (lifetime >= lvl.xpRequired) pick = lvl;
  }
  return pick;
}

export function nextLevelFor(current: number): LevelConfig | null {
  const idx = LEVEL_LIST.findIndex((l) => l.level === current);
  return idx >= 0 && idx < LEVEL_LIST.length - 1 ? LEVEL_LIST[idx + 1] : null;
}

export function computeLevelProgress(lifetime: number, currentLevel: number): {
  progress: number;
  pointsToNext: number | null;
  currentLevelConfig: LevelConfig;
  nextLevelConfig: LevelConfig | null;
} {
  const currentLevelConfig = LEVEL_CONFIG[currentLevel] ?? LEVEL_CONFIG[1];
  const nextLevelConfig = nextLevelFor(currentLevel);
  if (!nextLevelConfig) {
    return { progress: 1, pointsToNext: null, currentLevelConfig, nextLevelConfig: null };
  }
  const span = nextLevelConfig.xpRequired - currentLevelConfig.xpRequired;
  const gained = Math.max(0, lifetime - currentLevelConfig.xpRequired);
  const progress = Math.min(1, span > 0 ? gained / span : 0);
  const pointsToNext = Math.max(0, nextLevelConfig.xpRequired - lifetime);
  return { progress, pointsToNext, currentLevelConfig, nextLevelConfig };
}

// Voucher tiers: mirrors xp_voucher_tiers seed. Prefer DB at runtime,
// this is a fallback for offline/loading.
export interface VoucherTierConfig {
  tierPoints: number;
  voucherValueCents: number;
  labelRo: string;
  bonusPct: number;
  sortOrder: number;
}

export const VOUCHER_TIER_CONFIG: VoucherTierConfig[] = [
  { tierPoints: 1000,  voucherValueCents: 1000,  labelRo: '10 lei',  bonusPct: 0,  sortOrder: 1 },
  { tierPoints: 3000,  voucherValueCents: 3500,  labelRo: '35 lei',  bonusPct: 17, sortOrder: 2 },
  { tierPoints: 6000,  voucherValueCents: 8000,  labelRo: '80 lei',  bonusPct: 33, sortOrder: 3 },
  { tierPoints: 10000, voucherValueCents: 15000, labelRo: '150 lei', bonusPct: 50, sortOrder: 4 },
];

// Maps a voucher tier's point cost to a distinct accent color for VoucherConversionSection.
// Progression: brand-primary → indigo → purple → gold (mirrors increasing value).
const VOUCHER_ACCENT_MAP: Record<number, string> = {
  1000:  '#0A66C2', // primary
  3000:  '#6366F1', // indigo
  6000:  '#7C3AED', // purple
  10000: '#F5A623', // gold
};

export function voucherAccentForTier(tierPoints: number): string {
  return VOUCHER_ACCENT_MAP[tierPoints] ?? '#0A66C2';
}

// 8-char hex#AA is unreliable in expo-linear-gradient on Android — convert to rgba.
export function levelColorWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
