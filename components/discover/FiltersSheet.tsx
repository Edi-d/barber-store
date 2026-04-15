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
import * as Haptics from 'expo-haptics';
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
        sheetRef.current?.expand();
      },
      close: () => sheetRef.current?.close(),
    }),
    [value]
  );

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
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Filtre</Text>
        <Pressable
          onPress={handleReset}
          disabled={resetDisabled}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.resetText, resetDisabled && styles.resetDisabled]}>
            Resetează
          </Text>
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
        <Pressable
          onPress={handleSubmit}
          className="flex-row items-center justify-center py-3"
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.ctaText}>
            {previewCount === 0
              ? 'Niciun rezultat'
              : `Arată ${previewCount} ${previewCount === 1 ? 'rezultat' : 'rezultate'}`}
          </Text>
          {activeCount > 0 && (
            <View style={styles.ctaBadge} className="ml-2">
              <Text style={styles.ctaBadgeText}>{activeCount}</Text>
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
  },
  handle: {
    backgroundColor: Colors.handleBar,
    width: 36,
    height: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  resetText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: Colors.primary,
  },
  resetDisabled: {
    opacity: 0.4,
  },
  body: {
    paddingBottom: Spacing.xl,
  },
  emptyMsg: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    backgroundColor: Colors.white,
  },
  cta: {
    backgroundColor: Colors.primary,
    ...Bubble.radiiSm,
  },
  ctaText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.white,
  },
  ctaBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  ctaBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: Colors.white,
  },
});
