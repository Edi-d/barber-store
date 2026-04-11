import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Bubble, Colors, Shadows } from "@/constants/theme";

// ─── NewAppointmentCTA ────────────────────────────────────────────────────────

export function NewAppointmentCTA() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(100).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 320 });
        }}
        onPress={() => router.push("/book-appointment")}
        style={[
          Shadows.md,
          Bubble.radii,
          {
            backgroundColor: Colors.white,
            borderWidth: 1,
            borderColor: "rgba(68,129,235,0.2)",
          },
        ]}
      >
        <View className="flex-row items-center p-4">
          {/* Icon container */}
          <View
            className="items-center justify-center mr-[14px]"
            style={[
              { width: 48, height: 48, backgroundColor: Colors.gradientStart },
              Bubble.radiiSm,
            ]}
          >
            <Ionicons name="add" size={26} color={Colors.white} />
          </View>

          {/* Labels */}
          <View className="flex-1">
            <Text
              className="text-base font-semibold"
              style={{ color: Colors.text, fontFamily: "EuclidCircularA-SemiBold" }}
            >
              Programare nouă
            </Text>
            <Text
              className="text-sm mt-0.5"
              style={{ color: Colors.textSecondary, fontFamily: "EuclidCircularA-Regular" }}
            >
              Rezervă-ți locul la frizer
            </Text>
          </View>

          {/* Chevron */}
          <Ionicons name="chevron-forward" size={20} color={Colors.gradientStart} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── AppointmentsEmptyState ───────────────────────────────────────────────────

export function AppointmentsEmptyState() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      className="items-center px-6 pt-10 pb-4"
    >
      {/* Calendar icon */}
      <View className="mb-5 items-center justify-center">
        <Ionicons name="calendar-outline" size={56} color={Colors.textSecondary} />
      </View>

      {/* Heading */}
      <Text
        className="text-lg font-bold text-center mb-2"
        style={{ color: Colors.text, fontFamily: "EuclidCircularA-Bold" }}
      >
        Nicio programare încă
      </Text>

      {/* Subtitle */}
      <Text
        className="text-sm text-center mb-6"
        style={{ color: Colors.textSecondary, fontFamily: "EuclidCircularA-Regular" }}
      >
        Rezervă-ți prima programare la frizer
      </Text>

      {/* CTA button */}
      <Animated.View style={animatedStyle}>
        <Pressable
          onPressIn={() => {
            scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 18, stiffness: 320 });
          }}
          onPress={() => router.push("/book-appointment")}
          className="flex-row items-center justify-center px-6"
          style={[
            Bubble.radii,
            {
              height: 48,
              backgroundColor: Colors.gradientStart,
              gap: 8,
              minWidth: 200,
            },
          ]}
        >
          <Ionicons name="add-circle" size={20} color={Colors.white} />
          <Text
            style={{ color: Colors.white, fontFamily: "EuclidCircularA-SemiBold", fontSize: 16 }}
          >
            Programare nouă
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─── TabEmptyState ────────────────────────────────────────────────────────────

interface TabEmptyStateProps {
  tab: "upcoming" | "past";
}

export function TabEmptyState({ tab }: TabEmptyStateProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isUpcomingTab = tab === "upcoming";

  const icon: React.ComponentProps<typeof Ionicons>["name"] = isUpcomingTab
    ? "calendar-outline"
    : "time-outline";
  const title = isUpcomingTab ? "Nicio programare viitoare" : "Nicio programare anterioară";
  const subtitle = isUpcomingTab
    ? "Rezervă o programare nouă"
    : "Istoricul va apărea aici";

  return (
    <Animated.View
      entering={FadeInDown.delay(100).springify()}
      className="items-center px-6 pt-8 pb-4"
    >
      {/* Compact icon */}
      <View className="mb-4 items-center justify-center">
        <Ionicons name={icon} size={40} color={Colors.textSecondary} />
      </View>

      {/* Heading */}
      <Text
        className="text-base font-semibold text-center mb-1"
        style={{ color: Colors.text, fontFamily: "EuclidCircularA-SemiBold" }}
      >
        {title}
      </Text>

      {/* Subtitle */}
      <Text
        className="text-sm text-center"
        style={{ color: Colors.textSecondary, fontFamily: "EuclidCircularA-Regular" }}
        numberOfLines={2}
      >
        {subtitle}
      </Text>

      {/* CTA only for upcoming tab */}
      {isUpcomingTab && (
        <Animated.View style={[animatedStyle, { marginTop: 20 }]}>
          <Pressable
            onPressIn={() => {
              scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
            }}
            onPressOut={() => {
              scale.value = withSpring(1, { damping: 18, stiffness: 320 });
            }}
            onPress={() => router.push("/book-appointment")}
            className="flex-row items-center justify-center px-5"
            style={[
              Bubble.radii,
              {
                height: 44,
                backgroundColor: Colors.gradientStart,
                gap: 7,
                minWidth: 180,
              },
            ]}
          >
            <Ionicons name="add-circle" size={18} color={Colors.white} />
            <Text
              style={{ color: Colors.white, fontFamily: "EuclidCircularA-SemiBold", fontSize: 15 }}
            >
              Programare nouă
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}
