import { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  interpolateColor,
  useDerivedValue,
  Easing,
} from "react-native-reanimated";
import { Brand, Spacing, Shadows, Bubble, Typography } from "@/constants/theme";

interface TabItem {
  id: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface SlidingTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabPress: (tab: TabItem) => void;
}

const SPRING = { damping: 20, stiffness: 200, mass: 0.4 };
const GAP = 8;
const PADDING_H = 16;

function AnimatedPill({
  tab,
  isActive,
  onPress,
  width,
  index,
}: {
  tab: TabItem;
  isActive: boolean;
  onPress: () => void;
  width: number;
  index: number;
}) {
  const progress = useSharedValue(isActive ? 1 : 0);
  progress.value = withSpring(isActive ? 1 : 0, SPRING);

  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withDelay(
      80 * index,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 20 },
      { scale: 0.92 + entrance.value * 0.08 },
    ],
  }));

  const borderColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(255,255,255,0.6)", Brand.primary]
    )
  );

  const pillStyle = useAnimatedStyle(() => ({
    borderColor: borderColor.value,
    transform: [{ scale: withSpring(isActive ? 1.02 : 1, SPRING) }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, entranceStyle]}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
      >
        <Animated.View style={[styles.pillOuter, Shadows.sm, pillStyle]}>
          <BlurView
            intensity={isActive ? 30 : 50}
            tint="light"
            style={[
              styles.pill,
              isActive && styles.pillActive,
            ]}
          >
            {tab.icon && (
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? Brand.primary : "#8E8E93"}
                style={{ marginRight: 5 }}
              />
            )}
            <Text
              style={[
                styles.pillLabel,
                { color: isActive ? Brand.primary : "#191919" },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </BlurView>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function SlidingTabs({ tabs, activeTab, onTabPress }: SlidingTabsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {tabs.map((tab, i) => (
          <AnimatedPill
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTab}
            onPress={() => onTabPress(tab)}
            width={0}
            index={i}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    backgroundColor: "#F0F4F8",
  },
  grid: {
    flexDirection: "row",
    paddingHorizontal: PADDING_H,
    gap: GAP,
  },
  pillOuter: {
    ...Bubble.radiiSm,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    ...Bubble.radiiSm,
    ...Bubble.accent,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  pillActive: {
    backgroundColor: "rgba(239,246,255,0.85)",
  },
  pillLabel: {
    fontFamily: "EuclidCircularA-SemiBold",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
});
