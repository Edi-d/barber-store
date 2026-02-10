import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface QuickAction {
  id: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "outline";
  badge?: number;
}

interface QuickActionsProps {
  actions: QuickAction[];
  onActionPress?: (action: QuickAction) => void;
}

export function QuickActions({ actions, onActionPress }: QuickActionsProps) {
  return (
    <View className="h-[44px] border-b border-dark-300 bg-white">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
        className="flex-1"
      >
        {actions.map((action) => (
          <Pressable
            key={action.id}
            onPress={() => onActionPress?.(action)}
            className={`flex-row items-center px-4 py-2 rounded-full ${
              action.variant === "primary"
                ? "bg-primary-500"
                : "bg-white border border-dark-300"
            }`}
          >
            {action.icon && (
              <Ionicons
                name={action.icon}
                size={16}
                color={action.variant === "primary" ? "white" : "#64748b"}
                style={{ marginRight: 6 }}
              />
            )}
            <Text
              className={`text-sm font-medium ${
                action.variant === "primary" ? "text-white" : "text-dark-600"
              }`}
            >
              {action.label}
            </Text>
            {action.badge !== undefined && action.badge > 0 && (
              <View className="ml-1.5 bg-primary-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1">
                <Text className="text-white text-[10px] font-bold">{action.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
