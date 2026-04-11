import { useState, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Barber, BarberService } from "@/types/database";
import {
  fetchBarberAvailability,
  fetchSalonReviews,
  getTodayScheduleText,
  getWeekSchedule,
  SERVICE_CATEGORY_ORDER,
} from "@/lib/salon";
import { ScreenHeader } from "@/components/shared/ScreenHeader";
import { BarberProfileHeader } from "@/components/barber/BarberProfileHeader";
import BarberProfileBio from "@/components/barber/BarberProfileBio";
import BarberProfileSchedule from "@/components/barber/BarberProfileSchedule";
import BarberProfileServices from "@/components/barber/BarberProfileServices";
import { BarberProfileReviews } from "@/components/barber/BarberProfileReviews";
import BarberProfileCTA from "@/components/barber/BarberProfileCTA";
import { BarberProfileSkeleton } from "@/components/barber/BarberProfileSkeleton";

const REVIEW_PAGE_SIZE = 5;

export default function BarberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reviewLimit, setReviewLimit] = useState(REVIEW_PAGE_SIZE);

  // ── Barber ──────────────────────────────────────────────────────────────────
  const { data: barber, isLoading } = useQuery({
    queryKey: ["barber", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barbers")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Barber;
    },
    enabled: !!id,
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
  const { data: availability } = useQuery({
    queryKey: ["barber-availability", id],
    queryFn: () => fetchBarberAvailability(id!),
    enabled: !!id,
  });

  // ── Reviews ──────────────────────────────────────────────────────────────────
  const { data: reviews } = useQuery({
    queryKey: ["barber-reviews", barber?.salon_id, reviewLimit],
    queryFn: () => fetchSalonReviews(barber!.salon_id!, reviewLimit),
    enabled: !!barber?.salon_id,
  });

  // ── Computed values ──────────────────────────────────────────────────────────
  const availableCategories = useMemo(() => {
    if (!servicesGrouped) return [];
    return SERVICE_CATEGORY_ORDER.filter(
      (cat) => servicesGrouped[cat]?.length > 0
    );
  }, [servicesGrouped]);

  const todaySchedule = useMemo(
    () => getTodayScheduleText(availability || []),
    [availability]
  );

  const weekSchedule = useMemo(
    () => getWeekSchedule(availability || []),
    [availability]
  );

  // ── Loading / empty guard ────────────────────────────────────────────────────
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
        <BarberProfileHeader barber={barber} />

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
        />
      </ScrollView>

      <BarberProfileCTA
        barberName={barber.name}
        salonId={barber.salon_id!}
        barberId={barber.id}
      />
    </SafeAreaView>
  );
}
