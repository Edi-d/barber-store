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
    queryKey: ["services-grouped"],
    queryFn: fetchServicesGrouped,
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
    <View className="flex-1 bg-white">
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
                <Image
                  source={{ uri: item.photo_url }}
                  style={{ width: SCREEN_WIDTH, height: GALLERY_HEIGHT }}
                  resizeMode="cover"
                />
              )}
              keyExtractor={(item) => item.id}
            />
            {/* Back button */}
            <SafeAreaView className="absolute top-0 left-0 right-0" edges={["top"]}>
              <View className="flex-row justify-between px-4 pt-2">
                <Pressable
                  onPress={() => router.back()}
                  className="w-10 h-10 bg-black/40 rounded-full items-center justify-center"
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
                className="absolute top-4 left-4 w-10 h-10 bg-black/20 rounded-full items-center justify-center"
              >
                <Ionicons name="arrow-back" size={22} color="white" />
              </Pressable>
              <Ionicons name="cut" size={48} color="#0a85f4" />
            </View>
          </SafeAreaView>
        )}

        {/* ── 2. Name + Rating + Favorite + Share ── */}
        <View className="px-5 pt-4 pb-2">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-dark-700 text-xl font-bold">{salon.name}</Text>
              <View className="flex-row items-center mt-1.5 gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Ionicons
                    key={s}
                    name={s <= Math.round(salon.rating_avg || 0) ? "star" : "star-outline"}
                    size={16}
                    color="#f59e0b"
                  />
                ))}
                <Text className="text-dark-600 text-sm font-semibold ml-1">
                  {(salon.rating_avg || 0).toFixed(1)}
                </Text>
                <Text className="text-dark-400 text-sm">
                  ({salon.reviews_count || 0} recenzii)
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={handleToggleFavorite}
                className="w-10 h-10 bg-dark-100 rounded-full items-center justify-center"
              >
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={20}
                  color={isFavorite ? "#ef4444" : "#64748b"}
                />
              </Pressable>
              <Pressable
                onPress={handleShare}
                className="w-10 h-10 bg-dark-100 rounded-full items-center justify-center"
              >
                <Ionicons name="share-outline" size={20} color="#64748b" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── 3. Address + Distance ── */}
        <Pressable
          onPress={openInMaps}
          className="mx-5 flex-row items-center py-3 border-t border-dark-200"
        >
          <Ionicons name="location-outline" size={20} color="#0a85f4" />
          <View className="flex-1 ml-3">
            <Text className="text-dark-700 text-sm font-medium">
              {salon.address ? `${salon.address}, ${salon.city}` : salon.city}
            </Text>
            {distance != null && (
              <Text className="text-dark-400 text-xs mt-0.5">
                {distance < 1
                  ? `${Math.round(distance * 1000)}m de tine`
                  : `${distance.toFixed(1)}km de tine`}
              </Text>
            )}
          </View>
          <Ionicons name="navigate-outline" size={18} color="#0a85f4" />
        </Pressable>

        {/* ── 4. Working Hours ── */}
        <Pressable
          onPress={() => setShowFullSchedule(!showFullSchedule)}
          className="mx-5 flex-row items-center py-3 border-t border-dark-200"
        >
          <Ionicons
            name="time-outline"
            size={20}
            color={todaySchedule.isOpen ? "#10b981" : "#ef4444"}
          />
          <View className="flex-1 ml-3">
            <Text
              className={`text-sm font-medium ${
                todaySchedule.isOpen ? "text-emerald-600" : "text-red-500"
              }`}
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
        {showFullSchedule && (
          <View className="mx-5 pb-3 gap-1.5">
            {weekSchedule.map((day) => (
              <View
                key={day.day}
                className={`flex-row justify-between px-3 py-1.5 rounded-lg ${
                  day.isToday ? "bg-primary-50" : ""
                }`}
              >
                <Text
                  className={`text-sm ${
                    day.isToday ? "font-bold text-dark-700" : "text-dark-500"
                  }`}
                >
                  {day.day}
                </Text>
                <Text
                  className={`text-sm ${
                    day.isToday ? "font-bold text-dark-700" : "text-dark-500"
                  }`}
                >
                  {day.hours}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 5. Amenities ── */}
        {salon.amenities && salon.amenities.length > 0 && (
          <View className="mx-5 py-3 border-t border-dark-200">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 16 }}
            >
              {salon.amenities.map((key) => {
                const config = AMENITY_CONFIG[key];
                if (!config) return null;
                return (
                  <View key={key} className="items-center gap-1">
                    <View className="w-10 h-10 rounded-full bg-emerald-50 items-center justify-center">
                      <Ionicons name={config.icon as any} size={20} color="#10b981" />
                    </View>
                    <Text className="text-dark-500 text-[10px] font-medium">
                      {config.label}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── 6. Happy Hour ── */}
        {happyHour && (
          <View className="mx-5 mt-2 mb-1 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex-row items-center">
            <View className="w-12 h-12 bg-amber-500 rounded-xl items-center justify-center mr-3">
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
          <View className="mx-5 py-3 border-t border-dark-200">
            <Text className="text-dark-700 font-bold text-[15px] mb-2">Despre salon</Text>
            <Text
              className="text-dark-500 text-sm leading-5"
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
          <View className="py-3 border-t border-dark-200">
            <Text className="text-dark-700 font-bold text-[15px] mx-5 mb-3">Servicii</Text>

            {/* Category tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
              className="mb-3"
            >
              {availableCategories.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-full ${
                    (activeCategory || availableCategories[0]) === cat
                      ? "bg-primary-500"
                      : "bg-dark-100"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      (activeCategory || availableCategories[0]) === cat
                        ? "text-white"
                        : "text-dark-600"
                    }`}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Service cards */}
            <View className="mx-5 gap-2.5">
              {activeServices.map((service) => (
                <Pressable
                  key={service.id}
                  onPress={() =>
                    router.push(
                      `/book-appointment?salonId=${id}&serviceId=${service.id}` as any
                    )
                  }
                  className="bg-white rounded-2xl border border-dark-200 p-4 active:bg-dark-100"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="text-dark-700 font-bold text-[14px]">
                        {service.name}
                      </Text>
                      {service.description && (
                        <Text className="text-dark-400 text-xs mt-1" numberOfLines={2}>
                          {service.description}
                        </Text>
                      )}
                      <View className="flex-row items-center mt-2 gap-3">
                        <View className="flex-row items-center">
                          <Ionicons name="time-outline" size={13} color="#64748b" />
                          <Text className="text-dark-500 text-xs ml-1">
                            {service.duration_min} min
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-primary-500 font-bold text-base">
                        {formatPrice(service.price_cents, service.currency)}
                      </Text>
                      <View className="mt-2 bg-primary-500 px-4 py-1.5 rounded-lg">
                        <Text className="text-white text-xs font-bold">Rezervă</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── 9. Team ── */}
        {teamBarbers && teamBarbers.length > 0 && (
          <View className="py-3 border-t border-dark-200">
            <Text className="text-dark-700 font-bold text-[15px] mx-5 mb-3">Echipa</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            >
              {teamBarbers.map((barber) => (
                <View key={barber.id} className="w-[120px] items-center bg-white border border-dark-200 p-3"
                  style={{
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 8,
                    borderBottomRightRadius: 18,
                    borderBottomLeftRadius: 18,
                  }}>
                  <View className="w-16 h-16 overflow-hidden bg-dark-200 mb-2"
                    style={{
                      borderTopLeftRadius: 18,
                      borderTopRightRadius: 8,
                      borderBottomRightRadius: 18,
                      borderBottomLeftRadius: 18,
                    }}>
                    {barber.avatar_url ? (
                      <Image
                        source={{ uri: barber.avatar_url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-full items-center justify-center bg-primary-100">
                        <Text className="text-primary-600 font-bold text-lg">
                          {getInitials(barber.name)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-dark-700 font-bold text-xs text-center" numberOfLines={1}>
                    {barber.name}
                  </Text>
                  {barber.role && (
                    <Text className="text-dark-400 text-[10px] mt-0.5">
                      {barber.role === "owner" ? "Proprietar" : "Frizer"}
                    </Text>
                  )}
                  {barber.specialties?.[0] && (
                    <Text className="text-primary-500 text-[10px] mt-0.5">
                      {barber.specialties[0]}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 10. Reviews ── */}
        <View className="py-3 border-t border-dark-200">
          <Text className="text-dark-700 font-bold text-[15px] mx-5 mb-3">Recenzii</Text>

          {/* Rating summary + write review button */}
          <View className="mx-5 flex-row items-center bg-white rounded-2xl border border-dark-200 p-4 mb-3">
            <View className="items-center mr-5">
              <Text className="text-dark-700 text-3xl font-bold">
                {(salon.rating_avg || 0).toFixed(1)}
              </Text>
              <View className="flex-row mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Ionicons
                    key={s}
                    name={s <= Math.round(salon.rating_avg || 0) ? "star" : "star-outline"}
                    size={14}
                    color="#f59e0b"
                  />
                ))}
              </View>
              <Text className="text-dark-400 text-xs mt-0.5">
                {salon.reviews_count || 0} recenzii
              </Text>
            </View>
            <View className="flex-1" />
            {session && (
              <Pressable
                onPress={() => setShowReviewModal(true)}
                className="bg-primary-500 px-4 py-2.5 flex-row items-center gap-1.5 active:bg-primary-600"
                style={{ borderTopLeftRadius: 18, borderTopRightRadius: 8, borderBottomRightRadius: 18, borderBottomLeftRadius: 18 }}
              >
                <Ionicons name="create-outline" size={16} color="white" />
                <Text className="text-white font-semibold text-xs">Lasă o recenzie</Text>
              </Pressable>
            )}
          </View>

          {/* Empty state */}
          {reviews && reviews.length === 0 && (salon.reviews_count || 0) === 0 && (
            <Pressable
              onPress={() => session && setShowReviewModal(true)}
              className="mx-5 mb-3 bg-white rounded-2xl border border-dashed border-dark-200 p-6 items-center"
            >
              <Ionicons name="chatbubble-outline" size={32} color="#cbd5e1" />
              <Text className="text-dark-700 font-semibold text-sm mt-3">
                Nicio recenzie încă
              </Text>
              <Text className="text-dark-400 text-xs mt-1 text-center">
                Fii primul care lasă o recenzie și ajută comunitatea!
              </Text>
              {session && (
                <View className="mt-3 bg-primary-50 px-4 py-2 rounded-xl flex-row items-center gap-1.5">
                  <Ionicons name="create-outline" size={14} color="#0a85f4" />
                  <Text className="text-primary-500 font-semibold text-xs">Scrie o recenzie</Text>
                </View>
              )}
            </Pressable>
          )}
          {reviews?.map((review) => (
            <View
              key={review.id}
              className="mx-5 mb-3 bg-white rounded-2xl border border-dark-200 p-4"
            >
              <View className="flex-row items-center mb-2">
                <View className="w-8 h-8 rounded-full bg-primary-100 items-center justify-center mr-2">
                  {review.profile?.avatar_url ? (
                    <Image
                      source={{ uri: review.profile.avatar_url }}
                      className="w-full h-full rounded-full"
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
                  <Text className="text-dark-700 font-semibold text-xs">
                    {review.profile?.display_name || review.profile?.username}
                  </Text>
                  <Text className="text-dark-400 text-[10px]">
                    {timeAgo(review.created_at)}
                  </Text>
                </View>
                <View className="flex-row">
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
              {review.comment && (
                <Text className="text-dark-500 text-sm">{review.comment}</Text>
              )}
              {review.photo_url && (
                <Image
                  source={{ uri: review.photo_url }}
                  className="w-full h-40 rounded-xl mt-2"
                  resizeMode="cover"
                />
              )}
            </View>
          ))}

          {reviews && reviews.length >= reviewLimit && (
            <Pressable
              onPress={() => setReviewLimit((prev) => prev + 20)}
              className="mx-5 py-3 items-center"
            >
              <Text className="text-primary-500 font-semibold text-sm">
                Vezi mai multe recenzii
              </Text>
            </Pressable>
          )}
          {reviewLimit > 5 && reviews && reviews.length > 0 && reviews.length < reviewLimit && (
            <Pressable
              onPress={() => setReviewLimit(5)}
              className="mx-5 py-3 items-center"
            >
              <Text className="text-primary-500 font-semibold text-sm">
                Arată mai puține
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky Bottom CTA ── */}
      <View
        className="px-5 py-4 border-t border-dark-200 bg-white"
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
          className="bg-primary-500 py-4 items-center active:bg-primary-600"
          style={{ borderTopLeftRadius: 25, borderTopRightRadius: 12, borderBottomRightRadius: 25, borderBottomLeftRadius: 25 }}
        >
          <Text className="text-white font-bold text-[15px]">Programează-te acum</Text>
        </Pressable>
      </View>

      {/* ── Review Modal ── */}
      <ReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onSubmit={handleReviewSubmit}
        salonName={salon?.name || ""}
      />
    </View>
  );
}
