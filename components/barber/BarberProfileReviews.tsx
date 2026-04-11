import { View, Text, Image, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SalonReviewWithAuthor } from "@/types/database";
import { getInitials, timeAgo } from "@/lib/utils";
import { Bubble, Shadows } from "@/constants/theme";

interface BarberProfileReviewsProps {
  ratingAvg: number;
  reviewsCount: number;
  reviews: SalonReviewWithAuthor[];
  onLoadMore: () => void;
  onCollapse: () => void;
  canLoadMore: boolean;
  canCollapse: boolean;
}

export function BarberProfileReviews({
  ratingAvg,
  reviewsCount,
  reviews,
  onLoadMore,
  onCollapse,
  canLoadMore,
  canCollapse,
}: BarberProfileReviewsProps) {
  return (
    <View className="mt-4 pb-3">
      {/* Section title */}
      <Text
        className="font-bold mx-4 mb-3"
        style={{ fontSize: 16, color: "#191919" }}
      >
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
            {ratingAvg.toFixed(1)}
          </Text>
          <View className="flex-row mt-1 gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons
                key={s}
                name={s <= Math.round(ratingAvg) ? "star" : "star-outline"}
                size={14}
                color="#f59e0b"
              />
            ))}
          </View>
          <Text className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
            {reviewsCount} recenzii
          </Text>
        </View>

        {/* Right: empty — no write review on barber page */}
        <View className="flex-1 items-end" />
      </View>

      {/* Empty state */}
      {reviews.length === 0 && reviewsCount === 0 && (
        <View
          className="mx-4 bg-white p-6 items-center"
          style={{ ...Bubble.radii, ...Shadows.sm }}
        >
          <Ionicons name="chatbubble-outline" size={32} color="#94a3b8" />
          <Text
            className="font-semibold text-sm mt-3"
            style={{ color: "#191919" }}
          >
            Nicio recenzie încă
          </Text>
        </View>
      )}

      {/* Review cards */}
      {reviews.map((review) => (
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
                    review.profile?.display_name ||
                      review.profile?.username ||
                      "U"
                  )}
                </Text>
              )}
            </View>
            <View className="flex-1">
              <Text
                className="font-semibold text-xs"
                style={{ color: "#191919" }}
              >
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
              <Text
                className="font-bold text-[11px] mb-1"
                style={{ color: "#4481EB" }}
              >
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
      {canLoadMore && (
        <Pressable
          onPress={onLoadMore}
          className="items-center py-3 active:opacity-70"
        >
          <Text className="font-semibold" style={{ color: "#4481EB" }}>
            Vezi mai multe
          </Text>
        </Pressable>
      )}

      {/* Collapse */}
      {canCollapse && (
        <Pressable
          onPress={onCollapse}
          className="items-center py-3 active:opacity-70"
        >
          <Text className="font-semibold" style={{ color: "#4481EB" }}>
            Arată mai puține
          </Text>
        </Pressable>
      )}
    </View>
  );
}
