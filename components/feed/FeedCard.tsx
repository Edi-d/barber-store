import { View, Text, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, Badge, Card } from "@/components/ui";
import { ContentWithAuthor } from "@/types/database";
import { timeAgo } from "@/lib/utils";
import { router } from "expo-router";

interface FeedCardProps {
  item: ContentWithAuthor;
  onLike: () => void;
  onComment: () => void;
  onShare?: () => void;
}

export function FeedCard({ item, onLike, onComment, onShare }: FeedCardProps) {
  return (
    <Card className="mx-4 mb-3 p-0 overflow-hidden">
      {/* Header - 28px height style */}
      <View className="flex-row items-center justify-between p-4 pb-3">
        <Pressable
          onPress={() => router.push(`/profile/${item.author_id}`)}
          className="flex-row items-center flex-1"
        >
          <Avatar
            source={item.author.avatar_url}
            name={item.author.display_name || item.author.username}
            size="sm"
            useDefaultAvatar={true}
          />
          <View className="ml-3 flex-1">
            <View className="flex-row items-center">
              <Text className="text-dark-700 font-semibold">
                {item.author.display_name || item.author.username}
              </Text>
              {item.author.role === "creator" && (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color="#0a66c2"
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
            <Text className="text-dark-500 text-xs">
              {item.author.role === "creator" ? "Creator" : "Member"} • {timeAgo(item.created_at)}
            </Text>
          </View>
        </Pressable>

        <Pressable className="p-2">
          <Ionicons name="ellipsis-horizontal" size={20} color="#64748b" />
        </Pressable>
      </View>

      {/* Caption */}
      {item.caption && (
        <Text className="text-dark-700 px-4 pb-3 text-[15px] leading-5">
          {item.caption}
        </Text>
      )}

      {/* Media */}
      {item.thumb_url || item.media_url ? (
        <Pressable onPress={() => router.push(`/content/${item.id}`)}>
          <Image
            source={{ uri: item.thumb_url || item.media_url || "" }}
            className="w-full aspect-video bg-dark-200"
            resizeMode="cover"
          />
          {item.type === "video" && (
            <View className="absolute inset-0 items-center justify-center">
              <View className="w-14 h-14 rounded-full bg-black/50 items-center justify-center">
                <Ionicons name="play" size={28} color="white" />
              </View>
            </View>
          )}
        </Pressable>
      ) : null}

      {/* Actions - 24px & 12px spacing */}
      <View className="flex-row items-center px-4 py-3 border-t border-dark-300">
        {/* Like */}
        <Pressable onPress={onLike} className="flex-row items-center mr-6">
          <Ionicons
            name={item.is_liked ? "heart" : "heart-outline"}
            size={22}
            color={item.is_liked ? "#0a66c2" : "#64748b"}
          />
          <Text className="text-dark-500 text-sm ml-1.5">
            {item.likes_count || "Like"}
          </Text>
        </Pressable>

        {/* Comment */}
        <Pressable onPress={onComment} className="flex-row items-center mr-6">
          <Ionicons name="chatbubble-outline" size={20} color="#64748b" />
          <Text className="text-dark-500 text-sm ml-1.5">
            {item.comments_count || "Comment"}
          </Text>
        </Pressable>

        {/* Share */}
        <Pressable onPress={onShare} className="flex-row items-center mr-6">
          <Ionicons name="arrow-redo-outline" size={22} color="#64748b" />
          <Text className="text-dark-500 text-sm ml-1.5">Share</Text>
        </Pressable>

        {/* Spacer */}
        <View className="flex-1" />

        {/* Save */}
        <Pressable>
          <Ionicons name="bookmark-outline" size={22} color="#64748b" />
        </Pressable>
      </View>
    </Card>
  );
}
