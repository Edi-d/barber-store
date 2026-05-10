/**
 * marketplace-status.ts — Order status enum + display helpers.
 *
 * Source: 06-orders.md §2 "Status Model"
 *
 * 8 statuses for marketplace_orders.status:
 *   placed | paid | preparing | shipped | delivered | cancelled | returned | refunded
 *
 * Each status has:
 *   - Romanian label (STATUS_LABEL_RO)
 *   - Hex color, Tailwind bg class, Tailwind text class (STATUS_COLORS)
 *   - BadgePill-compatible tone + text (statusBadgeProps)
 *
 * NativeWind note: The twBg/twText classes use standard Tailwind color utilities
 * (amber, green, indigo, blue, red, slate) with /10 opacity modifiers. These are
 * already in Tailwind's default palette and do not require custom color tokens.
 */

// ─── Tone type (mirrors BadgePill component prop) ────────────────────────────
// Defined here to avoid a cross-import between lib and components.
// BadgePill imports this type to ensure they stay in sync.
export type BadgePillTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent';

// ─── Status type ─────────────────────────────────────────────────────────────
export type MarketplaceStatus =
  | 'placed'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'refunded';

// ─── Romanian labels ──────────────────────────────────────────────────────────
export const STATUS_LABEL_RO: Record<MarketplaceStatus, string> = {
  placed:    'Plasata',
  paid:      'Platita',
  preparing: 'In pregatire',
  shipped:   'Expediata',
  delivered: 'Livrata',
  cancelled: 'Anulata',
  returned:  'Returnata',
  refunded:  'Restituita',
};

// ─── Colors (hex + NativeWind classes) ───────────────────────────────────────
// Source: 06-orders.md §2 table
// twBg uses bg-color/10 opacity notation → equivalent to hex + '1A' (10% alpha)
// twText uses text-color-N for accessible contrast on the semi-transparent bg
export const STATUS_COLORS: Record<
  MarketplaceStatus,
  { hex: string; twBg: string; twText: string }
> = {
  placed:    { hex: '#F59E0B', twBg: 'bg-amber-500/10',  twText: 'text-amber-600'  },
  paid:      { hex: '#2E7D32', twBg: 'bg-green-800/10',  twText: 'text-green-800'  },
  preparing: { hex: '#6366F1', twBg: 'bg-indigo-500/10', twText: 'text-indigo-600' },
  shipped:   { hex: '#0A66C2', twBg: 'bg-blue-600/10',   twText: 'text-blue-600'   },
  delivered: { hex: '#2E7D32', twBg: 'bg-green-800/10',  twText: 'text-green-800'  },
  cancelled: { hex: '#E53935', twBg: 'bg-red-500/10',    twText: 'text-red-600'    },
  returned:  { hex: '#94A3B8', twBg: 'bg-slate-400/10',  twText: 'text-slate-500'  },
  refunded:  { hex: '#94A3B8', twBg: 'bg-slate-400/10',  twText: 'text-slate-500'  },
};

// ─── Tone map for BadgePill ───────────────────────────────────────────────────
// Maps each status hex color to the nearest BadgePill tone.
const STATUS_TONE: Record<MarketplaceStatus, BadgePillTone> = {
  placed:    'warning',
  paid:      'success',
  preparing: 'accent',
  shipped:   'info',
  delivered: 'success',
  cancelled: 'danger',
  returned:  'neutral',
  refunded:  'neutral',
};

// ─── statusBadgeProps helper ──────────────────────────────────────────────────
/**
 * Returns props for <BadgePill> that match the status.
 *
 * Usage:
 *   <BadgePill {...statusBadgeProps(order.status)} dot />
 */
export function statusBadgeProps(status: MarketplaceStatus): {
  tone: BadgePillTone;
  text: string;
} {
  return {
    tone: STATUS_TONE[status],
    text: STATUS_LABEL_RO[status],
  };
}

// ─── Convenience: NativeWind status pill JSX pattern (documentation) ─────────
/**
 * Recommended NativeWind status pill pattern (dot + label, from 06-orders.md §2):
 *
 * ```tsx
 * import { STATUS_COLORS, STATUS_LABEL_RO } from '@/lib/marketplace-status';
 *
 * const cfg = STATUS_COLORS[order.status];
 *
 * <View className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full ${cfg.twBg}`}>
 *   <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.hex }} />
 *   <Text className={`text-[11px] font-semibold ${cfg.twText}`}>
 *     {STATUS_LABEL_RO[order.status]}
 *   </Text>
 * </View>
 * ```
 *
 * Or use the <BadgePill> component:
 * ```tsx
 * import { statusBadgeProps } from '@/lib/marketplace-status';
 * import { BadgePill } from '@/components/ui/BadgePill';
 *
 * <BadgePill {...statusBadgeProps(order.status)} dot />
 * ```
 */
