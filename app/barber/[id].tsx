import { useState, useMemo, useCallback } from "react";
import { View, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Barber, BarberService } from "@/types/database";
import {
  fetchBarberScheduleWithFallback,
  fetchBarberReviews,
  getTodayScheduleText,
  getWeekSchedule,
  submitReview,
  uploadReviewPhotos,
  hasCompletedAppointment,
  SERVICE_CATEGORY_ORDER,
} from "@/lib/salon";
import { fetchSalonExtendedHours } from "@/lib/extended-hours";
import { useAuthStore } from "@/stores/authStore";
import { ScreenHeader } from "@/components/shared/ScreenHeader";
import { BarberProfileHeader } from "@/components/barber/BarberProfileHeader";
import BarberProfileBio from "@/components/barber/BarberProfileBio";
import BarberProfileSchedule from "@/components/barber/BarberProfileSchedule";
import BarberProfileServices from "@/components/barber/BarberProfileServices";
import { BarberProfileReviews } from "@/components/barber/BarberProfileReviews";
import BarberProfileCTA from "@/components/barber/BarberProfileCTA";
import { BarberProfileSkeleton } from "@/components/barber/BarberProfileSkeleton";
import { ReviewModal } from "@/components/salon/ReviewModal";

const REVIEW_PAGE_SIZE = 5;

export default function BarberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reviewLimit, setReviewLimit] = useState(REVIEW_PAGE_SIZE);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();

  // ── Barber ──────────────────────────────────────────────────────────────────
  // Embed the linked profile so the avatar can be backfilled when
  // barbers.avatar_url is NULL (typical for the salon owner).
  const { data: barber, isLoading, error: barberError } = useQuery({
    queryKey: ["barber", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barbers")
        .select("*, profile:profiles(avatar_url)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Barber & { profile: { avatar_url: string | null } | null };
    },
    enabled: !!id,
  });

  // Authoritative role lives in salon_members.role (barbers.role is unreliable).
  const { data: memberRole } = useQuery({
    queryKey: ["barber-member-role", barber?.salon_id, barber?.profile_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_members")
        .select("role")
        .eq("salon_id", barber!.salon_id!)
        .eq("profile_id", barber!.profile_id!)
        .maybeSingle();
      if (error) throw error;
      return data?.role ?? null;
    },
    enabled: !!barber?.salon_id && !!barber?.profile_id,
  });

  // ── Services grouped by category ────────────────────────────────────────────
  const { data: servicesGrouped } = useQuery({
    queryKey: ["barber-services-grouped", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("*")
        .eq("salon_id", barber!.salon_id)
        .eq("active", true)
        .order("price_cents");
      if (error) throw error;
      const grouped: Record<string, BarberService[]> = {};
      for (const s of data as BarberService[]) {
        const cat = s.category || "Altele";
        (grouped[cat] = grouped[cat] || []).push(s);
      }
      return grouped;
    },
    enabled: !!barber?.salon_id,
  });

  // ── Availability ─────────────────────────────────────────────────────────────
  // Falls back to the salon's published hours when the barber has no explicit
  // availability rows, so the schedule stays consistent with the salon page.
  const { data: availability } = useQuery({
    queryKey: ["barber-availability", id, barber?.salon_id],
    queryFn: () => fetchBarberScheduleWithFallback(id!, barber?.salon_id ?? null),
    enabled: !!barber,
  });

  const { data: extendedHours } = useQuery({
    queryKey: ["salon-extended-hours", barber?.salon_id],
    queryFn: () => fetchSalonExtendedHours(barber!.salon_id!),
    enabled: !!barber?.salon_id,
    staleTime: 5 * 60 * 1000,
  });

  // ── Salon name (for the review modal subtitle) ──────────────────────────────
  const { data: salonName } = useQuery({
    queryKey: ["salon-name", barber?.salon_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salons")
        .select("name")
        .eq("id", barber!.salon_id!)
        .single();
      if (error) throw error;
      return data.name as string;
    },
    enabled: !!barber?.salon_id,
  });

  // ── Reviews (this barber only — the salon page shows the combined feed) ─────
  const { data: reviews } = useQuery({
    queryKey: ["barber-reviews", id, reviewLimit],
    queryFn: () => fetchBarberReviews(id!, reviewLimit),
    enabled: !!id,
  });

  const userBarberReview = useMemo(() => {
    if (!session || !reviews) return null;
    return reviews.find((r) => r.user_id === session.user.id) ?? null;
  }, [reviews, session]);

  // A client can only leave a NEW review for this barber after a completed
  // appointment with them; editing an existing review is always allowed.
  const { data: hasCompletedVisit } = useQuery({
    queryKey: ["barber-can-review", id, session?.user.id],
    queryFn: () => hasCompletedAppointment(session!.user.id, barber!.salon_id!, id),
    enabled: !!id && !!session && !!barber?.salon_id,
  });

  const canReviewBarber = !!userBarberReview || !!hasCompletedVisit;

  // ── Review submit ───────────────────────────────────────────────────────────
  const handleReviewSubmit = useCallback(
    async (review: {
      rating: number;
      comment: string;
      existingPhotoUrls: string[];
      newPhotos?: Array<{ base64: string; mimeType: string }>;
    }) => {
      if (!session?.user || !barber?.salon_id) return;
      let uploadedUrls: string[] = [];
      if (review.newPhotos && review.newPhotos.length > 0) {
        uploadedUrls = await uploadReviewPhotos(session.user.id, review.newPhotos);
      }
      await submitReview({
        userId: session.user.id,
        salonId: barber.salon_id,
        barberId: barber.id,
        rating: review.rating,
        comment: review.comment,
        photoUrls: [...review.existingPhotoUrls, ...uploadedUrls],
      });
      queryClient.invalidateQueries({ queryKey: ["barber-reviews", id] });
      queryClient.invalidateQueries({ queryKey: ["salon-reviews", barber.salon_id] });
      queryClient.invalidateQueries({ queryKey: ["barber", id] });
    },
    [session, barber, id, queryClient]
  );

  // ── Computed values ──────────────────────────────────────────────────────────
  const availableCategories = useMemo(() => {
    if (!servicesGrouped) return [];
    return SERVICE_CATEGORY_ORDER.filter(
      (cat) => servicesGrouped[cat]?.length > 0
    );
  }, [servicesGrouped]);

  const todaySchedule = useMemo(
    () => getTodayScheduleText(availability || [], extendedHours),
    [availability, extendedHours]
  );

  const weekSchedule = useMemo(
    () => getWeekSchedule(availability || [], extendedHours),
    [availability, extendedHours]
  );

  // ── Loading / empty guard ────────────────────────────────────────────────────
  if (barberError) {
    return (
      <SafeAreaView className="flex-1 bg-[#F0F4F8] items-center justify-center px-8">
        <Text className="text-center" style={{ color: "#65676B" }}>
          Nu am putut încărca profilul. Încearcă din nou mai târziu.
        </Text>
      </SafeAreaView>
    );
  }

  if (isLoading || !barber) {
    return <BarberProfileSkeleton />;
  }

  const ratingAvg = barber.rating_avg ?? 0;
  const reviewsCount = barber.reviews_count ?? 0;
  const canLoadMore =
    reviewsCount > reviewLimit && (reviews?.length ?? 0) === reviewLimit;
  const canCollapse = reviewLimit > REVIEW_PAGE_SIZE;

  return (
    <SafeAreaView className="flex-1 bg-[#F0F4F8]" edges={["top"]}>
      <ScreenHeader title="" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <BarberProfileHeader barber={barber} role={memberRole ?? barber.role} />

        <BarberProfileSchedule
          todaySchedule={todaySchedule}
          weekSchedule={weekSchedule}
        />

        {barber.bio ? <BarberProfileBio bio={barber.bio} /> : null}

        {availableCategories.length > 0 && servicesGrouped ? (
          <BarberProfileServices
            salonId={barber.salon_id!}
            barberId={barber.id}
            services={servicesGrouped}
            categories={availableCategories}
          />
        ) : null}

        <BarberProfileReviews
          ratingAvg={ratingAvg}
          reviewsCount={reviewsCount}
          reviews={reviews ?? []}
          canLoadMore={canLoadMore}
          canCollapse={canCollapse}
          onLoadMore={() => setReviewLimit((prev) => prev + REVIEW_PAGE_SIZE)}
          onCollapse={() => setReviewLimit(REVIEW_PAGE_SIZE)}
          onWriteReview={session && canReviewBarber ? () => setShowReviewModal(true) : undefined}
          writeReviewLabel={userBarberReview ? "Editează recenzia" : "Lasă o recenzie"}
          reviewHint={
            session && !canReviewBarber
              ? "Poți lăsa o recenzie după o programare finalizată cu acest frizer."
              : undefined
          }
        />
      </ScrollView>

      <BarberProfileCTA
        barberName={barber.name}
        salonId={barber.salon_id!}
        barberId={barber.id}
      />

      <ReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onSubmit={handleReviewSubmit}
        salonName={salonName || ""}
        barberName={barber.name}
        initialRating={userBarberReview?.rating}
        initialComment={userBarberReview?.comment ?? undefined}
        initialPhotoUrls={userBarberReview?.photo_urls}
      />
    </SafeAreaView>
  );
}
