import { View, Text, ScrollView, Pressable } from "react-native";
import { Avatar } from "@/components/ui";
import { StoryGroup } from "@/lib/stories";
import React from "react";

interface StoriesRowProps {
  groups: StoryGroup[];
  onGroupPress: (group: StoryGroup, index: number) => void;
  containerRef?: React.RefObject<View>;
  firstAvatarRef?: React.RefObject<View>;
}

export function StoriesRow({ groups, onGroupPress, containerRef, firstAvatarRef }: StoriesRowProps) {
  if (groups.length === 0) return null;

  return (
    <View ref={containerRef} className="pt-3 pb-4" style={{ backgroundColor: "#F0F4F8" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14, alignItems: "flex-start" }}
      >
        {groups.map((group, index) => (
          <Pressable
            key={group.authorId}
            onPress={() => onGroupPress(group, index)}
            className="items-center w-16"
          >
            {/* Blue ring for unseen, grey ring for all-seen */}
            <View
              ref={index === 0 ? firstAvatarRef : undefined}
              className={`rounded-full p-[3px] ${
                group.hasUnseen ? "bg-primary-500" : "bg-dark-300"
              }`}
            >
              <View className="rounded-full p-[2px] bg-white">
                <Avatar
                  source={group.avatarUrl}
                  name={group.authorName}
                  size="md"
                  useDefaultAvatar={true}
                />
              </View>
            </View>
            <Text
              className="text-dark-700 text-[11px] mt-1.5 font-medium"
              numberOfLines={1}
            >
              {group.authorName.length > 8
                ? group.authorName.slice(0, 7) + "..."
                : group.authorName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
