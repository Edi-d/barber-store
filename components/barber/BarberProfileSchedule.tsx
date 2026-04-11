import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Bubble, Shadows, FontFamily } from "@/constants/theme";

interface BarberProfileScheduleProps {
  todaySchedule: { isOpen: boolean; text: string };
  weekSchedule: { day: string; hours: string; isToday: boolean }[];
}

export default function BarberProfileSchedule({
  todaySchedule,
  weekSchedule,
}: BarberProfileScheduleProps) {
  const [expanded, setExpanded] = useState(false);

  const { isOpen, text } = todaySchedule;

  return (
    <View className="mx-4 mt-3">
      <View
        style={[
          { backgroundColor: "#ffffff", overflow: "hidden" },
          Bubble.radii,
          Shadows.sm,
        ]}
      >
        {/* Header row */}
        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          className="flex-row items-center px-4 py-3"
        >
          {/* Status icon squircle */}
          <View
            style={[
              {
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isOpen ? "#ecfdf5" : "#fef2f2",
              },
              Bubble.radiiSm,
            ]}
          >
            <Ionicons
              name="time-outline"
              size={18}
              color={isOpen ? "#10b981" : "#ef4444"}
            />
          </View>

          {/* Status text */}
          <Text
            className="flex-1 mx-3 text-sm font-medium"
            style={{
              fontFamily: FontFamily.medium,
              color: isOpen ? "#059669" : "#ef4444",
            }}
            numberOfLines={1}
          >
            {text}
          </Text>

          {/* Chevron */}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color="#94a3b8"
          />
        </Pressable>

        {/* Expanded week schedule */}
        {expanded && (
          <View className="px-4 pb-3 gap-1">
            {weekSchedule.map((item) => (
              <View
                key={item.day}
                className="flex-row justify-between px-3 py-1.5 rounded-lg"
                style={
                  item.isToday
                    ? { backgroundColor: "rgba(68,129,235,0.07)" }
                    : undefined
                }
              >
                <Text
                  style={{
                    fontFamily: item.isToday
                      ? FontFamily.semiBold
                      : FontFamily.regular,
                    fontSize: 13,
                    color: item.isToday ? "#4481EB" : "#64748b",
                  }}
                >
                  {item.day}
                </Text>
                <Text
                  style={{
                    fontFamily: item.isToday
                      ? FontFamily.semiBold
                      : FontFamily.regular,
                    fontSize: 13,
                    color: item.isToday ? "#4481EB" : "#64748b",
                  }}
                >
                  {item.hours}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
