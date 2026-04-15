// components/discover/FiltersSheet.tsx
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useUIStore } from '@/stores/uiStore';
import { Colors, FontFamily, Spacing, Bubble } from '@/constants/theme';
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  isDefaultFilters,
  type DiscoverFilters,
} from '@/types/filters';
import {
  DISTANCE_OPTIONS,
  RATING_OPTIONS,
  AVAILABILITY_OPTIONS,
  SORT_OPTIONS,
  AMENITY_OPTIONS,
  PRICE_RANGE_MIN_LEI,
  PRICE_RANGE_MAX_LEI,
  PRICE_RANGE_STEP_LEI,
  availabilityKey,
  type AmenityItem,
} from '@/constants/filters';
import { ChipGroup } from './filters/ChipGroup';
import { AccordionRow } from './filters/AccordionRow';
import { PriceRangeSlider } from './filters/PriceRangeSlider';
import {
  formatDistance,
  formatPrice,
  formatRating,
  formatAvailability,
  formatServices,
  formatAmenities,
  formatSort,
} from './filters/formatValue';

export interface FiltersSheetHandle {
  open: () => void;
  close: () => void;
}

export interface ServiceOption {
  key: string;
  label: string;
}

interface Props {
  value: DiscoverFilters;
  onApply: (next: DiscoverFilters) => void;
  /** Services loaded from DB. Empty = "no services available" state. */
  serviceOptions: ServiceOption[];
  /**
   * Pure function that returns how many results the current draft would yield.
   * Must be memoized by the parent (useCallback) so it doesn't cause re-renders.
   */
  computePreview: (draft: DiscoverFilters) => number;
}

type RowKey =
  | 'distance'
  | 'price'
  | 'rating'
  | 'availability'
  | 'services'
  | 'amenities'
  | 'sort';

export const FiltersSheet = forwardRef<FiltersSheetHandle, Props>(function FiltersSheet(
  { value, onApply, serviceOptions, computePreview },
  ref
) {
  const sheetRef = useRef<BottomSheet>(null);
  const setTabBarHidden = useUIStore((s) => s.setTabBarHidden);
  const [draft, setDraft] = useState<DiscoverFilters>(value);
  const [expanded, setExpanded] = useState<RowKey | null>('distance');

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const previewCount = useMemo(() => computePreview(draft), [draft, computePreview]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setDraft(value);
        setExpanded('distance');
        setTabBarHidden(true);
        sheetRef.current?.expand();
      },
      close: () => sheetRef.current?.close(),
    }),
    [value, setTabBarHidden]
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      // index < 0 means sheet is closed
      if (index < 0) {
        setTabBarHidden(false);
      }
    },
    [setTabBarHidden]
  );

  // Safety: restore tab bar on unmount
  useEffect(() => {
    return () => setTabBarHidden(false);
  }, [setTabBarHidden]);

  const snapPoints = useMemo(() => ['85%'], []);

  const handleToggle = useCallback((key: RowKey) => {
    setExpanded((curr) => (curr === key ? null : key));
  }, []);

  const handleReset = useCallback(() => {
    setDraft(DEFAULT_FILTERS);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSubmit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onApply(draft);
    sheetRef.current?.close();
  }, [draft, onApply]);

  const resetDisabled = isDefaultFilters(draft);
  const activeCount = countActiveFilters(draft);

  const serviceLabelMap = useMemo(
    () => new Map(serviceOptions.map((s) => [s.key, s.label])),
    [serviceOptions]
  );

  const renderBackdrop = useCallback(
    (p: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...p}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Filtre</Text>
        <Pressable onPress={handleReset} disabled={resetDisabled}>
          {({ pressed }) => (
            <View style={{ opacity: resetDisabled ? 0.35 : pressed ? 0.6 : 1 }}>
              <Text style={styles.resetText}>Resetează</Text>
            </View>
          )}
        </Pressable>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <AccordionRow
          label="Distanță"
          value={formatDistance(draft.distanceKm)}
          isSet={draft.distanceKm != null}
          expanded={expanded === 'distance'}
          onToggle={() => handleToggle('distance')}
        >
          <ChipGroup
            mode="single"
            items={DISTANCE_OPTIONS}
            selected={draft.distanceKm}
            onChange={(v) => setDraft({ ...draft, distanceKm: v })}
          />
        </AccordionRow>

        <AccordionRow
          label="Preț"
          value={formatPrice(draft.priceMinCents, draft.priceMaxCents)}
          isSet={draft.priceMinCents != null || draft.priceMaxCents != null}
          expanded={expanded === 'price'}
          onToggle={() => handleToggle('price')}
        >
          <PriceRangeSlider
            minLei={draft.priceMinCents != null ? draft.priceMinCents / 100 : null}
            maxLei={draft.priceMaxCents != null ? draft.priceMaxCents / 100 : null}
            boundsMinLei={PRICE_RANGE_MIN_LEI}
            boundsMaxLei={PRICE_RANGE_MAX_LEI}
            stepLei={PRICE_RANGE_STEP_LEI}
            onChange={({ minLei, maxLei }) =>
              setDraft({
                ...draft,
                priceMinCents: minLei == null ? null : minLei * 100,
                priceMaxCents: maxLei == null ? null : maxLei * 100,
              })
            }
          />
        </AccordionRow>

        <AccordionRow
          label="Rating"
          value={formatRating(draft.minRating)}
          isSet={draft.minRating != null}
          expanded={expanded === 'rating'}
          onToggle={() => handleToggle('rating')}
        >
          <ChipGroup
            mode="single"
            items={RATING_OPTIONS}
            selected={draft.minRating}
            onChange={(v) => setDraft({ ...draft, minRating: v })}
          />
        </AccordionRow>

        <AccordionRow
          label="Disponibilitate"
          value={formatAvailability(draft.availability)}
          isSet={draft.availability.kind !== 'any'}
          expanded={expanded === 'availability'}
          onToggle={() => handleToggle('availability')}
        >
          <ChipGroup
            mode="single"
            items={AVAILABILITY_OPTIONS}
            selected={draft.availability}
            isEqual={(a, b) => availabilityKey(a) === availabilityKey(b)}
            onChange={(v) => setDraft({ ...draft, availability: v })}
          />
        </AccordionRow>

        <AccordionRow
          label="Servicii"
          value={formatServices(draft.services, serviceLabelMap)}
          isSet={draft.services.length > 0}
          expanded={expanded === 'services'}
          onToggle={() => handleToggle('services')}
        >
          {serviceOptions.length === 0 ? (
            <Text style={styles.emptyMsg}>Nu s-au putut încărca serviciile.</Text>
          ) : (
            <ChipGroup
              mode="multi"
              items={serviceOptions.map((s) => ({ value: s.key, label: s.label }))}
              selected={draft.services}
              onChange={(v) => setDraft({ ...draft, services: v })}
            />
          )}
        </AccordionRow>

        <AccordionRow
          label="Amenities"
          value={formatAmenities(draft.amenities, AMENITY_OPTIONS)}
          isSet={draft.amenities.length > 0}
          expanded={expanded === 'amenities'}
          onToggle={() => handleToggle('amenities')}
        >
          <ChipGroup
            mode="multi"
            items={AMENITY_OPTIONS.map((a: AmenityItem) => ({ value: a.key, label: a.label }))}
            selected={draft.amenities}
            onChange={(v) => setDraft({ ...draft, amenities: v })}
          />
        </AccordionRow>

        <AccordionRow
          label="Sortare"
          value={formatSort(draft.sort)}
          isSet={draft.sort !== 'recommended'}
          expanded={expanded === 'sort'}
          onToggle={() => handleToggle('sort')}
        >
          <ChipGroup
            mode="single"
            items={SORT_OPTIONS}
            selected={draft.sort}
            onChange={(v) => setDraft({ ...draft, sort: v })}
          />
        </AccordionRow>
      </BottomSheetScrollView>

      <View style={styles.footer}>
        <Pressable onPress={handleSubmit} disabled={previewCount === 0}>
          {({ pressed }) => (
            <View style={[styles.ctaShadow, pressed && styles.ctaPressed]}>
              <LinearGradient
                colors={
                  previewCount === 0
                    ? ['#cbd5e1', '#94a3b8']
                    : [Colors.gradientStart, Colors.primary, Colors.gradientEnd]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                {activeCount > 0 && (
                  <View style={styles.ctaBadge}>
                    <Text style={styles.ctaBadgeText}>{activeCount}</Text>
                  </View>
                )}
                <Text style={styles.ctaText}>
                  {previewCount === 0
                    ? 'Niciun rezultat'
                    : `Arată ${previewCount} ${previewCount === 1 ? 'rezultat' : 'rezultate'}`}
                </Text>
                {previewCount > 0 && (
                  <View style={styles.ctaArrow}>
                    <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                  </View>
                )}
              </LinearGradient>
            </View>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: Colors.white,
    ...Bubble.sheetRadii,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
  },
  handle: {
    backgroundColor: 'rgba(15,23,42,0.15)',
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  resetText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.primary,
  },
  body: {
    paddingBottom: 32,
  },
  emptyMsg: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    backgroundColor: Colors.white,
  },
  ctaShadow: {
    ...Bubble.radiiSm,
    shadowColor: Colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cta: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...Bubble.radiiSm,
    overflow: 'hidden',
  },
  ctaPressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.18,
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.white,
    letterSpacing: 0.2,
  },
  ctaBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderRadius: 11,
  },
  ctaBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: Colors.white,
  },
  ctaArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
