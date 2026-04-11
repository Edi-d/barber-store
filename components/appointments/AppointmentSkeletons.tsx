import { View, Pressable } from "react-native";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Bubble, Colors, Shadows } from "@/constants/theme";
import { Text } from "react-native";

// ─── AppointmentCardSkeleton ──────────────────────────────────────────────────

export function AppointmentCardSkeleton() {
  const opacity = useSharedValue(1);

  opacity.value = withRepeat(
    withSequence(
      withTiming(0.3, { duration: 800 }),
      withTiming(1, { duration: 800 })
    ),
    -1
  );

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: Colors.white,
          padding: 16,
          ...Bubble.radii,
          ...Shadows.sm,
        },
        pulseStyle,
      ]}
    >
      {/* Row 1: date rect left + status pill right */}
      <View className="flex-row justify-between items-center mb-4">
        {/* Calendar icon placeholder + date text block */}
        <View className="flex-row items-center gap-2">
          {/* Calendar icon box */}
          <View
            className="bg-dark-200 w-[42px] h-[42px]"
            style={{
              borderTopLeftRadius: 16,
              borderTopRightRadius: 8,
              borderBottomRightRadius: 16,
              borderBottomLeftRadius: 16,
            }}
          />
          <View className="gap-1">
            {/* Date text */}
            <View className="bg-dark-200 w-[100px] h-[16px] rounded-md" />
            {/* Time chip */}
            <View className="bg-dark-200 w-[80px] h-[12px] rounded-md" />
          </View>
        </View>

        {/* Status pill */}
        <View className="bg-dark-200 w-[70px] h-[22px] rounded-full" />
      </View>

      {/* Divider gap */}
      <View className="h-[1px] bg-dark-200 mb-3 opacity-40" />

      {/* Row 2: service name */}
      <View className="mb-4">
        <View className="bg-dark-200 w-[180px] h-[16px] rounded-md" />
      </View>

      {/* Row 3: avatar + barber name left, price right */}
      <View className="flex-row items-center gap-2">
        {/* Avatar circle */}
        <View
          className="bg-dark-200 w-[36px] h-[36px]"
          style={{
            borderTopLeftRadius: 14,
            borderTopRightRadius: 6,
            borderBottomRightRadius: 14,
            borderBottomLeftRadius: 14,
          }}
        />
        {/* Barber label + name stacked */}
        <View className="flex-1 gap-1">
          <View className="bg-dark-200 w-[40px] h-[10px] rounded-md" />
          <View className="bg-dark-200 w-[100px] h-[14px] rounded-md" />
        </View>
        {/* Price */}
        <View className="bg-dark-200 w-[50px] h-[16px] rounded-md" />
      </View>
    </Animated.View>
  );
}

// ─── AppointmentsSkeleton ─────────────────────────────────────────────────────

export function AppointmentsSkeleton() {
  return (
    <View className="flex-1 px-4 pt-4">
      {/* Section header skeleton */}
      <View className="flex-row items-center mb-3 gap-2">
        <View className="bg-dark-200 w-1 h-4 rounded-sm" />
        <View className="bg-dark-200 w-[160px] h-[18px] rounded-md" />
      </View>

      {/* 3 staggered skeleton cards */}
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          entering={FadeInDown.delay(i * 100).springify().damping(16).stiffness(180)}
          className="mb-[10px]"
        >
          <AppointmentCardSkeleton />
        </Animated.View>
      ))}
    </View>
  );
}

// ─── AppointmentsError ────────────────────────────────────────────────────────

export interface AppointmentsErrorProps {
  onRetry: () => void;
}

export function AppointmentsError({ onRetry }: AppointmentsErrorProps) {
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View className="flex-1 items-center justify-center px-8">
      <Animated.View
        entering={FadeInDown.delay(60).springify().damping(16).stiffness(180)}
        className="items-center"
      >
        {/* Alert icon */}
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={Colors.textSecondary}
        />

        {/* Primary message */}
        <Text
          className="font-semibold text-center mt-4 text-base"
          style={{ color: Colors.text, fontFamily: "EuclidCircularA-SemiBold" }}
        >
          Nu am putut încărca programările.
        </Text>

        {/* Secondary hint */}
        <Text
          className="text-center mt-2 text-sm"
          style={{
            color: Colors.textSecondary,
            fontFamily: "EuclidCircularA-Regular",
            lineHeight: 20,
          }}
        >
          Verifică conexiunea și încearcă din nou
        </Text>

        {/* Retry button */}
        <Animated.View style={[pressStyle, { marginTop: 24 }]}>
          <Pressable
            onPressIn={() => {
              scale.value = withSpring(0.93, { damping: 15, stiffness: 300 });
            }}
            onPressOut={() => {
              scale.value = withSpring(1, { damping: 15, stiffness: 300 });
            }}
            onPress={onRetry}
            style={[
              {
                backgroundColor: Colors.gradientStart,
                height: 48,
                paddingHorizontal: 28,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                ...Bubble.radii,
                ...Shadows.sm,
              },
            ]}
          >
            <Ionicons name="refresh-outline" size={20} color={Colors.white} />
            <Text
              style={{
                color: Colors.white,
                fontFamily: "EuclidCircularA-SemiBold",
                fontSize: 16,
                letterSpacing: 0.2,
              }}
            >
              Încearcă din nou
            </Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
