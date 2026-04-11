import { useState, useMemo, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Dimensions,
  Share,
  Linking,
  Platform,
  FlatList,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useLocationStore } from "@/stores/locationStore";
import { Salon, Barber, BarberService } from "@/types/database";
import { formatPrice, getInitials, timeAgo } from "@/lib/utils";
import { getDistanceKm } from "@/lib/discover";
import {
  fetchSalonPhotos,
  fetchServicesGrouped,
  fetchSalonSchedule,
  fetchSalonReviews,
  fetchActiveHappyHour,
  toggleFavorite,
  uploadReviewPhoto,
  submitReview,
  AMENITY_CONFIG,
  SERVICE_CATEGORY_ORDER,
  getTodayScheduleText,
  getWeekSchedule,
} from "@/lib/salon";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { ReviewModal } from "@/components/salon/ReviewModal";
import { Bubble, Shadows } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GALLERY_HEIGHT = 260;

export default function SalonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const { latitude, longitude } = useLocationStore();
  const queryClient = useQueryClient();

  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewLimit, setReviewLimit] = useState(5);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // ── Queries ──

  const { data: salon, isLoading } = useQuery({
    queryKey: ["salon", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salons")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Salon;
    },
    enabled: !!id,
  });

  // Fetch team barbers for this salon
  const { data: teamBarbers } = useQuery({
    queryKey: ["salon-team", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barbers")
        .select("*")
        .eq("salon_id", id)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Barber[];
    },
    enabled: !!id,
  });

  const { data: photos } = useQuery({
    queryKey: ["salon-photos", id],
    queryFn: () => fetchSalonPhotos(id!),
    enabled: !!id,
  });

  const { data: servicesGrouped } = useQuery({
    queryKey: ["services-grouped", id],
    queryFn: () => fetchServicesGrouped(id!),
    enabled: !!id,
  });

  const { data: availability } = useQuery({
    queryKey: ["salon-availability", id],
    queryFn: () => fetchSalonSchedule(id!),
    enabled: !!id,
  });

  const { data: reviews } = useQuery({
    queryKey: ["salon-reviews", id, reviewLimit],
    queryFn: () => fetchSalonReviews(id!, reviewLimit),
    enabled: !!id,
  });

  const { data: happyHour } = useQuery({
    queryKey: ["salon-happy-hour", id],
    queryFn: () => fetchActiveHappyHour(id!),
    enabled: !!id,
    refetchInterval: 60000,
  });

  const { data: isFavorite } = useQuery({
    queryKey: ["salon-is-favorite", id, session?.user.id],
    queryFn: async () => {
      if (!session) return false;
      const { data } = await supabase
        .from("salon_favorites")
        .select("salon_id")
        .eq("user_id", session.user.id)
        .eq("salon_id", id!)
        .maybeSingle();
      return !!data;
    },
    enabled: !!id && !!session,
  });

  // ── Computed ──

  const galleryImages = useMemo(() => {
    if (photos && photos.length > 0) return photos;
    if (salon?.cover_url) return [{ id: "cover", photo_url: salon.cover_url, caption: null, sort_order: 0, salon_id: id!, created_at: "" }];
    return [];
  }, [photos, salon]);

  const distance = useMemo(() => {
    if (!latitude || !longitude || !salon?.latitude || !salon?.longitude) return null;
    return getDistanceKm(latitude, longitude, salon.latitude, salon.longitude);
  }, [latitude, longitude, salon]);

  const todaySchedule = useMemo(
    () => getTodayScheduleText(availability || []),
    [availability]
  );

  const weekSchedule = useMemo(
    () => getWeekSchedule(availability || []),
    [availability]
  );

  const availableCategories = useMemo(() => {
    if (!servicesGrouped) return [];
    return SERVICE_CATEGORY_ORDER.filter((cat) => servicesGrouped[cat]?.length > 0);
  }, [servicesGrouped]);

  const activeServices = useMemo(() => {
    if (!servicesGrouped || availableCategories.length === 0) return [];
    const cat = activeCategory || availableCategories[0];
    return servicesGrouped[cat] || [];
  }, [servicesGrouped, activeCategory, availableCategories]);

  // Set initial category
  useMemo(() => {
    if (!activeCategory && availableCategories.length > 0) {
      setActiveCategory(availableCategories[0]);
    }
  }, [availableCategories]);

  // ── D-6: Check if current user already reviewed ──

  const userReview = useMemo(() => {
    if (!session || !reviews) return null;
    return reviews.find((r) => r.user_id === session.user.id) ?? null;
  }, [reviews, session]);

  // ── Review submit ──

  const handleReviewSubmit = useCallback(
    async (review: { rating: number; comment: string; photoBase64?: string; photoMimeType?: string }) => {
      if (!session || !id) return;
      let photoUrl: string | undefined;
      if (review.photoBase64) {
        photoUrl = await uploadReviewPhoto(session.user.id, review.photoBase64, review.photoMimeType);
      }
      await submitReview({
        userId: session.user.id,
        salonId: id,
        rating: review.rating,
        comment: review.comment,
        photoUrl,
      });
      queryClient.invalidateQueries({ queryKey: ["salon-reviews", id] });
      queryClient.invalidateQueries({ queryKey: ["salon", id] });
    },
    [session, id, queryClient]
  );

  // ── Actions ──

  const handleToggleFavorite = useCallback(async () => {
    if (!session || !id) return;
    await toggleFavorite(session.user.id, id, !!isFavorite);
    queryClient.invalidateQueries({ queryKey: ["salon-is-favorite", id] });
    queryClient.invalidateQueries({ queryKey: ["salon-favorites"] });
  }, [session, id, isFavorite]);

  const handleShare = useCallback(async () => {
    if (!salon) return;
    await Share.share({
      message: `Descoperă ${salon.name} pe Tapzi! ${salon.address}, ${salon.city}`,
    });
  }, [salon]);

  const openInMaps = useCallback(() => {
    if (!salon?.latitude || !salon?.longitude) return;
    const label = encodeURIComponent(salon.name);
    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${label}@${salon.latitude},${salon.longitude}`
        : `geo:0,0?q=${salon.latitude},${salon.longitude}(${label})`;
    Linking.openURL(url);
  }, [salon]);

  // ── Loading ──

  if (isLoading || !salon) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0a85f4" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F0F4F8]">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ── 1. Gallery ── */}
        {galleryImages.length > 0 ? (
          <View style={{ height: GALLERY_HEIGHT }}>
            <FlatList
              data={galleryImages}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                setActivePhotoIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
              }}
              renderItem={({ item }) => (
                <Pressable onPress={() => setLightboxPhoto(item.photo_url)}>
                  <Image
                    source={{ uri: item.photo_url }}
                    style={{ width: SCREEN_WIDTH, height: GALLERY_HEIGHT }}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
              keyExtractor={(item) => item.id}
            />
            {/* Back button */}
            <SafeAreaView className="absolute top-0 left-0 right-0" edges={["top"]}>
              <View className="flex-row justify-between px-4 pt-2">
                <Pressable
                  onPress={() => router.back()}
                  className="w-10 h-10 bg-black/40 items-center justify-center"
                  style={Bubble.radiiSm}
                >
                  <Ionicons name="arrow-back" size={22} color="white" />
                </Pressable>
                <View className="bg-black/50 px-2.5 py-1 rounded-full self-center">
                  <Text className="text-white text-xs font-semibold">
                    {activePhotoIndex + 1} / {galleryImages.length}
                  </Text>
                </View>
              </View>
            </SafeAreaView>
            {/* Dots */}
            {galleryImages.length > 1 && (
              <View className="absolute bottom-3 left-0 right-0 flex-row justify-center gap-1.5">
                {galleryImages.map((_, i) => (
                  <View
                    key={i}
                    className={`w-2 h-2 rounded-full ${i === activePhotoIndex ? "bg-white" : "bg-white/40"}`}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <SafeAreaView edges={["top"]}>
            <View style={{ height: GALLERY_HEIGHT }} className="bg-primary-50 items-center justify-center">
              <Pressable
                onPress={() => router.back()}
                className="absolute top-4 left-4 w-10 h-10 bg-black/20 items-center justify-center"
                style={Bubble.radiiSm}
              >
                <Ionicons name="arrow-back" size={22} color="white" />
              </Pressable>
              <Ionicons name="cut" size={48} color="#0a85f4" />
            </View>
          </SafeAreaView>
        )}

        {/* ── 2-4. Info card: name / address / hours ── */}
        <View
          className="mx-4 mt-[-20px] bg-white"
          style={{ ...Bubble.radii, ...Shadows.md }}
        >
          {/* Section A — Name + Rating + Actions */}
          <View className="flex-row items-start justify-between px-4 pt-4 pb-3.5">
            {/* Left: name + star row */}
            <View className="flex-1 mr-3">
              <Text
                className="text-xl font-bold"
                style={{ color: "#191919", fontFamily: "EuclidCircularA-Bold" }}
                numberOfLines={2}
              >
                {salon.name}
              </Text>
              <View className="flex-row items-center mt-1.5 gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Ionicons
                    key={s}
                    name={
                      s <= Math.round(salon.rating_avg || 0)
                        ? "star"
                        : "star-outline"
                    }
                    size={15}
                    color="#f59e0b"
                  />
                ))}
                <Text
                  className="text-sm ml-1"
                  style={{
                    color: "#191919",
                    fontFamily: "EuclidCircularA-SemiBold",
                  }}
                >
                  {(salon.rating_avg || 0).toFixed(1)}
                </Text>
                <Text className="text-sm text-dark-400 ml-0.5">
                  ({salon.reviews_count || 0})
                </Text>
              </View>
            </View>

            {/* Right: 3 action icons */}
            <View className="flex-row gap-2">
              <Pressable
                onPress={handleToggleFavorite}
                className="w-[38px] h-[38px] bg-[#F0F4F8] items-center justify-center"
                style={Bubble.radiiSm}
              >
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={18}
                  color={isFavorite ? "#ef4444" : "#64748b"}
                />
              </Pressable>
              {salon.phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${salon.phone}`)}
                  className="w-[38px] h-[38px] bg-[#F0F4F8] items-center justify-center"
                  style={Bubble.radiiSm}
                >
                  <Ionicons name="call-outline" size={18} color="#64748b" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleShare}
                className="w-[38px] h-[38px] bg-[#F0F4F8] items-center justify-center"
                style={Bubble.radiiSm}
              >
                <Ionicons name="share-outline" size={18} color="#64748b" />
              </Pressable>
            </View>
          </View>

          {/* Divider */}
          <View className="mx-3 h-[1px] bg-dark-200/50" />

          {/* Section B — Address */}
          <Pressable
            onPress={openInMaps}
            className="flex-row items-center px-4 py-3"
          >
            <View
              className="w-9 h-9 bg-[#4481EB]/10 items-center justify-center"
              style={Bubble.radiiSm}
            >
              <Ionicons name="location-outline" size={18} color="#4481EB" />
            </View>
            <View className="flex-1 mx-3">
              <Text
                className="text-sm font-medium"
                style={{
                  color: "#191919",
                  fontFamily: "EuclidCircularA-Medium",
                }}
                numberOfLines={2}
              >
                {salon.address
                  ? `${salon.address}, ${salon.city}`
                  : salon.city}
              </Text>
              {distance != null && (
                <Text className="text-xs text-dark-400 mt-0.5">
                  {distance < 1
                    ? `${Math.round(distance * 1000)}m de tine`
                    : `${distance.toFixed(1)}km de tine`}
                </Text>
              )}
            </View>
            <Ionicons name="navigate-outline" size={18} color="#4481EB" />
          </Pressable>

          {/* Divider */}
          <View className="mx-3 h-[1px] bg-dark-200/50" />

          {/* Section C — Working Hours */}
          <Pressable
            onPress={() => setShowFullSchedule(!showFullSchedule)}
            className="flex-row items-center px-4 py-3"
          >
            <View
              className={`w-9 h-9 items-center justify-center ${
                todaySchedule.isOpen ? "bg-emerald-50" : "bg-red-50"
              }`}
              style={Bubble.radiiSm}
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={todaySchedule.isOpen ? "#10b981" : "#ef4444"}
              />
            </View>
            <View className="flex-1 mx-3">
              <Text
                className={`text-sm font-medium ${
                  todaySchedule.isOpen ? "text-emerald-600" : "text-red-500"
                }`}
                style={{ fontFamily: "EuclidCircularA-Medium" }}
              >
                {todaySchedule.text}
              </Text>
            </View>
            <Ionicons
              name={showFullSchedule ? "chevron-up" : "chevron-down"}
              size={18}
              color="#94a3b8"
            />
          </Pressable>

          {/* Expanded week schedule */}
          {showFullSchedule && (
            <View className="px-4 pb-3 gap-1">
              {weekSchedule.map((day) => (
                <View
                  key={day.day}
                  className="flex-row justify-between items-center px-3 py-1.5 rounded-lg"
                  style={
                    day.isToday
                      ? { backgroundColor: "rgba(68,129,235,0.07)" }
                      : undefined
                  }
                >
                  <Text
                    className={`text-sm ${
                      day.isToday ? "text-[#4481EB]" : "text-dark-500"
                    }`}
                    style={{
                      fontFamily: day.isToday
                        ? "EuclidCircularA-SemiBold"
                        : "EuclidCircularA-Regular",
                    }}
                  >
                    {day.day}
                  </Text>
                  <Text
                    className={`text-sm ${
                      day.isToday ? "text-[#4481EB]" : "text-dark-500"
                    }`}
                    style={{
                      fontFamily: day.isToday
                        ? "EuclidCircularA-SemiBold"
                        : "EuclidCircularA-Regular",
                    }}
                  >
                    {day.hours}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── 5. Amenities ── */}
        {salon.amenities && salon.amenities.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {salon.amenities.map((key) => {
              const config = AMENITY_CONFIG[key];
              if (!config) return null;
              return (
                <View
                  key={key}
                  className="flex-row items-center gap-2 bg-white border border-dark-200 px-3 py-2"
                  style={Bubble.radiiSm}
                >
                  <Ionicons name={config.icon as any} size={16} color="#4481EB" />
                  <Text className="text-xs font-medium text-dark-600">{config.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* ── 6. Happy Hour ── */}
        {happyHour && (
          <View
            className="mx-4 mt-3 bg-amber-50 border border-amber-200 p-4 flex-row items-center"
            style={{ ...Bubble.radii, ...Shadows.sm }}
          >
            <View
              className="w-11 h-11 bg-amber-500 items-center justify-center mr-3"
              style={Bubble.radiiSm}
            >
              <Ionicons name="flame" size={24} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-amber-800 font-bold text-sm">Happy Hour Activ!</Text>
              <Text className="text-amber-600 text-xs mt-0.5">
                -{happyHour.discount_percent}% la toate serviciile
              </Text>
            </View>
            <CountdownTimer endsAt={happyHour.ends_at} />
          </View>
        )}

        {/* ── 7. Description ── */}
        {salon.bio && (
          <View className="mx-4 mt-4">
            <Text
              className="font-bold mb-2"
              style={{ fontSize: 16, color: "#191919" }}
            >
              Despre salon
            </Text>
            <Text
              className="text-sm leading-5"
              style={{ color: "#65676B" }}
              numberOfLines={showFullDescription ? undefined : 3}
            >
              {salon.bio}
            </Text>
            {salon.bio.length > 120 && (
              <Pressable onPress={() => setShowFullDescription(!showFullDescription)}>
                <Text className="text-primary-500 text-sm font-semibold mt-1">
                  {showFullDescription ? "Mai puțin" : "Citește mai mult"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── 8. Services ── */}
        {availableCategories.length > 0 && (
          <View className="mt-4">
            <Text
              className="mx-4 mb-3 font-bold"
              style={{ fontSize: 16, color: "#191919" }}
            >
              Servicii
            </Text>

            {/* Category tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              className="mb-3"
            >
              {availableCategories.map((cat) => {
                const isActive = (activeCategory || availableCategories[0]) === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setActiveCategory(cat)}
                    className={`px-4 py-2 ${isActive ? "bg-[#4481EB]" : "bg-[#F0F4F8]"}`}
                    style={Bubble.radiiSm}
                  >
                    <Text
                      className={`font-semibold text-sm ${isActive ? "text-white" : "text-[#65676B]"}`}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Service cards */}
            <View className="mx-4 gap-2.5">
              {activeServices.map((service) => (
                <Pressable
                  key={service.id}
                  onPress={() =>
                    router.push(
                      `/book-appointment?salonId=${id}&serviceId=${service.id}` as any
                    )
                  }
                  className="bg-white p-4 overflow-hidden active:opacity-80"
                  style={[Bubble.radii, Shadows.sm]}
                >
                  <View className="flex-row">
                    <View className="flex-1 mr-3">
                      <Text
                        className="font-bold text-[#191919]"
                        style={{ fontSize: 14 }}
                      >
                        {service.name}
                      </Text>
                      {service.description ? (
                        <Text
                          className="text-xs text-[#65676B] mt-1"
                          numberOfLines={2}
                        >
                          {service.description}
                        </Text>
                      ) : null}
                      <View className="flex-row items-center mt-2 gap-1">
                        <Ionicons name="time-outline" size={12} color="#65676B" />
                        <Text className="text-xs text-[#65676B]">
                          {service.duration_min} min
                        </Text>
                      </View>
                    </View>
                    <View className="items-end justify-between">
                      <View className="items-end">
                        {happyHour ? (
                          <>
                            <Text
                              className="text-xs text-[#65676B]"
                              style={{ textDecorationLine: "line-through" }}
                            >
                              {formatPrice(service.price_cents, service.currency)}
                            </Text>
                            <Text className="text-amber-600 font-bold text-base">
                              {formatPrice(
                                Math.round(service.price_cents * (1 - happyHour.discount_percent / 100)),
                                service.currency
                              )}
                            </Text>
                          </>
                        ) : (
                          <Text className="text-[#191919] font-bold text-base">
                            {formatPrice(service.price_cents, service.currency)}
                          </Text>
                        )}
                      </View>
                      <Pressable
                        onPress={() =>
                          router.push(
                            `/book-appointment?salonId=${id}&serviceId=${service.id}` as any
                          )
                        }
                        className="bg-[#4481EB] px-4 py-2 mt-2 active:opacity-80"
                        style={Bubble.radiiSm}
                      >
                        <Text className="text-white font-bold text-xs">Rezervă</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── 9. Team ── */}
        {teamBarbers && teamBarbers.length > 0 && (
          <View className="mt-4">
            <Text className="mx-4 mb-3 font-bold text-base text-[#191919]">Echipa</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            >
              {teamBarbers.map((barber) => (
                <Pressable
                  key={barber.id}
                  onPress={() => router.push(`/barber/${barber.id}`)}
                  className="w-[150px] bg-white overflow-hidden active:opacity-90"
                  style={{ ...Bubble.radii, ...Shadows.sm }}
                >
                  {/* Avatar — 4:5 portrait, top corners follow Bubble.radii */}
                  <View
                    className="w-full overflow-hidden"
                    style={{
                      aspectRatio: 4 / 5,
                      borderTopLeftRadius: 24,
                      borderTopRightRadius: 11,
                      borderBottomLeftRadius: 0,
                      borderBottomRightRadius: 0,
                    }}
                  >
                    {barber.avatar_url ? (
                      <Image
                        source={{ uri: barber.avatar_url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-full items-center justify-center bg-[#E8F3FF]">
                        <Text className="text-2xl font-bold text-[#4481EB]">
                          {getInitials(barber.name)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View className="px-3 pt-2.5 pb-3">
                    <Text
                      className="font-bold text-[13px] text-[#191919]"
                      numberOfLines={1}
                    >
                      {barber.name}
                    </Text>
                    {barber.role === "owner" && (
                      <View className="self-start bg-amber-50 px-1.5 py-0.5 rounded-md mt-1">
                        <Text className="text-amber-700 text-[10px] font-semibold">
                          Proprietar
                        </Text>
                      </View>
                    )}
                    {/* Rating + reviews */}
                    {barber.rating_avg != null && (
                      <View className="flex-row items-center mt-1 gap-0.5">
                        <Ionicons name="star" size={10} color="#f59e0b" />
                        <Text className="text-[11px] font-semibold text-dark-700 ml-0.5">
                          {Number(barber.rating_avg).toFixed(1)}
                        </Text>
                        {barber.reviews_count != null && barber.reviews_count > 0 && (
                          <Text className="text-[10px] text-dark-400">
                            ({barber.reviews_count} {barber.reviews_count === 1 ? 'recenzie' : 'recenzii'})
                          </Text>
                        )}
                      </View>
                    )}
                    {barber.specialties?.[0] && (
                      <Text
                        className="text-[#4481EB] text-[11px] font-medium mt-0.5"
                        numberOfLines={1}
                      >
                        {barber.specialties[0]}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 10. Reviews ── */}
        <View className="mt-4 pb-3">
          <Text className="font-bold mx-4 mb-3" style={{ fontSize: 16, color: "#191919" }}>
            Recenzii
          </Text>

          {/* Rating summary card */}
          <View
            className="mx-4 mb-3 bg-white p-4 flex-row items-center"
            style={{ ...Bubble.radii, ...Shadows.sm }}
          >
            {/* Left: score + stars + count */}
            <View className="items-center">
              <Text className="font-bold text-3xl" style={{ color: "#191919" }}>
                {(salon.rating_avg || 0).toFixed(1)}
              </Text>
              <View className="flex-row mt-1 gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Ionicons
                    key={s}
                    name={s <= Math.round(salon.rating_avg || 0) ? "star" : "star-outline"}
                    size={14}
                    color="#f59e0b"
                  />
                ))}
              </View>
              <Text className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
                {salon.reviews_count || 0} recenzii
              </Text>
            </View>

            {/* Right: write review button */}
            <View className="flex-1 items-end">
              <Pressable
                onPress={() => setShowReviewModal(true)}
                className="flex-row items-center gap-1.5 px-4 py-2.5 active:opacity-80"
                style={{ backgroundColor: "#4481EB", ...Bubble.radiiSm }}
              >
                <Ionicons name="create-outline" size={16} color="white" />
                <Text className="font-semibold text-xs text-white">
                  {userReview ? "Editează recenzia" : "Lasă o recenzie"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Empty state */}
          {reviews && reviews.length === 0 && (salon.reviews_count || 0) === 0 && (
            <View
              className="mx-4 mb-3 bg-white p-6 items-center"
              style={{ ...Bubble.radii, ...Shadows.sm }}
            >
              <Ionicons name="chatbubble-outline" size={32} color="#94a3b8" />
              <Text className="font-semibold text-sm mt-3" style={{ color: "#191919" }}>
                Nicio recenzie încă
              </Text>
              <Text className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                Fii primul care lasă o recenzie
              </Text>
              {session && (
                <Pressable
                  onPress={() => setShowReviewModal(true)}
                  className="mt-4 px-4 py-2 rounded-xl active:opacity-80"
                  style={{ backgroundColor: "#E8F3FF" }}
                >
                  <Text className="font-semibold text-xs" style={{ color: "#4481EB" }}>
                    Scrie o recenzie
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Review cards */}
          {reviews?.map((review) => (
            <View
              key={review.id}
              className="mx-4 mb-2.5 bg-white p-4"
              style={{ ...Bubble.radii, ...Shadows.sm }}
            >
              {/* Header row */}
              <View className="flex-row items-center mb-2">
                <View className="w-8 h-8 rounded-full bg-primary-100 items-center justify-center mr-2 overflow-hidden">
                  {review.profile?.avatar_url ? (
                    <Image
                      source={{ uri: review.profile.avatar_url }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <Text className="text-primary-600 font-bold text-xs">
                      {getInitials(
                        review.profile?.display_name || review.profile?.username || "U"
                      )}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-xs" style={{ color: "#191919" }}>
                    {review.profile?.display_name || review.profile?.username}
                  </Text>
                  <Text className="text-[10px]" style={{ color: "#94a3b8" }}>
                    {timeAgo(review.created_at)}
                  </Text>
                </View>
                <View className="flex-row gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons
                      key={s}
                      name={s <= review.rating ? "star" : "star-outline"}
                      size={12}
                      color="#f59e0b"
                    />
                  ))}
                </View>
              </View>

              {/* Comment */}
              {review.comment && (
                <Text className="text-sm" style={{ color: "#65676B" }}>
                  {review.comment}
                </Text>
              )}

              {/* Photo */}
              {review.photo_url && (
                <Image
                  source={{ uri: review.photo_url }}
                  className="w-full h-40 mt-2"
                  style={{ borderRadius: 12 }}
                  resizeMode="cover"
                />
              )}

              {/* Owner reply */}
              {review.owner_reply ? (
                <View
                  className="ml-3 mt-3 p-3"
                  style={{
                    backgroundColor: "#E8F3FF",
                    borderWidth: 1,
                    borderColor: "#dbeafe",
                    borderRadius: 12,
                  }}
                >
                  <Text className="font-bold text-[11px] mb-1" style={{ color: "#4481EB" }}>
                    Răspuns proprietar:
                  </Text>
                  <Text className="text-sm leading-5" style={{ color: "#65676B" }}>
                    {review.owner_reply}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}

          {/* Load more */}
          {reviews && reviews.length >= reviewLimit && (
            <Pressable
              onPress={() => setReviewLimit((prev) => prev + 20)}
              className="items-center py-3 active:opacity-70"
            >
              <Text className="font-semibold" style={{ color: "#4481EB" }}>
                Vezi mai multe
              </Text>
            </Pressable>
          )}

          {/* Collapse */}
          {reviewLimit > 5 && reviews && reviews.length > 0 && reviews.length < reviewLimit && (
            <Pressable
              onPress={() => setReviewLimit(5)}
              className="items-center py-3 active:opacity-70"
            >
              <Text className="font-semibold" style={{ color: "#4481EB" }}>
                Arată mai puține
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky Bottom CTA ── */}
      <View
        className="bg-[#F0F4F8] border-t border-dark-200 px-5 pt-3"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: Platform.OS === "ios" ? 34 : 16,
        }}
      >
        <Pressable
          onPress={() => router.push(`/book-appointment?salonId=${id}` as any)}
          className="items-center py-4 active:opacity-90"
          style={{ backgroundColor: "#4481EB", ...Bubble.radii, ...Shadows.glow }}
        >
          <Text className="font-bold text-white" style={{ fontSize: 15 }}>
            Programează-te acum
          </Text>
        </Pressable>
      </View>

      {/* ── Review Modal ── */}
      <ReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onSubmit={handleReviewSubmit}
        salonName={salon?.name || ""}
      />

      {/* ── D-4: Lightbox Modal ── */}
      <Modal
        visible={!!lightboxPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxPhoto(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" }}>
          {lightboxPhoto ? (
            <Image
              source={{ uri: lightboxPhoto }}
              style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            onPress={() => setLightboxPhoto(null)}
            style={{ position: "absolute", top: 56, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="close" size={22} color="white" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
