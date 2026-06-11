import { useEffect } from 'react';
import { View, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProfileTab = 'posts' | 'salon' | 'about';

interface TabDef {
  key: ProfileTab;
  iconActive: string;
  iconInactive: string;
  label: string; // kept for a11y
}

interface ProfileTabBarProps {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  showSalonTab?: boolean;
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const ALL_TABS: TabDef[] = [
  { key: 'posts',  iconActive: 'grid',               iconInactive: 'grid-outline',               label: 'Postări' },
  { key: 'salon',  iconActive: 'storefront',          iconInactive: 'storefront-outline',          label: 'Salon'   },
  { key: 'about',  iconActive: 'information-circle',  iconInactive: 'information-circle-outline',  label: 'Despre'  },
];

const TWO_TABS: TabDef[] = [
  { key: 'posts',  iconActive: 'grid',               iconInactive: 'grid-outline',               label: 'Postări' },
  { key: 'about',  iconActive: 'information-circle',  iconInactive: 'information-circle-outline',  label: 'Despre'  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const SPRING_CONFIG = { damping: 20, stiffness: 220, mass: 0.7 };
const INDICATOR_FRAC = 0.36; // indicator is 36% of tab width — slim IG feel

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfileTabBar({
  activeTab,
  onTabChange,
  showSalonTab = false,
}: ProfileTabBarProps) {
  const tabs = showSalonTab ? ALL_TABS : TWO_TABS;
  const TAB_WIDTH = SCREEN_WIDTH / tabs.length;
  const INDICATOR_WIDTH = TAB_WIDTH * INDICATOR_FRAC;

  const safeIndex = Math.max(tabs.findIndex((t) => t.key === activeTab), 0);

  const indicatorX = useSharedValue(
    TAB_WIDTH * safeIndex + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
  );

  useEffect(() => {
    const idx = Math.max(tabs.findIndex((t) => t.key === activeTab), 0);
    indicatorX.value = withSpring(
      TAB_WIDTH * idx + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
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
            className="flex-1 items-center justify-center py-3"
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={(isActive ? tab.iconActive : tab.iconInactive) as any}
              size={22}
              color={isActive ? Colors.text : Colors.textTertiary}
            />
          </Pressable>
        );
      })}

      {/* Slim underline indicator — IG style, 1.5 px, Colors.text */}
      <Animated.View
        style={[styles.indicatorWrapper, indicatorStyle]}
        pointerEvents="none"
      >
        <View style={styles.indicator} />
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  indicatorWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 1.5,
  },
  indicator: {
    flex: 1,
    backgroundColor: Colors.text,
    borderRadius: 1,
  },
});
