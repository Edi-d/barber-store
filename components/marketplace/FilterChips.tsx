/**
 * FilterChips — Two horizontal scrollable filter rows: Categories + Brands.
 *
 * Ported from Tapzi-barber/components/shop/FilterChips.tsx with:
 *  - NativeWind className for layout on Pressable (per project rules).
 *  - Flat Colors constants (Colors[colorScheme] pattern — no dual-mode crash).
 *  - Pressable instead of TouchableOpacity per NativeWind convention.
 *  - Brands expandable: first 12 visible, "Mai multe"/"Mai putine" toggle.
 *
 * Spec: 02-listing-and-search.md §3 "Filter Chips"
 * Visual spec: 09-visual-spec.md Block 3 NativeWind translations.
 *
 * Props:
 *   categories      — ordered list of category slugs to display
 *   selectedCategory — currently active slug (null = "Toate")
 *   onCategoryChange — fires with new slug or null
 *   categoryCounts  — optional map of slug → product count
 *   brands          — ordered list of brand name strings
 *   selectedBrand   — currently active brand (null = "Toate")
 *   onBrandChange   — fires with new brand or null
 *   brandCounts     — optional map of brand → product count
 */

import { useState, useCallback } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Brand, Bubble, Colors, FontFamily, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CATEGORY_LABELS } from '@/data/types';

// ─── Category → Feather icon map ─────────────────────────────────────────────
// Matches barber-store category slugs (English) from data/products.json.
const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  clippers: 'tool',
  trimmers: 'crop',
  wax: 'droplet',
  combs: 'align-left',
  aftershave: 'wind',
  scissors: 'scissors',
  dye: 'feather',
  chairs: 'grid',
  shampoo: 'droplet',
  dryers: 'wind',
  gel: 'circle',
  powder: 'cloud',
  brushes: 'edit-3',
  blades: 'minus',
  razors: 'slash',
  furniture: 'box',
  cream: 'sun',
  spray: 'cloud-rain',
  fragrance: 'heart',
  accessories: 'tag',
  hygiene: 'shield',
  shaving: 'slash',
  grooming: 'user',
  'styling-tools': 'star',
  care: 'heart',
  promo: 'percent',
  altele: 'more-horizontal',
};

const INITIAL_BRAND_COUNT = 12;

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  categories: string[];
  selectedCategory: string | null;
  onCategoryChange: (cat: string | null) => void;
  categoryCounts?: Record<string, number>;
  brands: string[];
  selectedBrand: string | null;
  onBrandChange: (brand: string | null) => void;
  brandCounts?: Record<string, number>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function FilterChips({
  categories,
  selectedCategory,
  onCategoryChange,
  categoryCounts,
  brands,
  selectedBrand,
  onBrandChange,
  brandCounts,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [brandsExpanded, setBrandsExpanded] = useState(false);

  const visibleBrands = brandsExpanded ? brands : brands.slice(0, INITIAL_BRAND_COUNT);
  const hasMoreBrands = brands.length > INITIAL_BRAND_COUNT;

  const toggleBrands = useCallback(() => setBrandsExpanded((v) => !v), []);

  const totalCategoryCount = categoryCounts
    ? Object.values(categoryCounts).reduce((a, b) => a + b, 0)
    : undefined;

  const totalBrandCount = brandCounts
    ? Object.values(brandCounts).reduce((a, b) => a + b, 0)
    : undefined;

  return (
    <View style={styles.wrapper}>
      {/* ── Categories row ── */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Categorii</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {/* "Toate" chip */}
        <Pressable
          className="flex-row items-center px-3 py-2 border"
          style={[
            styles.chipBase,
            !selectedCategory ? styles.chipActive : styles.chipInactive,
          ]}
          onPress={() => onCategoryChange(null)}
        >
          <Feather
            name="layers"
            size={12}
            color={!selectedCategory ? Brand.white : colors.text}
            style={styles.chipIcon}
          />
          <Text style={[styles.chipText, { color: !selectedCategory ? Brand.white : colors.text }]}>
            Toate{totalCategoryCount != null ? ` (${totalCategoryCount})` : ''}
          </Text>
        </Pressable>

        {categories.map((cat) => {
          const active = selectedCategory === cat;
          const iconName = CATEGORY_ICONS[cat] ?? 'tag';
          const count = categoryCounts?.[cat];
          return (
            <Pressable
              key={cat}
              className="flex-row items-center px-3 py-2 border"
              style={[styles.chipBase, active ? styles.chipActive : styles.chipInactive]}
              onPress={() => onCategoryChange(active ? null : cat)}
            >
              <Feather
                name={iconName}
                size={12}
                color={active ? Brand.white : colors.text}
                style={styles.chipIcon}
              />
              <Text style={[styles.chipText, { color: active ? Brand.white : colors.text }]}>
                {CATEGORY_LABELS[cat] ?? cat}
                {count != null ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Brands row ── */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Branduri</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {/* "Toate" chip */}
        <Pressable
          className="flex-row items-center px-3 py-2 border"
          style={[
            styles.chipBase,
            !selectedBrand ? styles.chipActive : styles.chipInactive,
          ]}
          onPress={() => onBrandChange(null)}
        >
          <Text style={[styles.chipText, { color: !selectedBrand ? Brand.white : colors.text }]}>
            Toate{totalBrandCount != null ? ` (${totalBrandCount})` : ''}
          </Text>
        </Pressable>

        {visibleBrands.map((brand) => {
          const active = selectedBrand === brand;
          const count = brandCounts?.[brand];
          return (
            <Pressable
              key={brand}
              className="flex-row items-center px-3 py-2 border"
              style={[styles.chipBase, active ? styles.chipActive : styles.chipInactive]}
              onPress={() => onBrandChange(active ? null : brand)}
            >
              <Text style={[styles.chipText, { color: active ? Brand.white : colors.text }]}>
                {brand}
                {count != null ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}

        {/* Expand / collapse toggle */}
        {hasMoreBrands && (
          <Pressable
            className="flex-row items-center px-3 py-2 border"
            style={[styles.chipBase, styles.chipToggle]}
            onPress={toggleBrands}
          >
            <Feather
              name={brandsExpanded ? 'chevron-left' : 'chevron-right'}
              size={12}
              color={Brand.primary}
              style={styles.chipIcon}
            />
            <Text style={[styles.chipText, { color: Brand.primary }]}>
              {brandsExpanded ? 'Mai putine' : 'Mai multe'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
// NativeWind handles layout (flex-row, items-center, px-3, py-2, border).
// StyleSheet handles token-based colors and Bubble radii (not expressible in Tailwind).

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.smallSemiBold,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  row: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },

  // Base chip shape — Bubble.radiiSm cannot be expressed in Tailwind
  chipBase: {
    ...Bubble.radiiSm,
  },

  // State variants — brand colors are design tokens, not Tailwind classes
  chipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  chipInactive: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  chipToggle: {
    backgroundColor: Brand.primaryMuted,
    borderColor: Brand.primaryMuted,
  },

  chipIcon: {
    marginRight: 4,
  },
  chipText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },
});
