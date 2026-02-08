import { View, Text, Dimensions, Pressable } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { useRef, useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, Badge } from "@/components/ui";
import { ContentWithAuthor } from "@/types/database";
import { timeAgo } from "@/lib/utils";
import { router } from "expo-router";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

interface FeedItemProps {
  item: ContentWithAuthor;
  isActive: boolean;
  onLike: () => void;
  onComment: () => void;
}

export function FeedItem({ item, isActive, onLike, onComment }: FeedItemProps) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (isActive) {
      videoRef.current?.playAsync();
      setIsPlaying(true);
    } else {
      videoRef.current?.pauseAsync();
      setIsPlaying(false);
    }
  }, [isActive]);

  const togglePlay = async () => {
    if (isPlaying) {
      await videoRef.current?.pauseAsync();
    } else {
      await videoRef.current?.playAsync();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    videoRef.current?.setIsMutedAsync(!isMuted);
    setIsMuted(!isMuted);
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      if (status.didJustFinish) {
        videoRef.current?.replayAsync();
      }
    }
  };

  return (
    <View style={{ height: SCREEN_HEIGHT - 88, width: SCREEN_WIDTH }} className="bg-dark-950">
      {/* Video Player */}
      <Pressable onPress={togglePlay} className="flex-1">
        {item.media_url ? (
          <Video
            ref={videoRef}
            source={{ uri: item.media_url }}
            style={{ flex: 1 }}
            resizeMode={ResizeMode.COVER}
            isLooping
            isMuted={isMuted}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          />
        ) : (
          <View className="flex-1 bg-dark-800 items-center justify-center">
            <Ionicons name="videocam-off" size={48} color="#6d6d8a" />
            <Text className="text-dark-400 mt-2">Video indisponibil</Text>
          </View>
        )}

        {/* Play/Pause Overlay */}
        {!isPlaying && (
          <View className="absolute inset-0 items-center justify-center bg-black/20">
            <View className="w-16 h-16 rounded-full bg-white/20 items-center justify-center">
              <Ionicons name="play" size={32} color="white" />
            </View>
          </View>
        )}
      </Pressable>

      {/* HUD - Right Side Actions */}
      <View className="absolute right-4 bottom-32 items-center gap-6">
        {/* Like Button */}
        <Pressable onPress={onLike} className="items-center">
          <View className="w-12 h-12 rounded-full bg-dark-800/60 items-center justify-center">
            <Ionicons
              name={item.is_liked ? "heart" : "heart-outline"}
              size={28}
              color={item.is_liked ? "#6366f1" : "white"}
            />
          </View>
          <Text className="text-white text-xs mt-1 font-semibold">
            {item.likes_count}
          </Text>
        </Pressable>

        {/* Comment Button */}
        <Pressable onPress={onComment} className="items-center">
          <View className="w-12 h-12 rounded-full bg-dark-800/60 items-center justify-center">
            <Ionicons name="chatbubble-outline" size={26} color="white" />
          </View>
          <Text className="text-white text-xs mt-1 font-semibold">
            {item.comments_count}
          </Text>
        </Pressable>

        {/* Share Button */}
        <Pressable className="items-center">
          <View className="w-12 h-12 rounded-full bg-dark-800/60 items-center justify-center">
            <Ionicons name="share-social-outline" size={26} color="white" />
          </View>
          <Text className="text-white text-xs mt-1 font-semibold">Share</Text>
        </Pressable>

        {/* Mute Button */}
        <Pressable onPress={toggleMute} className="items-center">
          <View className="w-12 h-12 rounded-full bg-dark-800/60 items-center justify-center">
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={24}
              color="white"
            />
          </View>
        </Pressable>
      </View>

      {/* HUD - Bottom Info */}
      <View className="absolute left-4 right-20 bottom-8">
        {/* Author Info */}
        <Pressable
          onPress={() => router.push(`/profile/${item.author_id}`)}
          className="flex-row items-center mb-3"
        >
          <Avatar
            source={item.author.avatar_url}
            name={item.author.display_name || item.author.username}
            size="sm"
            useDefaultAvatar={true}
          />
          <Text className="text-white font-bold ml-2">
            @{item.author.username}
          </Text>
          {item.author.role === "creator" && (
            <Badge variant="primary" size="sm" className="ml-2">
              Creator
            </Badge>
          )}
        </Pressable>

        {/* Caption */}
        {item.caption && (
          <Text className="text-white text-base mb-2" numberOfLines={3}>
            {item.caption}
          </Text>
        )}

        {/* Timestamp */}
        <Text className="text-dark-400 text-sm">
          {timeAgo(item.created_at)}
        </Text>
      </View>

      {/* Live Badge (if live_placeholder) */}
      {item.type === "live_placeholder" && (
        <View className="absolute top-16 left-4">
          <Badge variant="live">LIVE</Badge>
        </View>
      )}
    </View>
  );
}
