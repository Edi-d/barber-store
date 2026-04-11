import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '@/constants/theme';

export type ProfileTab = 'posts' | 'salon' | 'about';

interface TabDef {
  key: ProfileTab;
  label: string;
  iconActive: string;
  iconInactive: string;
}

interface ProfileTabBarProps {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  showSalonTab?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SPRING_CONFIG = { damping: 18, stiffness: 200, mass: 0.8 };

const ALL_TABS: TabDef[] = [
  { key: 'posts', label: 'Postări', iconActive: 'grid', iconInactive: 'grid-outline' },
  { key: 'salon', label: 'Salon', iconActive: 'storefront', iconInactive: 'storefront-outline' },
  { key: 'about', label: 'Despre', iconActive: 'information-circle', iconInactive: 'information-circle-outline' },
];

const TWO_TABS: TabDef[] = [
  { key: 'posts', label: 'Postări', iconActive: 'grid', iconInactive: 'grid-outline' },
  { key: 'about', label: 'Despre', iconActive: 'information-circle', iconInactive: 'information-circle-outline' },
];

export default function ProfileTabBar({ activeTab, onTabChange, showSalonTab = false }: ProfileTabBarProps) {
  const tabs = showSalonTab ? ALL_TABS : TWO_TABS;
  const TAB_WIDTH = SCREEN_WIDTH / tabs.length;
  const INDICATOR_WIDTH = TAB_WIDTH * 0.5;

  const activeIndex = tabs.findIndex((t) => t.key === activeTab);
  const safeIndex = activeIndex === -1 ? 0 : activeIndex;

  const indicatorX = useSharedValue(
    TAB_WIDTH * safeIndex + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
  );

  useEffect(() => {
    const idx = tabs.findIndex((t) => t.key === activeTab);
    const resolvedIdx = idx === -1 ? 0 : idx;
    indicatorX.value = withSpring(
      TAB_WIDTH * resolvedIdx + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
      SPRING_CONFIG,
    );
  }, [activeTab, showSalonTab]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: INDICATOR_WIDTH,
  }));

  const handlePress = (tab: ProfileTab) => {
    if (tab === activeTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabChange(tab);
  };

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => handlePress(tab.key)}
            className="flex-1 flex-row items-center justify-center gap-x-1.5 py-3"
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={(isActive ? tab.iconActive : tab.iconInactive) as any}
              size={18}
              color={isActive ? Colors.gradientStart : Colors.textTertiary}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}

      <Animated.View style={[styles.indicatorWrapper, indicatorStyle]} pointerEvents="none">
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.indicator}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  label: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textTertiary,
  },
  labelActive: {
    color: Colors.gradientStart,
  },
  indicatorWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
  },
  indicator: {
    flex: 1,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
  },
});
