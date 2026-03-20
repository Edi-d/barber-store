import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
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
import { Bubble, Brand } from "@/constants/theme";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  const { session, profile } = useAuthStore();
  const { latitude, longitude, requestLocation, isLoading: locationLoading } = useLocationStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSalon, setSelectedSalon] = useState<SalonWithDistance | null>(null);
  const [filterAvailableNow, setFilterAvailableNow] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<SalonType | null>(null);

  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

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

  // Build availability map keyed by salon_id
  const availabilityMap = useMemo(() => {
    const map = new Map<string, { day_of_week: number; start_time: string; end_time: string; is_available: boolean }[]>();
    if (!availabilityData) return map;
    for (const a of availabilityData) {
      const salonId = a.barber?.salon_id;
      if (!salonId) continue;
      const list = map.get(salonId) || [];
      list.push(a);
      map.set(salonId, list);
    }
    return map;
  }, [availabilityData]);

  // Enrich salons with computed fields
  const salons = useMemo(() => {
    if (!salonsList) return [];
    const favSet = new Set(favorites || []);
    return enrichSalons(salonsList, latitude, longitude, favSet, happyHours || [], availabilityMap);
  }, [salonsList, latitude, longitude, favorites, happyHours, availabilityMap]);

  // Sort and filter salons - search our DB only
  const sortedSalons = useMemo(() => {
    let filtered = [...salons];

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((s) => s.salon_type === selectedCategory);
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

  // Sections
  const happyHourSalons = useMemo(
    () => salons.filter((s) => s.has_happy_hour && (!selectedCategory || s.salon_type === selectedCategory)),
    [salons, selectedCategory]
  );
  const recommendedSalons = useMemo(
    () => [...salons]
      .filter((s) => !selectedCategory || s.salon_type === selectedCategory)
      .sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))
      .slice(0, 4),
    [salons, selectedCategory]
  );
  const favoriteSalons = useMemo(
    () => salons.filter((s) => s.is_favorite && (!selectedCategory || s.salon_type === selectedCategory)).slice(0, 4),
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

  const handleUrgencyPress = () => {
    const next = !filterAvailableNow;
    setFilterAvailableNow(next);
    if (next) {
      bottomSheetRef.current?.snapToIndex(1);
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Bună dimineața";
    if (h < 18) return "Bună ziua";
    return "Bună seara";
  }, []);

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
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Map */}
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
                onPress={() => handleMarkerPress(salon)}
              >
                <View className="items-center">
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
                </View>
              </Marker>
            ))}
          </MapView>

          {/* Search Bar Overlay */}
          <View className="absolute top-2 left-4 right-4 z-10">
            <View
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
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => {
                    setSearchQuery("");
                    setFilterAvailableNow(false);
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
                        {salon.distance_km < 1 ? `${Math.round(salon.distance_km * 1000)}m` : `${salon.distance_km.toFixed(1)}km`}
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
              onPress={handleUrgencyPress}
              className={`mx-5 mb-5 flex-row items-center p-3.5 active:scale-[0.98] ${
                filterAvailableNow ? "bg-emerald-50" : "bg-white"
              }`}
              style={{ ...bubbleRadii, ...cardShadow }}
            >
              <View
                className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                  filterAvailableNow ? "bg-emerald-500" : "bg-primary-500"
                }`}
              >
                <Ionicons
                  name={filterAvailableNow ? "checkmark-circle" : "flash"}
                  size={20}
                  color="white"
                />
              </View>
              <View className="flex-1">
                <Text className={`font-bold text-[14px] ${filterAvailableNow ? "text-emerald-700" : "text-dark-700"}`}>
                  {filterAvailableNow ? `${sortedSalons.length} saloane libere acum` : "Cine e liber acum?"}
                </Text>
                <Text className={`text-xs mt-0.5 ${filterAvailableNow ? "text-emerald-500" : "text-dark-400"}`}>
                  {filterAvailableNow ? "Apasă pentru a vedea toate" : "Disponibile în 60 min · rază 5 km"}
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
              <View className="mx-5 mb-4 flex-row items-center">
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
              <View className="mx-5 mb-5">
                <Text className="text-dark-700 font-bold text-[15px] mb-2">Programare viitoare</Text>
                <View className="bg-white overflow-hidden" style={{ ...bubbleRadii, ...cardShadow }}>
                  <View className="flex-row items-center p-4">
                    <View className="w-11 h-11 bg-primary-50 rounded-xl items-center justify-center mr-3">
                      <Ionicons name="calendar" size={20} color="#0a85f4" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-dark-700 font-bold text-[14px]">
                        {nextAppointment.service?.name}
                      </Text>
                      <Text className="text-dark-500 text-xs mt-0.5">
                        {(() => {
                          const d = new Date(nextAppointment.scheduled_at);
                          const isToday = d.toDateString() === new Date().toDateString();
                          const tmrw = new Date();
                          tmrw.setDate(tmrw.getDate() + 1);
                          const isTomorrow = d.toDateString() === tmrw.toDateString();
                          const dateStr = isToday ? "Astăzi" : isTomorrow ? "Mâine" : d.toLocaleDateString("ro-RO", { weekday: "short", day: "numeric", month: "short" });
                          const timeStr = d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
                          return `${dateStr} • ${timeStr}`;
                        })()}
                      </Text>
                      <Text className="text-dark-400 text-xs mt-0.5">{nextAppointment.barber?.name}</Text>
                    </View>
                  </View>
                  <View className="flex-row border-t border-dark-100">
                    <Pressable
                      className="flex-1 flex-row items-center justify-center py-3 active:bg-dark-100"
                      onPress={() => router.push("/appointments" as any)}
                    >
                      <Ionicons name="navigate-outline" size={15} color="#0a85f4" />
                      <Text className="text-primary-500 text-xs font-semibold ml-1.5">Navighează</Text>
                    </Pressable>
                    <View className="w-[1px] bg-dark-100" />
                    <Pressable
                      className="flex-1 flex-row items-center justify-center py-3 active:bg-dark-100"
                      onPress={() => router.push("/appointments" as any)}
                    >
                      <Ionicons name="close-circle-outline" size={15} color="#ef4444" />
                      <Text className="text-red-500 text-xs font-semibold ml-1.5">Anulează</Text>
                    </Pressable>
                  </View>
                </View>
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
                        <View className="absolute top-2 left-2 bg-amber-500 px-2 py-0.5 rounded-md">
                          <Text className="text-white text-[10px] font-bold">-{salon.happy_hour_discount}%</Text>
                        </View>
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
                              {salon.distance_km < 1 ? `${Math.round(salon.distance_km * 1000)}m` : `${salon.distance_km.toFixed(1)}km`}
                            </Text>
                          )}
                          {salon.happy_hour_ends_at && <CountdownTimer endsAt={salon.happy_hour_ends_at} />}
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Recomandate ── */}
            {recommendedSalons.length > 0 && (
              <View className="mb-5">
                <Text className="text-dark-700 font-bold text-[15px] px-5 mb-3">Recomandate</Text>
                <View className="px-5 gap-2.5">
                  {recommendedSalons.map((salon) => (
                    <Pressable
                      key={salon.id}
                      className="bg-white p-4 active:bg-dark-100"
                      style={{ ...bubbleRadii, ...cardShadow, marginBottom: 2 }}
                      onPress={() => router.push(`/salon/${salon.id}` as any)}
                    >
                      <View className="flex-row items-center">
                        <View className="w-16 h-16 overflow-hidden bg-dark-200 mr-3.5" style={bubbleRadiiSm}>
                          {salon.avatar_url ? (
                            <Image source={{ uri: salon.avatar_url }} className="w-full h-full" resizeMode="cover" />
                          ) : (
                            <View className="w-full h-full items-center justify-center bg-primary-50">
                              <Ionicons name="cut" size={24} color="#0a85f4" />
                            </View>
                          )}
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-dark-700 font-bold text-[15px] flex-1" numberOfLines={1}>{salon.name}</Text>
                            {salon.is_promoted && (
                              <View className="bg-amber-100 px-2 py-0.5 rounded-md">
                                <Text className="text-amber-700 text-[9px] font-bold">BOOST</Text>
                              </View>
                            )}
                            {salon.is_available_now && <View className="w-2 h-2 rounded-full bg-emerald-400" />}
                          </View>
                          <View className="flex-row items-center mt-0.5 gap-2">
                            {salon.rating_avg != null && (
                              <View className="flex-row items-center">
                                <Ionicons name="star" size={11} color="#f59e0b" />
                                <Text className="text-dark-500 text-[11px] ml-0.5">
                                  {salon.rating_avg.toFixed(1)}
                                  {salon.reviews_count ? ` (${salon.reviews_count})` : ""}
                                </Text>
                              </View>
                            )}
                            {salon.distance_km != null && (
                              <Text className="text-dark-400 text-[11px]">
                                {salon.distance_km < 1 ? `${Math.round(salon.distance_km * 1000)}m` : `${salon.distance_km.toFixed(1)}km`}
                              </Text>
                            )}
                            {salon.travel_time_min != null && (
                              <Text className="text-dark-400 text-[11px]">· {salon.travel_time_min} min</Text>
                            )}
                          </View>
                        </View>
                        <Text className="text-dark-700 text-sm font-semibold ml-2">{salon.avg_price_label}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* ── Favorite ── */}
            {favoriteSalons.length > 0 && (
              <View className="mb-5">
                <View className="flex-row items-center justify-between px-5 mb-3">
                  <Text className="text-dark-700 font-bold text-[15px]">Favorite</Text>
                  <Pressable onPress={() => router.push("/appointments" as any)}>
                    <Text className="text-primary-500 text-xs font-semibold">Vezi toate</Text>
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
                      className="bg-white w-[140px] overflow-hidden active:bg-dark-100"
                      style={{ ...bubbleRadiiSm, ...cardShadow }}
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
                        <View className="absolute top-1.5 right-1.5">
                          <Ionicons name="heart" size={16} color="#ef4444" />
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
                              {salon.distance_km < 1 ? `${Math.round(salon.distance_km * 1000)}m` : `${salon.distance_km.toFixed(1)}km`}
                            </Text>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── All Salons ── */}
            <View className="px-5">
              <Text className="text-dark-700 font-bold text-[15px] mb-3">
                {selectedCategory
                  ? selectedCategory === "barbershop" ? "Barbershop-uri" : "Coafuri"
                  : filterAvailableNow ? "Disponibile acum" : "Toate saloanele"}
                <Text className="text-dark-400 font-normal text-sm">
                  {sortedSalons.length > 0 ? ` · ${sortedSalons.length}` : ""}
                </Text>
              </Text>

              {salonsLoading ? (
                <ActivityIndicator size="large" color="#0a85f4" className="my-8" />
              ) : sortedSalons.length > 0 ? (
                <View className="gap-3">
                  {sortedSalons.map((salon) => (
                    <Pressable
                      key={salon.id}
                      className="bg-white p-4 active:bg-dark-100"
                      style={{ ...bubbleRadii, ...cardShadow, marginBottom: 2 }}
                      onPress={() => router.push(`/salon/${salon.id}` as any)}
                    >
                      <View className="flex-row items-center">
                        <View className="w-16 h-16 overflow-hidden bg-dark-200 mr-3.5" style={bubbleRadiiSm}>
                          {salon.avatar_url ? (
                            <Image source={{ uri: salon.avatar_url }} className="w-full h-full" resizeMode="cover" />
                          ) : (
                            <View className="w-full h-full items-center justify-center bg-primary-50">
                              <Ionicons name="cut" size={24} color="#0a85f4" />
                            </View>
                          )}
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-dark-700 font-bold text-[15px] flex-1" numberOfLines={1}>{salon.name}</Text>
                            {salon.is_promoted && (
                              <View className="bg-amber-100 px-2 py-0.5 rounded-md">
                                <Text className="text-amber-700 text-[9px] font-bold">BOOST</Text>
                              </View>
                            )}
                            {salon.is_available_now && <View className="w-2 h-2 rounded-full bg-emerald-400" />}
                          </View>
                          <View className="flex-row items-center mt-0.5 gap-2">
                            {salon.rating_avg != null && (
                              <View className="flex-row items-center">
                                <Ionicons name="star" size={11} color="#f59e0b" />
                                <Text className="text-dark-500 text-[11px] ml-0.5">
                                  {salon.rating_avg.toFixed(1)}
                                  {salon.reviews_count ? ` (${salon.reviews_count})` : ""}
                                </Text>
                              </View>
                            )}
                            {salon.distance_km != null && (
                              <Text className="text-dark-400 text-[11px]">
                                {salon.distance_km < 1 ? `${Math.round(salon.distance_km * 1000)}m` : `${salon.distance_km.toFixed(1)}km`}
                              </Text>
                            )}
                            {salon.travel_time_min != null && (
                              <Text className="text-dark-400 text-[11px]">· {salon.travel_time_min} min</Text>
                            )}
                          </View>
                          {(salon.city || salon.address) && (
                            <Text className="text-dark-400 text-[11px] mt-0.5" numberOfLines={1}>
                              {salon.address ? `${salon.address}` : salon.city}
                            </Text>
                          )}
                        </View>
                        <Text className="text-dark-700 text-sm font-semibold ml-2">{salon.avg_price_label}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View className="items-center py-10 bg-white" style={{ ...bubbleRadii, ...cardShadow }}>
                  <Ionicons name={filterAvailableNow ? "time-outline" : "search-outline"} size={40} color="#cbd5e1" />
                  <Text className="text-dark-600 font-semibold mt-3 text-center text-sm">
                    {filterAvailableNow ? "Niciun salon disponibil acum" : "Niciun rezultat"}
                  </Text>
                  {(filterAvailableNow || selectedCategory) && (
                    <Pressable
                      className="mt-3 bg-primary-500 px-5 py-2"
                      style={bubbleRadiiSm}
                      onPress={() => {
                        setFilterAvailableNow(false);
                        setSelectedCategory(null);
                      }}
                    >
                      <Text className="text-white font-semibold text-sm">Arată toate saloanele</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* ── CTA ── */}
            <View className="mx-5 mt-5">
              <Pressable
                className="bg-primary-500 py-4 items-center active:bg-primary-600"
                style={bubbleRadii}
                onPress={() => setShowCategoryPicker(true)}
              >
                <Text className="text-white font-bold text-[15px]">Programare nouă</Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        </BottomSheet>
      </SafeAreaView>

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
        visible={showCategoryPicker}
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

