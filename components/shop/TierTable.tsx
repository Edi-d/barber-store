/**
 * TierTable — Volume pricing tiers display.
 *
 * Extracted from Tapzi-barber/app/marketplace/product/[id].tsx
 * (inline TierRow + tierSection block at lines 496–541, 665–711, 862–940).
 *
 * Spec: 03-product-detail.md §5 "Tier Pricing"
 *
 * Reused by: PDP, cart, quick-order screens.
 *
 * Props:
 *  - tiers: array of { min_qty, price_cents } from marketplace_product_pricing_tiers
 *  - currentQty: currently selected quantity — highlights the active tier row
 *  - basePriceCents: the product's base unit price (for the "1 buc" row and savings calc)
 *
 * Visual:
 *  - Header row: trending-down icon + "Pret pe cantitate" label
 *  - Glass container: rgba(255,255,255,0.5) bg, rounded-xl, hairline border
 *  - Per-row: qty range label (left) | discount pill + price (right)
 *  - Active row: Brand.primaryMuted bg + blue dot + semiBold qty label + Brand.primary price
 *  - Savings pill at bottom when active tier saves money
 *
 * NativeWind note: rgba backgrounds and Bubble tokens are applied via StyleSheet
 * per the spec — not via className.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Brand, Bubble, Typography, Spacing, FontFamily } from '@/constants/theme';

type Tier = {
  min_qty: number;
  price_cents: number;
};

type Props = {
  tiers: Tier[];
  currentQty: number;
  basePriceCents: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatPrice(cents: number): string {
  const val = cents / 100;
  return val.toFixed(2).replace('.', ',') + ' RON';
}

function calcSavings(basePriceCents: number, activeTierPriceCents: number, qty: number): number {
  return Math.max(0, (basePriceCents - activeTierPriceCents) * qty);
}

// ─── TierRow ─────────────────────────────────────────────────────────────────
type TierRowProps = {
  label: string;
  price: string;
  discountLabel?: string;
  active: boolean;
};

function TierRow({ label, price, discountLabel, active }: TierRowProps) {
  return (
    <View style={[styles.tierRow, active && styles.tierRowActive]}>
      <View style={styles.tierLabelWrap}>
        {active && <View style={styles.tierActiveDot} />}
        <Text
          style={[
            styles.tierLabel,
            active ? { color: Brand.black, fontFamily: FontFamily.semiBold } : { color: '#65676B' },
          ]}
        >
          {label}
        </Text>
      </View>
      <View style={styles.tierPriceRow}>
        {discountLabel && (
          <View style={styles.tierDiscPill}>
            <Text style={styles.tierDiscText}>{discountLabel}</Text>
          </View>
        )}
        <Text style={[styles.tierPrice, { color: active ? Brand.primary : '#191919' }]}>
          {price}
        </Text>
      </View>
    </View>
  );
}

// ─── TierTable ───────────────────────────────────────────────────────────────
export function TierTable({ tiers, currentQty, basePriceCents }: Props) {
  if (!tiers.length) return null;

  // Determine the active tier for savings calculation
  let activeTierPriceCents = basePriceCents;
  for (const tier of tiers) {
    if (currentQty >= tier.min_qty) {
      activeTierPriceCents = tier.price_cents;
    }
  }

  const savings = calcSavings(basePriceCents, activeTierPriceCents, currentQty);

  return (
    <View style={styles.tierSection}>
      {/* Header */}
      <View style={styles.tierHeader}>
        <Feather name="trending-down" size={14} color={Brand.primary} />
        <Text style={styles.tierTitle}>Preț pe cantitate</Text>
      </View>

      {/* Table */}
      <View style={styles.tierTable}>
        {/* Base row: 1 buc at base price */}
        <TierRow
          label="1 buc"
          price={formatPrice(basePriceCents)}
          active={currentQty < (tiers[0]?.min_qty ?? Infinity)}
        />

        {/* Tier rows */}
        {tiers.map((tier, idx) => {
          const next = tiers[idx + 1];
          const rangeLabel = next
            ? `${tier.min_qty}–${next.min_qty - 1} buc`
            : `${tier.min_qty}+ buc`;

          const savePct = Math.round(
            ((basePriceCents - tier.price_cents) / basePriceCents) * 100,
          );

          const isActive =
            currentQty >= tier.min_qty && (!next || currentQty < next.min_qty);

          return (
            <TierRow
              key={tier.min_qty}
              label={rangeLabel}
              price={formatPrice(tier.price_cents)}
              discountLabel={savePct > 0 ? `-${savePct}%` : undefined}
              active={isActive}
            />
          );
        })}
      </View>

      {/* Savings pill */}
      {savings > 0 && (
        <View style={styles.savingsPill}>
          <Feather name="check" size={12} color="#2E7D32" />
          <Text style={styles.savingsText}>
            Economisesti {formatPrice(savings)} la cantitatea ta
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tierSection: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tierTitle: {
    ...Typography.captionSemiBold,
    fontSize: 13,
    color: '#191919',
  },
  tierTable: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    ...Bubble.radii,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  tierRowActive: {
    backgroundColor: Brand.primaryMuted,
  },
  tierLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tierActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Brand.primary,
  },
  tierLabel: {
    ...Typography.caption,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tierDiscPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    ...Bubble.radiiSm,
    backgroundColor: '#E8F5E9',
  },
  tierDiscText: {
    color: '#2E7D32',
    fontSize: 10,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.3,
  },
  tierPrice: {
    ...Typography.captionSemiBold,
  },
  savingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Bubble.radiiSm,
    backgroundColor: '#E8F5E9',
  },
  savingsText: {
    color: '#2E7D32',
    ...Typography.captionSemiBold,
    fontSize: 12,
  },
});
