import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "@/components/ui";

interface Story {
  id: string;
  username: string;
  avatar_url: string | null;
  hasStory?: boolean;
  isLive?: boolean;
}

interface StoriesRowProps {
  stories: Story[];
  onAddStory?: () => void;
  onStoryPress?: (story: Story) => void;
}

export function StoriesRow({ stories, onAddStory, onStoryPress }: StoriesRowProps) {
  return (
    <View className="py-3 border-b border-dark-300 bg-white">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14, alignItems: "flex-start" }}
      >
        {/* Add Story Button */}
        <Pressable onPress={onAddStory} className="items-center w-16">
          <View className="w-16 h-16 rounded-full bg-dark-100 border-2 border-dashed border-dark-400 items-center justify-center">
            <Ionicons name="add" size={28} color="#64748b" />
          </View>
          <Text className="text-dark-500 text-[11px] mt-1.5 font-medium">Add</Text>
        </Pressable>

        {/* Stories */}
        {stories.map((story) => (
          <Pressable
            key={story.id}
            onPress={() => onStoryPress?.(story)}
            className="items-center w-16"
          >
            {/* Blue ring border for stories / Red for live */}
            <View
              className={`rounded-full p-[3px] ${
                story.isLive
                  ? "bg-red-500"
                  : story.hasStory
                  ? "bg-primary-500"
                  : "bg-dark-300"
              }`}
            >
              <View className="rounded-full p-[2px] bg-white">
                <Avatar
                  source={story.avatar_url}
                  name={story.username}
                  size="md"
                  useDefaultAvatar={true}
                />
              </View>
            </View>
            {story.isLive && (
              <View className="absolute top-[52px] bg-red-500 px-1.5 py-0.5 rounded z-10">
                <Text className="text-white text-[8px] font-bold">LIVE</Text>
              </View>
            )}
            <Text
              className="text-dark-700 text-[11px] mt-1.5 font-medium"
              numberOfLines={1}
            >
              {story.username.length > 8
                ? story.username.slice(0, 7) + "..."
                : story.username}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
