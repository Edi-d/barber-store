/**
 * Discover screen — web-only fallback
 *
 * react-native-maps is unavailable on web, so this file renders a list-only
 * view using the exact same data-fetching, filter logic, and components as
 * discover.tsx. Metro picks this file on web; the native discover.tsx is
 * untouched and loads on iOS/Android as before.
 *
 * Differences from the native version:
 * - No MapView / SalonMarker / BottomSheet — replaced with a ScrollView list
 * - FiltersSheet (@gorhom/bottom-sheet) is wrapped in a plain RN Modal so
 *   it renders correctly on web
 * - expo-haptics calls are kept (they're no-ops on web)
 * - Tutorial refs are kept for API compatibility but the tutorial overlay
 *   won't appear on web
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { Salon, AppointmentWithDetails, SalonHappyHour } from '@/types/database';
import { CategoryPickerModal } from '@/components/discover/CategoryPickerModal';
import { Ionicons } from '@expo/vector-icons';
import { enrichSalons, SalonWithDistance } from '@/lib/discover';
import { CountdownTimer } from '@/components/shared/CountdownTimer';
import { UpcomingAppointmentBanner } from '@/components/home/UpcomingAppointmentBanner';
import { Bubble, Colors, FontFamily } from '@/constants/theme';
import { DiscoverSalonCard } from '@/components/discover/DiscoverSalonCard';
import * as Haptics from 'expo-haptics';
import { useDiscoverFilters } from '@/hooks/useDiscoverFilters';
import { applyFilters, type FilterContext } from '@/lib/discover-filter';
import type { DiscoverFilters } from '@/types/filters';
import { FiltersSheet, type FiltersSheetHandle, type ServiceOption } from '@/components/discover/FiltersSheet';
import { BarberService } from '@/types/database';

const bubbleRadii = Bubble.radii;
const bubbleRadiiSm = Bubble.radiiSm;

// ─── Web-safe FiltersSheet wrapper ──────────────────────────────────────────
//
// FiltersSheet uses @gorhom/bottom-sheet which has limited web support.
// We wrap it in a plain RN Modal so the filter UI is reachable on web.
// The ref-forwarded handle (open/close) is replicated via local state.

interface FiltersModalWrapperProps {
  value: DiscoverFilters;
  onApply: (next: DiscoverFilters) => void;
  serviceOptions: ServiceOption[];
  computePreview: (draft: DiscoverFilters) => number;
  sheetRef: React.RefObject<FiltersSheetHandle>;
}

function FiltersModalWrapper({
  value,
  onApply,
  serviceOptions,
  computePreview,
  sheetRef,
}: FiltersModalWrapperProps) {
  const [open, setOpen] = useState(false);

  // Expose open() / close() on the ref so the parent can call sheetRef.current?.open()
  // without knowing about the internal modal state.
  useEffect(() => {
    if (sheetRef && 'current' in sheetRef) {
      (sheetRef as React.MutableRefObject<FiltersSheetHandle>).current = {
        open: () => setOpen(true),
        close: () => setOpen(false),
      };
    }
  }, [sheetRef]);

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setOpen(false)}
    >
      {/* FiltersSheet needs to be mounted inside a View that fills the modal */}
      <View style={{ flex: 1 }}>
        {/* We render FiltersSheet as a fully-expanded bottom sheet by giving it
            a dedicated full-height container. Its internal BottomSheet is set to
            index 0 (fully open) which maps to the first snap point. */}
        <FiltersSheet
          ref={null}
          value={value}
          onApply={(next) => {
            onApply(next);
            setOpen(false);
          }}
          serviceOptions={serviceOptions}
          computePreview={computePreview}
        />
        {/* Close affordance for web (FiltersSheet's own close button handles native) */}
        <Pressable
          style={styles.modalCloseBtn}
          onPress={() => setOpen(false)}
        >
          <Text style={styles.modalCloseBtnText}>Inchide</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuthStore();
  const { latitude, longitude, requestLocation } = useLocationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterAvailableNow, setFilterAvailableNow] = useState(false);
  const { filters: discoverFilters, apply: applyDiscoverFilters, count: discoverFilterCount } = useDiscoverFilters();
  const filtersSheetRef = useRef<FiltersSheetHandle>(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    const shouldBeOn = discoverFilters.availability.kind === 'now';
    if (shouldBeOn !== filterAvailableNow) {
      setFilterAvailableNow(shouldBeOn);
    }
  }, [discoverFilters.availability, filterAvailableNow]);

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    setShowCategoryPicker(true);
  }, []);

  // ── Data fetching (identical to native discover.tsx) ──────────────────────

  const { data: salonsList, isLoading: salonsLoading } = useQuery({
    queryKey: ['salons-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salons')
        .select('*')
        .eq('active', true)
        .not('latitude', 'is', null)
        .order('name');
      if (error) throw error;
      return data as Salon[];
    },
  });

  const { data: favorites } = useQuery({
    queryKey: ['salon-favorites', session?.user.id],
    queryFn: async () => {
      if (!session) return [];
      const { data, error } = await supabase
        .from('salon_favorites')
        .select('salon_id')
        .eq('user_id', session.user.id);
      if (error) throw error;
      return data.map((f: any) => f.salon_id) as string[];
    },
    enabled: !!session,
  });

  const { data: happyHours } = useQuery({
    queryKey: ['happy-hours-active'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('salon_happy_hours')
        .select('*')
        .eq('active', true)
        .lte('starts_at', now)
        .gte('ends_at', now);
      if (error) throw error;
      return data as SalonHappyHour[];
    },
    refetchInterval: 60000,
  });

  const { data: availabilityData } = useQuery({
    queryKey: ['barber-availability-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('barber_availability')
        .select('barber_id, day_of_week, start_time, end_time, is_available, barber:barbers!inner(salon_id)')
        .eq('is_available', true);
      if (error) throw error;
      return data as { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean; barber: { salon_id: string | null } }[];
    },
    refetchInterval: 60000,
  });

  const { data: todayAppointments } = useQuery({
    queryKey: ['today-appointments-all'],
    queryFn: async () => {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('appointments')
        .select('barber_id, scheduled_at, duration_min')
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_at', startOfDay.toISOString())
        .lte('scheduled_at', endOfDay.toISOString());
      if (error) throw error;
      return data as { barber_id: string; scheduled_at: string; duration_min: number }[];
    },
    refetchInterval: 60000,
  });

  const { data: servicePricesData } = useQuery({
    queryKey: ['salon-price-ranges'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('barber_services')
        .select('salon_id, price_cents')
        .eq('active', true)
        .not('salon_id', 'is', null);
      if (error) throw error;
      return data as { salon_id: string; price_cents: number }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: salonServicesData } = useQuery({
    queryKey: ['salon-services-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('barber_services')
        .select('id, salon_id, name, description, duration_min, price_cents, currency, category, active, created_at')
        .eq('active', true)
        .not('salon_id', 'is', null);
      if (error) throw error;
      return data as BarberService[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: salonPhotosData } = useQuery({
    queryKey: ['salon-photos-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salon_photos')
        .select('salon_id, photo_url, sort_order')
        .order('sort_order');
      if (error) throw error;
      return data as { salon_id: string; photo_url: string; sort_order: number }[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: appointments } = useQuery({
    queryKey: ['appointments-upcoming', session?.user.id],
    queryFn: async () => {
      if (!session) return [];
      const { data, error } = await supabase
        .from('appointments')
        .select('*, barber:barbers(*), service:barber_services(*)')
        .eq('user_id', session.user.id)
        .gte('scheduled_at', new Date().toISOString())
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true })
        .limit(3);
      if (error) throw error;
      return data as AppointmentWithDetails[];
    },
    enabled: !!session,
  });

  // ── Derived data (identical computations to native) ───────────────────────

  const servicesBySalonId = useMemo(() => {
    const map = new Map<string, BarberService[]>();
    if (!salonServicesData) return map;
    for (const s of salonServicesData) {
      if (!s.salon_id) continue;
      const list = map.get(s.salon_id) ?? [];
      list.push(s);
      map.set(s.salon_id, list);
    }
    return map;
  }, [salonServicesData]);

  const serviceOptions = useMemo<ServiceOption[]>(() => {
    const seen = new Map<string, string>();
    if (!salonServicesData) return [];
    const humanize = (raw: string): string => {
      const words = raw.replace(/[_-]+/g, ' ').trim().split(/\s+/);
      return words
        .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join(' ');
    };
    for (const s of salonServicesData) {
      const key = (s.category ?? s.name ?? '').toLowerCase();
      if (!key) continue;
      if (!seen.has(key)) {
        seen.set(key, humanize(s.category ?? s.name ?? key));
      }
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [salonServicesData]);

  const availabilityMap = useMemo(() => {
    const map = new Map<string, { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean }[]>();
    if (!availabilityData) return map;
    for (const a of availabilityData) {
      const salonId = a.barber?.salon_id;
      if (!salonId) continue;
      const list = map.get(salonId) || [];
      list.push({ barber_id: a.barber_id, day_of_week: a.day_of_week, start_time: a.start_time, end_time: a.end_time, is_available: a.is_available });
      map.set(salonId, list);
    }
    return map;
  }, [availabilityData]);

  const scheduleDaysBySalonId = useMemo(() => {
    const map = new Map<string, Set<number>>();
    if (!availabilityData) return map;
    for (const a of availabilityData) {
      const salonId = a.barber?.salon_id;
      if (!salonId) continue;
      const set = map.get(salonId) ?? new Set<number>();
      set.add(a.day_of_week);
      map.set(salonId, set);
    }
    return map;
  }, [availabilityData]);

  const barberAppointmentsMap = useMemo(() => {
    const map = new Map<string, { barber_id: string; scheduled_at: string; duration_min: number }[]>();
    if (!todayAppointments) return map;
    for (const appt of todayAppointments) {
      const list = map.get(appt.barber_id) || [];
      list.push(appt);
      map.set(appt.barber_id, list);
    }
    return map;
  }, [todayAppointments]);

  const salonPhotosMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!salonPhotosData) return map;
    for (const p of salonPhotosData) {
      const list = map.get(p.salon_id) || [];
      list.push(p.photo_url);
      map.set(p.salon_id, list);
    }
    return map;
  }, [salonPhotosData]);

  const priceRangeMap = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    if (!servicePricesData) return map;
    for (const s of servicePricesData) {
      if (!s.salon_id) continue;
      const existing = map.get(s.salon_id);
      if (existing) {
        existing.min = Math.min(existing.min, s.price_cents);
        existing.max = Math.max(existing.max, s.price_cents);
      } else {
        map.set(s.salon_id, { min: s.price_cents, max: s.price_cents });
      }
    }
    return map;
  }, [servicePricesData]);

  const salons = useMemo(() => {
    if (!salonsList) return [];
    const favSet = new Set(favorites || []);
    return enrichSalons(salonsList, latitude, longitude, favSet, happyHours || [], availabilityMap, barberAppointmentsMap, priceRangeMap);
  }, [salonsList, latitude, longitude, favorites, happyHours, availabilityMap, barberAppointmentsMap, priceRangeMap]);

  const sortedSalons = useMemo(() => {
    let filtered = [...salons];
    if (showFavoritesOnly) filtered = filtered.filter((s) => s.is_favorite);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.city?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q) ||
          s.specialties?.some((sp) => sp.toLowerCase().includes(q)) ||
          s.bio?.toLowerCase().includes(q)
      );
    }
    const ctx: FilterContext = {
      servicesBySalonId,
      scheduleDaysBySalonId,
      now: new Date(),
    };
    filtered = applyFilters(filtered, discoverFilters, ctx);
    return filtered;
  }, [salons, searchQuery, showFavoritesOnly, discoverFilters, servicesBySalonId, scheduleDaysBySalonId]);

  const baseSalonsForPreview = useMemo(() => {
    let base = [...salons];
    if (showFavoritesOnly) base = base.filter((s) => s.is_favorite);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.city?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q) ||
          s.specialties?.some((sp) => sp.toLowerCase().includes(q)) ||
          s.bio?.toLowerCase().includes(q)
      );
    }
    return base;
  }, [salons, searchQuery, showFavoritesOnly]);

  const computeFilterPreview = useCallback(
    (draft: DiscoverFilters) => {
      const ctx: FilterContext = { servicesBySalonId, scheduleDaysBySalonId, now: new Date() };
      return applyFilters(baseSalonsForPreview, draft, ctx).length;
    },
    [baseSalonsForPreview, servicesBySalonId, scheduleDaysBySalonId]
  );

  const availableNowCount = useMemo(
    () => salons.filter((s) => s.is_available_now && (s.distance_km == null || s.distance_km <= 5)).length,
    [salons]
  );

  const happyHourSalons = useMemo(
    () => salons.filter((s) => s.has_happy_hour && (!discoverFilters.salonType || s.salon_types?.includes(discoverFilters.salonType))),
    [salons, discoverFilters.salonType]
  );
  const recommendedSalons = useMemo(
    () => [...salons]
      .filter((s) => !discoverFilters.salonType || s.salon_types?.includes(discoverFilters.salonType))
      .sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))
      .slice(0, 4),
    [salons, discoverFilters.salonType]
  );
  const favoriteSalons = useMemo(
    () => salons.filter((s) => s.is_favorite && (!discoverFilters.salonType || s.salon_types?.includes(discoverFilters.salonType))).slice(0, 4),
    [salons, discoverFilters.salonType]
  );

  const searchResultsSalons = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return salons.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q) ||
        s.specialties?.some((sp) => sp.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [salons, searchQuery]);

  const showSearchDropdown = searchQuery.length >= 2 && searchResultsSalons.length > 0;

  const nextAppointment = appointments?.[0];

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';

  const urgencyDebounceRef = useRef(false);
  const handleUrgencyPress = () => {
    if (urgencyDebounceRef.current) return;
    urgencyDebounceRef.current = true;
    setTimeout(() => { urgencyDebounceRef.current = false; }, 400);
    const next = !filterAvailableNow;
    setFilterAvailableNow(next);
    applyDiscoverFilters({
      ...discoverFilters,
      availability: next ? { kind: 'now' } : { kind: 'any' },
    });
    if (next) setShowFavoritesOnly(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* ── Top search bar ── */}
      <View style={[styles.searchBarContainer, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.searchBar, bubbleRadii]}>
          <Ionicons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Caută salon, zonă, serviciu..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => { setSearchQuery(''); Keyboard.dismiss(); }}>
              <Ionicons name="close-circle" size={20} color="#94a3b8" />
            </Pressable>
          )}
          {/* Filter button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              filtersSheetRef.current?.open();
            }}
            style={[
              styles.filterBtn,
              discoverFilterCount > 0 && styles.filterBtnActive,
            ]}
          >
            <Ionicons
              name="options"
              size={18}
              color={discoverFilterCount > 0 ? Colors.primary : Colors.textSecondary}
            />
            {discoverFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{discoverFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Search dropdown */}
        {showSearchDropdown && (
          <View style={[styles.searchDropdown, bubbleRadii]}>
            {searchResultsSalons.map((salon, idx) => (
              <Pressable
                key={salon.id}
                style={[styles.searchDropdownItem, idx > 0 && styles.searchDropdownDivider]}
                onPress={() => {
                  Keyboard.dismiss();
                  setSearchQuery(salon.name);
                }}
              >
                <View style={styles.searchDropdownAvatar}>
                  {salon.avatar_url ? (
                    <Image source={{ uri: salon.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="cut" size={16} color="#0a85f4" />
                    </View>
                  )}
                </View>
                <View style={styles.searchDropdownInfo}>
                  <Text style={styles.searchDropdownName} numberOfLines={1}>{salon.name}</Text>
                  <Text style={styles.searchDropdownSub} numberOfLines={1}>{salon.address || salon.city}</Text>
                </View>
                {salon.distance_km != null && (
                  <Text style={styles.searchDropdownDist}>
                    {salon.distance_km < 1
                      ? `${Math.round(salon.distance_km * 1000 / 50) * 50} m`
                      : salon.distance_km < 10
                        ? `${salon.distance_km.toFixed(1)} km`
                        : `${Math.round(salon.distance_km)} km`}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ── Main scrollable content ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {(profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.greetingSub}>{greeting},</Text>
              <Text style={styles.greetingName}>
                {profile?.display_name || profile?.username || 'Bun venit'}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.headerBtn}
              onPress={() => setShowChat(true)}
            >
              <Ionicons name="chatbubble-outline" size={17} color="#191919" />
            </Pressable>
            <Pressable
              style={styles.headerBtn}
              onPress={() => setShowNotifications(true)}
            >
              <Ionicons name="notifications-outline" size={17} color="#191919" />
            </Pressable>
          </View>
        </View>

        {/* Urgency chip */}
        <Pressable
          onPress={handleUrgencyPress}
          style={[
            styles.urgencyCard,
            bubbleRadii,
            filterAvailableNow && styles.urgencyCardActive,
          ]}
        >
          <View style={[styles.urgencyIcon, filterAvailableNow ? styles.urgencyIconActive : styles.urgencyIconDefault]}>
            <Ionicons
              name={filterAvailableNow ? 'checkmark-circle' : 'flash'}
              size={20}
              color="white"
            />
          </View>
          <View style={styles.urgencyText}>
            <Text style={[styles.urgencyTitle, filterAvailableNow && styles.urgencyTitleActive]}>
              {filterAvailableNow
                ? `${sortedSalons.length} saloane disponibile`
                : 'Cine e liber acum?'}
            </Text>
            <Text style={[styles.urgencySub, filterAvailableNow && styles.urgencySubActive]}>
              {filterAvailableNow
                ? 'Apasă pentru a vedea toate'
                : availableNowCount > 0
                  ? `${availableNowCount} disponibile · rază 5 km`
                  : 'Niciun salon disponibil acum'}
            </Text>
          </View>
          {filterAvailableNow ? (
            <View style={styles.urgencyClose}>
              <Ionicons name="close" size={16} color="#059669" />
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          )}
        </Pressable>

        {/* Upcoming appointment */}
        {nextAppointment && (
          <View style={styles.sectionPad}>
            <UpcomingAppointmentBanner
              appointment={nextAppointment}
              onPress={() => router.push('/appointments' as any)}
            />
          </View>
        )}

        {/* Happy Hour */}
        {happyHourSalons.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Happy Hour — Oferte Active</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {happyHourSalons.map((salon) => (
                <Pressable
                  key={salon.id}
                  style={[styles.hhCard, bubbleRadiiSm]}
                  onPress={() => router.push(`/salon/${salon.id}` as any)}
                >
                  <View style={styles.hhImageContainer}>
                    {salon.cover_url || salon.avatar_url ? (
                      <Image source={{ uri: salon.cover_url || salon.avatar_url! }} style={styles.hhImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.hhImage, styles.hhImagePlaceholder]}>
                        <Ionicons name="cut" size={22} color="#0a85f4" />
                      </View>
                    )}
                    {salon.happy_hour_discount != null && (
                      <View style={styles.hhBadge}>
                        <Text style={styles.hhBadgeText}>-{salon.happy_hour_discount}%</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.hhInfo}>
                    <Text style={styles.hhName} numberOfLines={1}>{salon.name}</Text>
                    <View style={styles.hhMeta}>
                      {salon.rating_avg != null && (
                        <View style={styles.ratingRow}>
                          <Ionicons name="star" size={10} color="#f59e0b" />
                          <Text style={styles.ratingText}>{salon.rating_avg.toFixed(1)}</Text>
                        </View>
                      )}
                      {salon.happy_hour_ends_at && <CountdownTimer endsAt={salon.happy_hour_ends_at} />}
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Favorites */}
        {favoriteSalons.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Favorite</Text>
              <Pressable onPress={() => { setShowFavoritesOnly(true); setFilterAvailableNow(false); }}>
                <Text style={styles.sectionAction}>Vezi toate</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {favoriteSalons.map((salon) => (
                <Pressable
                  key={salon.id}
                  style={[styles.favCard, bubbleRadiiSm]}
                  onPress={() => router.push(`/salon/${salon.id}` as any)}
                >
                  <View style={styles.favImageContainer}>
                    {salon.cover_url || salon.avatar_url ? (
                      <Image source={{ uri: salon.cover_url || salon.avatar_url! }} style={styles.favImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.favImage, styles.hhImagePlaceholder]}>
                        <Ionicons name="cut" size={20} color="#0a85f4" />
                      </View>
                    )}
                    <View style={styles.heartBadge}>
                      <Ionicons name="heart" size={13} color="#ef4444" />
                    </View>
                  </View>
                  <View style={styles.hhInfo}>
                    <Text style={styles.favName} numberOfLines={1}>{salon.name}</Text>
                    {salon.rating_avg != null && (
                      <View style={styles.ratingRow}>
                        <Ionicons name="star" size={9} color="#f59e0b" />
                        <Text style={styles.ratingText}>{salon.rating_avg.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.favAccent} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recommended */}
        {recommendedSalons.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recomandate</Text>
            <View style={styles.sectionPad}>
              {recommendedSalons.map((salon) => (
                <DiscoverSalonCard
                  key={salon.id}
                  salon={salon}
                  photos={salonPhotosMap.get(salon.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* All salons */}
        <View style={styles.sectionPad}>
          <Text style={styles.sectionTitle}>
            {showFavoritesOnly
              ? 'Favorite'
              : discoverFilters.salonType
              ? discoverFilters.salonType === 'barbershop' ? 'Barbershop-uri' : 'Coafuri'
              : filterAvailableNow ? 'Disponibile acum' : 'Toate saloanele'}
            {sortedSalons.length > 0 && (
              <Text style={styles.sectionCount}> · {sortedSalons.length}</Text>
            )}
          </Text>

          {salonsLoading ? (
            <ActivityIndicator size="large" color="#0a85f4" style={{ marginVertical: 32 }} />
          ) : sortedSalons.length > 0 ? (
            <View style={styles.cardList}>
              {sortedSalons.map((salon) => (
                <DiscoverSalonCard
                  key={salon.id}
                  salon={salon}
                  photos={salonPhotosMap.get(salon.id)}
                />
              ))}
            </View>
          ) : filterAvailableNow ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="time-outline" size={32} color="#94a3b8" />
              </View>
              <Text style={styles.emptyTitle}>Niciun salon disponibil acum</Text>
              <Text style={styles.emptySub}>Încearcă din nou mai târziu sau mărește raza de căutare</Text>
            </View>
          ) : (
            <View style={[styles.emptyCardState, bubbleRadii]}>
              <Ionicons name="search-outline" size={40} color="#cbd5e1" />
              <Text style={styles.emptyCardTitle}>Niciun rezultat</Text>
              {discoverFilters.salonType && (
                <Pressable
                  style={[styles.resetBtn, bubbleRadiiSm]}
                  onPress={() => {
                    setFilterAvailableNow(false);
                    applyDiscoverFilters({ ...discoverFilters, salonType: null });
                    setShowFavoritesOnly(false);
                  }}
                >
                  <Text style={styles.resetBtnText}>Arată toate saloanele</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Filters Modal (web-safe wrapper around FiltersSheet) ── */}
      <FiltersModalWrapper
        sheetRef={filtersSheetRef}
        value={discoverFilters}
        onApply={(next) => {
          applyDiscoverFilters(next);
        }}
        serviceOptions={serviceOptions}
        computePreview={computeFilterPreview}
      />

      {/* ── Notifications Modal ── */}
      <Modal
        visible={showNotifications}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNotifications(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Notificări</Text>
            <Pressable onPress={() => setShowNotifications(false)} style={styles.modalCloseX}>
              <Ionicons name="close" size={18} color="#64748b" />
            </Pressable>
          </View>
          <View style={styles.modalEmptyBody}>
            <View style={styles.modalEmptyIcon}>
              <Ionicons name="notifications-outline" size={36} color="#cbd5e1" />
            </View>
            <Text style={styles.modalEmptyTitle}>Nicio notificare</Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Chat Modal ── */}
      <Modal
        visible={showChat}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowChat(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Mesaje</Text>
            <Pressable onPress={() => setShowChat(false)} style={styles.modalCloseX}>
              <Ionicons name="close" size={18} color="#64748b" />
            </Pressable>
          </View>
          <View style={styles.modalEmptyBody}>
            <View style={styles.modalEmptyIcon}>
              <Ionicons name="chatbubbles-outline" size={36} color="#cbd5e1" />
            </View>
            <Text style={styles.modalEmptyTitle}>Niciun mesaj</Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Category Picker ── */}
      <CategoryPickerModal
        visible={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        onSelect={(type) => {
          applyDiscoverFilters({ ...discoverFilters, salonType: type });
          setShowCategoryPicker(false);
        }}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const cardShadow = {
  shadowColor: '#1E293B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  // Search bar
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#f8fafc',
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...cardShadow,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    color: '#1e293b',
    fontSize: 15,
    fontFamily: 'EuclidCircularA-Regular',
  },
  filterBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    ...Bubble.radiiSm,
    backgroundColor: 'rgba(15,23,42,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: Colors.primary,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: FontFamily.bold,
    lineHeight: 11,
  },
  searchDropdown: {
    marginTop: 4,
    backgroundColor: '#fff',
    ...cardShadow,
    overflow: 'hidden',
  },
  searchDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchDropdownDivider: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  searchDropdownAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: '#eff6ff',
  },
  avatarImg: {
    width: 36,
    height: 36,
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchDropdownInfo: {
    flex: 1,
  },
  searchDropdownName: {
    color: '#1e293b',
    fontSize: 14,
    fontFamily: FontFamily.semiBold,
  },
  searchDropdownSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  searchDropdownDist: {
    color: '#94a3b8',
    fontSize: 12,
    marginLeft: 8,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitial: {
    color: '#2563eb',
    fontFamily: FontFamily.bold,
    fontSize: 16,
  },
  greetingSub: {
    color: '#94a3b8',
    fontSize: 12,
  },
  greetingName: {
    color: '#1e293b',
    fontSize: 18,
    fontFamily: FontFamily.bold,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    ...Bubble.radiiSm,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Urgency
  urgencyCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
    ...cardShadow,
  },
  urgencyCardActive: {
    backgroundColor: '#f0fdf4',
  },
  urgencyIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
  },
  urgencyIconDefault: {
    backgroundColor: '#0a85f4',
  },
  urgencyIconActive: {
    backgroundColor: '#10b981',
  },
  urgencyText: {
    flex: 1,
  },
  urgencyTitle: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: '#1e293b',
  },
  urgencyTitleActive: {
    color: '#065f46',
  },
  urgencySub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  urgencySubActive: {
    color: '#10b981',
  },
  urgencyClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sections
  sectionPad: {
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#1e293b',
    fontSize: 15,
    fontFamily: FontFamily.bold,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionAction: {
    color: Colors.primary,
    fontSize: 12,
    fontFamily: FontFamily.semiBold,
  },
  sectionCount: {
    color: '#94a3b8',
    fontSize: 14,
    fontFamily: FontFamily.regular,
  },
  horizontalList: {
    paddingHorizontal: 20,
    gap: 10,
  },
  cardList: {
    gap: 12,
  },

  // Happy hour card
  hhCard: {
    width: 170,
    backgroundColor: '#fff',
    overflow: 'hidden',
    ...cardShadow,
  },
  hhImageContainer: {
    height: 85,
    backgroundColor: '#f1f5f9',
    position: 'relative',
  },
  hhImage: {
    width: '100%',
    height: '100%',
  },
  hhImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  hhBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hhBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: FontFamily.bold,
  },
  hhInfo: {
    padding: 10,
  },
  hhName: {
    color: '#1e293b',
    fontSize: 13,
    fontFamily: FontFamily.bold,
  },
  hhMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    color: '#64748b',
    fontSize: 10,
    marginLeft: 2,
  },

  // Favorite card
  favCard: {
    width: 140,
    backgroundColor: '#EEF4FF',
    overflow: 'hidden',
    ...cardShadow,
  },
  favImageContainer: {
    height: 75,
    position: 'relative',
  },
  favImage: {
    width: '100%',
    height: '100%',
  },
  heartBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favName: {
    color: '#1e293b',
    fontSize: 12,
    fontFamily: FontFamily.bold,
  },
  favAccent: {
    height: 3,
    backgroundColor: 'rgba(10,102,194,0.35)',
  },

  // Empty states
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#1e293b',
    fontFamily: FontFamily.bold,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySub: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyCardState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
    ...cardShadow,
  },
  emptyCardTitle: {
    color: '#475569',
    fontFamily: FontFamily.semiBold,
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  resetBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  resetBtnText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
  },

  // Modals
  modalSafe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    color: '#1e293b',
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
  modalCloseX: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalEmptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modalEmptyTitle: {
    color: '#1e293b',
    fontFamily: FontFamily.bold,
    fontSize: 16,
    textAlign: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  modalCloseBtnText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
  },
});
