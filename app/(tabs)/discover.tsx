import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  Platform,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";
import { useTutorialStore } from "@/stores/tutorialStore";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useLocationStore } from "@/stores/locationStore";
import { Salon, SalonType, AppointmentWithDetails, SalonHappyHour } from "@/types/database";
import { CategoryPickerModal } from "@/components/discover/CategoryPickerModal";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from "react-native-maps";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { enrichSalons, SalonWithDistance } from "@/lib/discover";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { UpcomingAppointmentBanner } from "@/components/home/UpcomingAppointmentBanner";
import { Bubble, Brand } from "@/constants/theme";
import { DiscoverSalonCard } from "@/components/discover/DiscoverSalonCard";

const bubbleRadii = Bubble.radii;
const bubbleRadiiSm = Bubble.radiiSm;
const cardShadow = Platform.select({
  ios: {
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
  },
  android: { elevation: 3 },
}) as any;

export default function DiscoverScreen() {
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuthStore();
  const queryClient = useQueryClient();
  const { latitude, longitude, requestLocation, isLoading: locationLoading } = useLocationStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSalon, setSelectedSalon] = useState<SalonWithDistance | null>(null);
  const [filterAvailableNow, setFilterAvailableNow] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<SalonType | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const { isOverlayVisible: isTutorialActive } = useTutorialStore();

  // Tutorial refs
  const { registerRef, unregisterRef } = useTutorialContext();
  const tutorialSearchRef = useRef<View>(null);
  const tutorialFilterAvailableRef = useRef<View>(null);
  const tutorialCategoryChipRef = useRef<View>(null);
  const tutorialFavoritesToggleRef = useRef<View>(null);
  const tutorialSalonCardRef = useRef<View>(null);

  useEffect(() => {
    if (!isTutorialActive) {
      setShowCategoryPicker(true);
    }
  }, []);

  useEffect(() => {
    registerRef("discover-search", tutorialSearchRef);
    registerRef("discover-filter-available", tutorialFilterAvailableRef);
    registerRef("discover-category-chip", tutorialCategoryChipRef);
    registerRef("discover-favorites-toggle", tutorialFavoritesToggleRef);
    registerRef("discover-salon-card", tutorialSalonCardRef);
    return () => {
      unregisterRef("discover-search");
      unregisterRef("discover-filter-available");
      unregisterRef("discover-category-chip");
      unregisterRef("discover-favorites-toggle");
      unregisterRef("discover-salon-card");
    };
  }, [registerRef, unregisterRef]);

  const snapPoints = useMemo(() => ["32%", "60%", "92%"], []);

  // Request location on mount
  useEffect(() => {
    requestLocation();
  }, []);

  // Fetch salons from our DB
  const { data: salonsList, isLoading: salonsLoading } = useQuery({
    queryKey: ["salons-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salons")
        .select("*")
        .eq("active", true)
        .not("latitude", "is", null)
        .order("name");
      if (error) throw error;
      return data as Salon[];
    },
  });

  // Fetch user favorites
  const { data: favorites } = useQuery({
    queryKey: ["salon-favorites", session?.user.id],
    queryFn: async () => {
      if (!session) return [];
      const { data, error } = await supabase
        .from("salon_favorites")
        .select("salon_id")
        .eq("user_id", session.user.id);
      if (error) throw error;
      return data.map((f: any) => f.salon_id) as string[];
    },
    enabled: !!session,
  });

  // Fetch active happy hours
  const { data: happyHours } = useQuery({
    queryKey: ["happy-hours-active"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("salon_happy_hours")
        .select("*")
        .eq("active", true)
        .lte("starts_at", now)
        .gte("ends_at", now);
      if (error) throw error;
      return data as SalonHappyHour[];
    },
    refetchInterval: 60000, // refresh every minute
  });

  // Fetch barber availability grouped by salon_id
  const { data: availabilityData } = useQuery({
    queryKey: ["barber-availability-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_availability")
        .select("barber_id, day_of_week, start_time, end_time, is_available, barber:barbers!inner(salon_id)")
        .eq("is_available", true);
      if (error) throw error;
      return data as { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean; barber: { salon_id: string | null } }[];
    },
    refetchInterval: 60000, // refresh every minute
  });

  // Fetch today's appointments for all barbers (for real availability check)
  const { data: todayAppointments } = useQuery({
    queryKey: ["today-appointments-all"],
    queryFn: async () => {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("appointments")
        .select("barber_id, scheduled_at, duration_min")
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", startOfDay.toISOString())
        .lte("scheduled_at", endOfDay.toISOString());
      if (error) throw error;
      return data as { barber_id: string; scheduled_at: string; duration_min: number }[];
    },
    refetchInterval: 60000, // refresh every minute like availability
  });

  // Fetch service prices for all salons (for price range display)
  const { data: servicePricesData } = useQuery({
    queryKey: ["salon-price-ranges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("salon_id, price_cents")
        .eq("active", true)
        .not("salon_id", "is", null);
      if (error) throw error;
      return data as { salon_id: string; price_cents: number }[];
    },
    staleTime: 5 * 60 * 1000, // prices don't change often
  });

  // Fetch salon photos for card carousels
  const { data: salonPhotosData } = useQuery({
    queryKey: ["salon-photos-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_photos")
        .select("salon_id, photo_url, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as { salon_id: string; photo_url: string; sort_order: number }[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch upcoming appointments
  const { data: appointments } = useQuery({
    queryKey: ["appointments-upcoming", session?.user.id],
    queryFn: async () => {
      if (!session) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select(`*, barber:barbers(*), service:barber_services(*)`)
        .eq("user_id", session.user.id)
        .gte("scheduled_at", new Date().toISOString())
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: true })
        .limit(3);
      if (error) throw error;
      return data as AppointmentWithDetails[];
    },
    enabled: !!session,
  });

  // Build availability map keyed by salon_id (entries include barber_id for cross-reference)
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

  // Build barber appointments map keyed by barber_id (for real availability cross-reference)
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

  // Build salon photos map keyed by salon_id
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

  // Build price range map keyed by salon_id
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

  // Enrich salons with computed fields
  const salons = useMemo(() => {
    if (!salonsList) return [];
    const favSet = new Set(favorites || []);
    return enrichSalons(salonsList, latitude, longitude, favSet, happyHours || [], availabilityMap, barberAppointmentsMap, priceRangeMap);
  }, [salonsList, latitude, longitude, favorites, happyHours, availabilityMap, barberAppointmentsMap, priceRangeMap]);

  // Sort and filter salons - search our DB only
  const sortedSalons = useMemo(() => {
    let filtered = [...salons];

    // Filter favorites only
    if (showFavoritesOnly) {
      filtered = filtered.filter((s) => s.is_favorite);
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((s) => s.salon_types?.includes(selectedCategory));
    }

    // Filter by search query against our own salon data
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

    // Filter available now
    if (filterAvailableNow) {
      filtered = filtered.filter(
        (s) => s.is_available_now && (s.distance_km == null || s.distance_km <= 5)
      );
    }

    // Sort by distance
    filtered.sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });

    return filtered;
  }, [salons, searchQuery, filterAvailableNow, selectedCategory]);

  const availableNowCount = useMemo(
    () => salons.filter((s) => s.is_available_now && (s.distance_km == null || s.distance_km <= 5)).length,
    [salons]
  );

  const availableBarberCount = useMemo(() => {
    if (!availabilityData || !todayAppointments) return 0;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const nowMs = now.getTime();
    const sixtyMinLater = nowMs + 60 * 60 * 1000;

    // Count barbers who have schedule now AND at least one free slot
    let count = 0;
    const seen = new Set<string>();

    for (const a of availabilityData) {
      if (seen.has(a.barber_id)) continue;
      if (a.day_of_week !== dayOfWeek || !a.is_available) continue;
      if (currentTime < a.start_time || currentTime >= a.end_time) continue;

      // Check this barber has a free slot
      const appointments = todayAppointments.filter((apt) => apt.barber_id === a.barber_id);
      const [endH, endM] = a.end_time.split(":").map(Number);
      const barberEnd = new Date(now);
      barberEnd.setHours(endH, endM, 0, 0);
      const windowEnd = Math.min(sixtyMinLater, barberEnd.getTime());

      let hasFreeSlot = false;
      for (let slotStart = nowMs; slotStart + 30 * 60 * 1000 <= windowEnd; slotStart += 15 * 60 * 1000) {
        const slotEnd = slotStart + 30 * 60 * 1000;
        const conflict = appointments.some((apt) => {
          const aptStart = new Date(apt.scheduled_at).getTime();
          const aptEnd = aptStart + apt.duration_min * 60 * 1000;
          return slotStart < aptEnd && slotEnd > aptStart;
        });
        if (!conflict) {
          hasFreeSlot = true;
          break;
        }
      }

      if (hasFreeSlot) {
        seen.add(a.barber_id);
        count++;
      }
    }
    return count;
  }, [availabilityData, todayAppointments]);

  // Sections
  const happyHourSalons = useMemo(
    () => salons.filter((s) => s.has_happy_hour && (!selectedCategory || s.salon_types?.includes(selectedCategory))),
    [salons, selectedCategory]
  );
  const recommendedSalons = useMemo(
    () => [...salons]
      .filter((s) => !selectedCategory || s.salon_types?.includes(selectedCategory))
      .sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))
      .slice(0, 4),
    [salons, selectedCategory]
  );
  const favoriteSalons = useMemo(
    () => salons.filter((s) => s.is_favorite && (!selectedCategory || s.salon_types?.includes(selectedCategory))).slice(0, 4),
    [salons, selectedCategory]
  );

  // Search only our DB salons - no external API
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
  };

  // Animate to salon on map when selected from search results
  const handleSalonSearchSelect = (salon: SalonWithDistance) => {
    Keyboard.dismiss();
    setSearchQuery(salon.name);
    setSelectedSalon(salon);

    if (salon.latitude && salon.longitude && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: salon.latitude,
          longitude: salon.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        800
      );
    }
    bottomSheetRef.current?.snapToIndex(0);
  };

  const handleMarkerPress = (salon: SalonWithDistance) => {
    setSelectedSalon(salon);
    if (salon.latitude != null && salon.longitude != null) {
      mapRef.current?.animateToRegion({
        latitude: salon.latitude,
        longitude: salon.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 300);
    }
    bottomSheetRef.current?.snapToIndex(1);
  };

  const goToMyLocation = useCallback(() => {
    if (latitude && longitude && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        800
      );
    }
  }, [latitude, longitude]);

  const urgencyDebounceRef = useRef(false);
  const handleUrgencyPress = () => {
    if (urgencyDebounceRef.current) return;
    urgencyDebounceRef.current = true;
    setTimeout(() => { urgencyDebounceRef.current = false; }, 400);

    const next = !filterAvailableNow;
    setFilterAvailableNow(next);
    if (next) {
      setShowFavoritesOnly(false);
      bottomSheetRef.current?.snapToIndex(1);
    }
  };

  const h = new Date().getHours();
  const greeting = h < 12 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";

  const nextAppointment = appointments?.[0];

  // Show search dropdown only when typing and results exist
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

  return (
    <View className="flex-1 bg-dark-200">
      <StatusBar style="dark" />
      {/* Map — extends behind status bar */}
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
            initialRegion={{
              latitude: latitude ?? 44.4268,
              longitude: longitude ?? 26.1025,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
            showsUserLocation
            showsMyLocationButton={false}
            mapPadding={{ top: 70, right: 0, bottom: SCREEN_HEIGHT * 0.32, left: 0 }}
          >
            {sortedSalons
              .filter((salon) => salon.latitude != null && salon.longitude != null)
              .map((salon) => (
              <Marker
                key={salon.id}
                coordinate={{
                  latitude: salon.latitude as number,
                  longitude: salon.longitude as number,
                }}
                tracksViewChanges={false}
                onPress={() => handleMarkerPress(salon)}
              >
                <View className="items-center">
                  <View className="relative">
                    <View
                      className={`w-11 h-11 items-center justify-center ${
                        selectedSalon?.id === salon.id
                          ? "bg-primary-500"
                          : salon.is_available_now
                          ? "bg-white border-2 border-primary-300"
                          : "bg-white border-2 border-dark-300"
                      }`}
                      style={{
                        ...Bubble.radiiSm,
                        transform: selectedSalon?.id === salon.id ? [{ scale: 1.15 }] : [],
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        elevation: 4,
                      }}
                    >
                      <Ionicons
                        name="cut"
                        size={20}
                        color={selectedSalon?.id === salon.id ? "white" : "#0a85f4"}
                      />
                    </View>
                    {salon.is_available_now && (
                      <View className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                    )}
                  </View>
                </View>
              </Marker>
            ))}
          </MapView>

          {/* Search Bar Overlay */}
          <View className="absolute left-4 right-4 z-10" style={{ top: insets.top + 8 }}>
            <View
              ref={tutorialSearchRef}
              className="flex-row items-center bg-white px-4 py-3"
              style={{ ...bubbleRadii, ...cardShadow }}
            >
              <Ionicons name="search" size={20} color="#94a3b8" />
              <TextInput
                className="flex-1 ml-3 text-dark-700 text-[15px]"
                placeholder="Caută salon, zonă, serviciu..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={handleSearchChange}
                style={{ fontFamily: 'EuclidCircularA-Regular' }}
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => {
                    setSearchQuery("");
                    setFilterAvailableNow(false);
                    setShowFavoritesOnly(false);
                    Keyboard.dismiss();
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#94a3b8" />
                </Pressable>
              )}
              {/* Filter button */}
              <Pressable
                style={{
                  marginLeft: 8,
                  width: 36,
                  height: 36,
                  ...Bubble.radiiSm,
                  backgroundColor: filterAvailableNow ? "#0A66C2" : "#f1f5f9",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => setFilterAvailableNow(!filterAvailableNow)}
              >
                <Ionicons
                  name="options"
                  size={18}
                  color={filterAvailableNow ? "white" : "#64748b"}
                />
              </Pressable>
            </View>

            {/* Search Results Dropdown - our DB salons only */}
            {showSearchDropdown && (
              <View
                className="mt-1 bg-white overflow-hidden"
                style={{ ...bubbleRadii, ...cardShadow }}
              >
                {searchResultsSalons.map((salon, idx) => (
                  <Pressable
                    key={salon.id}
                    className={`flex-row items-center px-4 py-3 active:bg-dark-100 ${
                      idx > 0 ? "border-t border-dark-100" : ""
                    }`}
                    onPress={() => handleSalonSearchSelect(salon)}
                  >
                    <View className="w-9 h-9 rounded-lg overflow-hidden bg-primary-50 mr-3">
                      {salon.avatar_url ? (
                        <Image source={{ uri: salon.avatar_url }} className="w-full h-full" resizeMode="cover" />
                      ) : (
                        <View className="w-full h-full items-center justify-center">
                          <Ionicons name="cut" size={16} color="#0a85f4" />
                        </View>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-dark-700 text-sm font-medium" numberOfLines={1}>
                        {salon.name}
                      </Text>
                      <View className="flex-row items-center gap-2 mt-0.5">
                        {salon.rating_avg != null && (
                          <View className="flex-row items-center">
                            <Ionicons name="star" size={10} color="#f59e0b" />
                            <Text className="text-dark-500 text-[10px] ml-0.5">{salon.rating_avg.toFixed(1)}</Text>
                          </View>
                        )}
                        <Text className="text-dark-400 text-xs" numberOfLines={1}>
                          {salon.address || salon.city}
                        </Text>
                      </View>
                    </View>
                    {salon.distance_km != null && (
                      <Text className="text-dark-400 text-xs ml-2">
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

          {/* My Location Button */}
          <Pressable
            onPress={goToMyLocation}
            className="absolute right-4 bg-white rounded-full w-11 h-11 items-center justify-center"
            style={{
              bottom: SCREEN_HEIGHT * 0.34,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            {locationLoading ? (
              <ActivityIndicator size="small" color="#0a85f4" />
            ) : (
              <Ionicons name="navigate" size={20} color="#0a85f4" />
            )}
          </Pressable>
        </View>

        {/* Bottom Sheet */}
        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          snapPoints={snapPoints}
          backgroundStyle={{ borderTopLeftRadius: 30, borderTopRightRadius: 14, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, backgroundColor: "#f8fafc" }}
          handleIndicatorStyle={{ backgroundColor: "#cbd5e1", width: 40 }}
          enableDynamicSizing={false}
        >
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Selected Salon Mini-Card ── */}
            {selectedSalon && (
              <View className="mx-5 mb-4 mt-1">
                <Pressable
                  className="bg-white active:bg-dark-100"
                  style={{ ...bubbleRadii, ...cardShadow }}
                  onPress={() => router.push(`/salon/${selectedSalon.id}` as any)}
                >
                  <View className="flex-row items-center p-4">
                    <View className="w-14 h-14 overflow-hidden bg-dark-200 mr-3" style={bubbleRadiiSm}>
                      {selectedSalon.avatar_url ? (
                        <Image source={{ uri: selectedSalon.avatar_url }} className="w-full h-full" resizeMode="cover" />
                      ) : (
                        <View className="w-full h-full items-center justify-center bg-primary-50">
                          <Ionicons name="cut" size={22} color="#0a85f4" />
                        </View>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-dark-700 font-bold text-[15px]" numberOfLines={1}>
                        {selectedSalon.name}
                      </Text>
                      <View className="flex-row items-center gap-2 mt-0.5">
                        {selectedSalon.rating_avg != null && (
                          <View className="flex-row items-center">
                            <Ionicons name="star" size={11} color="#f59e0b" />
                            <Text className="text-dark-500 text-xs ml-0.5">{selectedSalon.rating_avg.toFixed(1)}</Text>
                          </View>
                        )}
                        {selectedSalon.distance_km != null && (
                          <Text className="text-dark-400 text-xs">
                            {selectedSalon.distance_km < 1
                              ? `${Math.round(selectedSalon.distance_km * 1000)}m`
                              : `${selectedSalon.distance_km.toFixed(1)}km`}
                          </Text>
                        )}
                        {selectedSalon.is_available_now && (
                          <View className="flex-row items-center gap-1">
                            <View className="w-2 h-2 rounded-full bg-emerald-400" />
                            <Text className="text-emerald-600 text-xs">Liber acum</Text>
                          </View>
                        )}
                      </View>
                      {(selectedSalon.city || selectedSalon.address) && (
                        <Text className="text-dark-400 text-xs mt-0.5" numberOfLines={1}>
                          {selectedSalon.address || selectedSalon.city}
                        </Text>
                      )}
                    </View>
                    <View className="items-end ml-2 gap-1">
                      {selectedSalon.price_range_label && (
                        <Text className="text-primary-500 text-sm font-bold">{selectedSalon.price_range_label}</Text>
                      )}
                      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                    </View>
                  </View>
                  <View className="flex-row border-t border-dark-100">
                    <Pressable
                      className="flex-1 flex-row items-center justify-center py-2.5 active:bg-dark-100"
                      onPress={() => router.push(`/book-appointment?salonId=${selectedSalon.id}` as any)}
                    >
                      <Ionicons name="calendar-outline" size={14} color="#0a85f4" />
                      <Text className="text-primary-500 text-xs font-semibold ml-1">Programează</Text>
                    </Pressable>
                    <View className="w-[1px] bg-dark-100" />
                    <Pressable
                      className="flex-1 flex-row items-center justify-center py-2.5 active:bg-dark-100"
                      onPress={() => setSelectedSalon(null)}
                    >
                      <Ionicons name="close-outline" size={14} color="#64748b" />
                      <Text className="text-dark-500 text-xs font-semibold ml-1">Închide</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </View>
            )}

            {/* ── Header ── */}
            <View className="px-5 pb-4 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center mr-3">
                  <Text className="text-primary-600 font-bold text-base">
                    {(profile?.display_name || profile?.username || "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text className="text-dark-400 text-xs">{greeting},</Text>
                  <Text className="text-dark-700 text-lg font-bold">
                    {profile?.display_name || profile?.username || "Bun venit"}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  style={{
                    height: 38,
                    paddingHorizontal: 12,
                    ...Bubble.radiiSm,
                    ...Bubble.accent,
                    backgroundColor: "rgba(255,255,255,0.65)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.9)",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                  onPress={() => router.push({ pathname: "/tryon" as any, params: { salonType: selectedCategory || "barbershop" } })}
                >
                  <Text style={{ fontFamily: "EuclidCircularA-Bold", fontSize: 14, lineHeight: 18, color: "#555" }}>Frizură</Text>
                  <Image source={require('@/assets/ai-icon.png')} style={{ width: 24, height: 24, marginTop: -3 }} resizeMode="contain" />
                </Pressable>
                <Pressable
                  style={{
                    width: 38,
                    height: 38,
                    ...Bubble.radiiSm,
                    ...Bubble.accent,
                    backgroundColor: "rgba(255,255,255,0.65)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.9)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onPress={() => setShowChat(true)}
                >
                  <Ionicons name="chatbubble-outline" size={17} color="#191919" />
                </Pressable>
                <Pressable
                  style={{
                    width: 38,
                    height: 38,
                    ...Bubble.radiiSm,
                    ...Bubble.accent,
                    backgroundColor: "rgba(255,255,255,0.65)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.9)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onPress={() => setShowNotifications(true)}
                >
                  <Ionicons name="notifications-outline" size={17} color="#191919" />
                </Pressable>
              </View>
            </View>

            {/* ── Urgency ── */}
            <Pressable
              ref={tutorialFilterAvailableRef}
              onPress={handleUrgencyPress}
              className={`mx-5 mb-5 flex-row items-center p-3.5 active:scale-[0.98] ${
                filterAvailableNow ? "bg-emerald-50" : "bg-white"
              }`}
              style={{ ...bubbleRadii, ...cardShadow }}
            >
              <View
                className={`w-10 h-10 items-center justify-center mr-3 ${
                  filterAvailableNow ? "bg-emerald-500" : "bg-primary-500"
                }`}
                style={{
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 7,
                  borderBottomRightRadius: 14,
                  borderBottomLeftRadius: 14,
                }}
              >
                <Ionicons
                  name={filterAvailableNow ? "checkmark-circle" : "flash"}
                  size={20}
                  color="white"
                />
              </View>
              <View className="flex-1">
                <Text className={`text-[14px] ${filterAvailableNow ? "text-emerald-700" : "text-dark-700"}`} style={{ fontFamily: 'EuclidCircularA-Bold' }}>
                  {filterAvailableNow ? `${sortedSalons.length} saloane · ${availableBarberCount} frizeri liberi` : "Cine e liber acum?"}
                </Text>
                <Text className={`text-xs mt-0.5 ${filterAvailableNow ? "text-emerald-500" : "text-dark-400"}`} style={{ fontFamily: 'EuclidCircularA-Regular' }}>
                  {filterAvailableNow
                    ? "Apasă pentru a vedea toate"
                    : availableNowCount > 0
                      ? `${availableNowCount} disponibile · rază 5 km`
                      : "Niciun salon disponibil acum"}
                </Text>
              </View>
              {filterAvailableNow ? (
                <View className="w-8 h-8 rounded-full bg-emerald-100 items-center justify-center">
                  <Ionicons name="close" size={16} color="#059669" />
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              )}
            </Pressable>

            {/* ── Category Filter Chip ── */}
            {selectedCategory && (
              <View ref={tutorialCategoryChipRef} className="mx-5 mb-4 flex-row items-center">
                <View
                  className="flex-row items-center bg-primary-50 px-4 py-2.5 border border-primary-200"
                  style={bubbleRadiiSm}
                >
                  <Ionicons
                    name={selectedCategory === "barbershop" ? "cut" : "sparkles"}
                    size={16}
                    color={Brand.primary}
                  />
                  <Text className="text-primary-700 font-semibold text-sm ml-2">
                    {selectedCategory === "barbershop" ? "Barbershop" : "Coafor"}
                  </Text>
                  <Pressable
                    onPress={() => setSelectedCategory(null)}
                    className="ml-2 w-6 h-6 rounded-full bg-primary-100 items-center justify-center"
                  >
                    <Ionicons name="close" size={14} color={Brand.primary} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── Next Appointment ── */}
            {nextAppointment && (
              <View className="px-5 mb-4">
                <UpcomingAppointmentBanner
                  appointment={nextAppointment}
                  onPress={() => router.push("/appointments" as any)}
                />
              </View>
            )}

            {/* ── Happy Hour ── */}
            {happyHourSalons.length > 0 && (
              <View className="mb-5">
                <Text className="text-dark-700 font-bold text-[15px] px-5 mb-3">
                  Happy Hour — Oferte Active
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
                >
                  {happyHourSalons.map((salon) => (
                    <Pressable
                      key={salon.id}
                      className="bg-white w-[170px] overflow-hidden active:bg-dark-100"
                      style={{ ...bubbleRadiiSm, ...cardShadow }}
                      onPress={() => router.push(`/salon/${salon.id}` as any)}
                    >
                      <View className="h-[85px] bg-dark-200 relative">
                        {salon.cover_url || salon.avatar_url ? (
                          <Image source={{ uri: salon.cover_url || salon.avatar_url! }} className="w-full h-full" resizeMode="cover" />
                        ) : (
                          <View className="w-full h-full items-center justify-center bg-primary-50">
                            <Ionicons name="cut" size={22} color="#0a85f4" />
                          </View>
                        )}
                        {salon.happy_hour_discount != null && (
                          <View className="absolute top-2 left-2 bg-amber-500 px-2 py-0.5 rounded-md">
                            <Text className="text-white text-[10px] font-bold">-{salon.happy_hour_discount}%</Text>
                          </View>
                        )}
                      </View>
                      <View className="p-2.5">
                        <Text className="text-dark-700 font-bold text-[13px]" numberOfLines={1}>{salon.name}</Text>
                        <View className="flex-row items-center mt-1 gap-2">
                          {salon.rating_avg != null && (
                            <View className="flex-row items-center">
                              <Ionicons name="star" size={10} color="#f59e0b" />
                              <Text className="text-dark-500 text-[10px] ml-0.5">{salon.rating_avg.toFixed(1)}</Text>
                            </View>
                          )}
                          {salon.distance_km != null && (
                            <Text className="text-dark-400 text-[10px]">
                              {salon.distance_km < 1
                                ? `${Math.round(salon.distance_km * 1000 / 50) * 50} m`
                                : salon.distance_km < 10
                                  ? `${salon.distance_km.toFixed(1)} km`
                                  : `${Math.round(salon.distance_km)} km`}
                            </Text>
                          )}
                          {salon.happy_hour_ends_at && <CountdownTimer endsAt={salon.happy_hour_ends_at} />}
                        </View>
                        {salon.price_range_label && (
                          <Text className="text-primary-500 text-[10px] font-semibold mt-0.5">{salon.price_range_label}</Text>
                        )}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Favorite ── */}
            {favoriteSalons.length > 0 && (
              <View className="mb-5">
                <View className="flex-row items-center justify-between px-5 mb-3">
                  <Text className="text-dark-700 text-[15px]" style={{ fontFamily: 'EuclidCircularA-Bold' }}>Favorite</Text>
                  <Pressable
                    ref={tutorialFavoritesToggleRef}
                    onPress={() => {
                      setShowFavoritesOnly(true);
                      setFilterAvailableNow(false);
                      setSelectedCategory(null);
                      bottomSheetRef.current?.snapToIndex(2);
                    }}
                  >
                    <Text className="text-primary-500 text-xs" style={{ fontFamily: 'EuclidCircularA-SemiBold' }}>Vezi toate</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
                >
                  {favoriteSalons.map((salon) => (
                    <Pressable
                      key={salon.id}
                      className="w-[140px] overflow-hidden active:bg-dark-100"
                      style={{ ...bubbleRadiiSm, ...cardShadow, backgroundColor: '#EEF4FF' }}
                      onPress={() => router.push(`/salon/${salon.id}` as any)}
                    >
                      <View className="h-[75px] bg-dark-200 relative">
                        {salon.cover_url || salon.avatar_url ? (
                          <Image source={{ uri: salon.cover_url || salon.avatar_url! }} className="w-full h-full" resizeMode="cover" />
                        ) : (
                          <View className="w-full h-full items-center justify-center bg-primary-50">
                            <Ionicons name="cut" size={20} color="#0a85f4" />
                          </View>
                        )}
                        <View
                          className="absolute top-2 right-2 w-7 h-7 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: '#FEF2F2',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.12,
                            shadowRadius: 3,
                            elevation: 2,
                          }}
                        >
                          <Ionicons name="heart" size={15} color="#ef4444" />
                        </View>
                      </View>
                      <View className="p-2.5">
                        <Text className="text-dark-700 font-bold text-[12px]" numberOfLines={1}>{salon.name}</Text>
                        <View className="flex-row items-center mt-0.5 gap-1.5">
                          {salon.rating_avg != null && (
                            <View className="flex-row items-center">
                              <Ionicons name="star" size={9} color="#f59e0b" />
                              <Text className="text-dark-500 text-[10px] ml-0.5">{salon.rating_avg.toFixed(1)}</Text>
                            </View>
                          )}
                          {salon.distance_km != null && (
                            <Text className="text-dark-400 text-[10px]">
                              {salon.distance_km < 1
                                ? `${Math.round(salon.distance_km * 1000 / 50) * 50} m`
                                : salon.distance_km < 10
                                  ? `${salon.distance_km.toFixed(1)} km`
                                  : `${Math.round(salon.distance_km)} km`}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={{ height: 3, backgroundColor: 'rgba(10, 102, 194, 0.35)' }} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Recomandate ── */}
            {recommendedSalons.length > 0 && (
              <View className="mb-5">
                <Text className="text-dark-700 text-[15px] px-5 mb-3" style={{ fontFamily: 'EuclidCircularA-Bold' }}>Recomandate</Text>
                <View className="px-5">
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

            {/* ── All Salons ── */}
            <View className="px-5">
              <Text className="text-dark-700 text-[15px] mb-3" style={{ fontFamily: 'EuclidCircularA-Bold' }}>
                {showFavoritesOnly
                  ? "Favorite"
                  : selectedCategory
                  ? selectedCategory === "barbershop" ? "Barbershop-uri" : "Coafuri"
                  : filterAvailableNow ? "Disponibile acum" : "Toate saloanele"}
                <Text className="text-dark-400 text-sm" style={{ fontFamily: 'EuclidCircularA-Regular' }}>
                  {sortedSalons.length > 0 ? ` · ${sortedSalons.length}` : ""}
                </Text>
              </Text>

              {salonsLoading ? (
                <ActivityIndicator size="large" color="#0a85f4" className="my-8" />
              ) : sortedSalons.length > 0 ? (
                <View className="gap-3">
                  {sortedSalons.map((salon, index) => (
                    <DiscoverSalonCard
                      key={salon.id}
                      ref={index === 0 ? tutorialSalonCardRef : undefined}
                      salon={salon}
                      photos={salonPhotosMap.get(salon.id)}
                    />
                  ))}
                </View>
              ) : filterAvailableNow ? (
                <View className="items-center justify-center py-12 px-8">
                  <View className="w-16 h-16 rounded-full bg-dark-100 items-center justify-center mb-4">
                    <Ionicons name="time-outline" size={32} color="#94a3b8" />
                  </View>
                  <Text className="text-dark-700 font-bold text-base text-center mb-1">
                    Niciun salon disponibil acum
                  </Text>
                  <Text className="text-dark-400 text-sm text-center">
                    Încearcă din nou mai târziu sau mărește raza de căutare
                  </Text>
                </View>
              ) : (
                <View className="items-center py-10 bg-white" style={{ ...bubbleRadii, ...cardShadow }}>
                  <Ionicons name="search-outline" size={40} color="#cbd5e1" />
                  <Text className="text-dark-600 font-semibold mt-3 text-center text-sm">
                    Niciun rezultat
                  </Text>
                  {selectedCategory && (
                    <Pressable
                      className="mt-3 bg-primary-500 px-5 py-2"
                      style={bubbleRadiiSm}
                      onPress={() => {
                        setFilterAvailableNow(false);
                        setSelectedCategory(null);
                        setShowFavoritesOnly(false);
                      }}
                    >
                      <Text className="text-white font-semibold text-sm">Arată toate saloanele</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

          </BottomSheetScrollView>
        </BottomSheet>

      {/* ── Notifications Modal ── */}
      <Modal
        visible={showNotifications}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNotifications(false)}
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-100">
            <Text className="text-dark-700 font-bold text-lg">Notificări</Text>
            <Pressable
              onPress={() => setShowNotifications(false)}
              className="w-8 h-8 rounded-full bg-dark-100 items-center justify-center"
            >
              <Ionicons name="close" size={18} color="#64748b" />
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center px-8">
            <View className="w-20 h-20 rounded-full bg-dark-100 items-center justify-center mb-5">
              <Ionicons name="notifications-outline" size={36} color="#cbd5e1" />
            </View>
            <Text className="text-dark-700 font-bold text-base text-center">
              Nicio notificare
            </Text>
            <Text className="text-dark-400 text-sm text-center mt-2 leading-5">
              Vei primi notificări despre programările tale, oferte speciale și noutăți de la saloanele preferate.
            </Text>
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
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-100">
            <Text className="text-dark-700 font-bold text-lg">Mesaje</Text>
            <Pressable
              onPress={() => setShowChat(false)}
              className="w-8 h-8 rounded-full bg-dark-100 items-center justify-center"
            >
              <Ionicons name="close" size={18} color="#64748b" />
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center px-8">
            <View className="w-20 h-20 rounded-full bg-dark-100 items-center justify-center mb-5">
              <Ionicons name="chatbubbles-outline" size={36} color="#cbd5e1" />
            </View>
            <Text className="text-dark-700 font-bold text-base text-center">
              Niciun mesaj
            </Text>
            <Text className="text-dark-400 text-sm text-center mt-2 leading-5">
              Aici vei putea comunica direct cu saloanele tale preferate pentru programări și întrebări.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Category Picker Modal ── */}
      <CategoryPickerModal
        visible={showCategoryPicker && !isTutorialActive}
        onClose={() => setShowCategoryPicker(false)}
        onSelect={(type) => {
          setSelectedCategory(type);
          setShowCategoryPicker(false);
          bottomSheetRef.current?.snapToIndex(1);
        }}
      />
    </View>
  );
}

