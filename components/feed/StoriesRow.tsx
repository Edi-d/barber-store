import { View, Text, ScrollView, Pressable, Image } from "react-native";
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
    <View className="h-[82px] border-b border-dark-300 bg-white">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 16, alignItems: "center" }}
        className="flex-1"
      >
        {/* Add Story Button */}
        <Pressable onPress={onAddStory} className="items-center">
          <View className="w-14 h-14 rounded-full bg-dark-200 border-2 border-dashed border-dark-400 items-center justify-center">
            <Ionicons name="add" size={28} color="#64748b" />
          </View>
          <Text className="text-dark-500 text-xs mt-1.5">Add</Text>
        </Pressable>

        {/* Stories */}
        {stories.map((story) => (
          <Pressable
            key={story.id}
            onPress={() => onStoryPress?.(story)}
            className="items-center"
          >
            <View
              className={`rounded-full p-0.5 ${
                story.isLive
                  ? "bg-red-500"
                  : story.hasStory
                  ? "bg-primary-600"
                  : "bg-transparent"
              }`}
            >
              <View className="rounded-full p-0.5 bg-white">
                <Avatar
                  source={story.avatar_url}
                  name={story.username}
                  size="md"
                  useDefaultAvatar={true}
                />
              </View>
            </View>
            {story.isLive && (
              <View className="absolute top-10 bg-red-500 px-1.5 py-0.5 rounded">
                <Text className="text-white text-[8px] font-bold">LIVE</Text>
              </View>
            )}
            <Text className="text-dark-700 text-xs mt-1.5" numberOfLines={1}>
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
