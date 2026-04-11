import { useRef, useEffect } from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { Brand, Bubble, FontFamily } from '@/constants/theme';
import type { FeedFilter } from '@/types/feed';

interface ChipConfig {
  filter: FeedFilter;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const CHIPS: ChipConfig[] = [
  { filter: 'all',       label: 'Toate',       icon: 'apps-outline'      },
  { filter: 'following', label: 'Urmăriți',    icon: 'people-outline'    },
  { filter: 'popular',   label: 'Populare',    icon: 'flame-outline'     },
  { filter: 'recent',    label: 'Recente',     icon: 'time-outline'      },
  { filter: 'images',    label: 'Imagini',     icon: 'images-outline'    },
  { filter: 'videos',    label: 'Videoclipuri',icon: 'videocam-outline'  },
];

// ─── Single animated chip ────────────────────────────────────────────────────

interface ChipProps {
  config: ChipConfig;
  isActive: boolean;
  onPress: (filter: FeedFilter) => void;
}

function FilterChip({ config, isActive, onPress }: ChipProps) {
  const progress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isActive ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.quad),
    });
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(255,255,255,0.55)', Brand.primary]
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(255,255,255,0.7)', Brand.primary]
    ),
  }));

  const iconColor = isActive ? '#ffffff' : '#64748b';
  const textColor = isActive ? '#ffffff' : '#475569';

  return (
    <Pressable onPress={() => onPress(config.filter)} className="mr-2">
      <Animated.View
        style={[
          animatedStyle,
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 13,
            paddingVertical: 7,
            borderWidth: 1,
            borderBottomWidth: 1.5,
            borderBottomColor: isActive
              ? Brand.primary
              : 'rgba(10,102,194,0.15)',
            borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
            borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
            borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
            borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
          },
        ]}
      >
        <Ionicons
          name={config.icon}
          size={14}
          color={iconColor}
          style={{ marginRight: 5 }}
        />
        <Text
          style={{
            fontFamily: isActive ? FontFamily.semiBold : FontFamily.medium,
            fontSize: 13,
            color: textColor,
            letterSpacing: 0.1,
          }}
        >
          {config.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Bar ─────────────────────────────────────────────────────────────────────

interface FilterChipBarProps {
  activeFilter: FeedFilter;
  onFilterChange: (filter: FeedFilter) => void;
  containerRef?: React.RefObject<View>;
}

export function FilterChipBar({ activeFilter, onFilterChange, containerRef }: FilterChipBarProps) {
  return (
    <View ref={containerRef} style={{ backgroundColor: '#F0F4F8' }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
      >
        {CHIPS.map((chip) => (
          <FilterChip
            key={chip.filter}
            config={chip}
            isActive={activeFilter === chip.filter}
            onPress={onFilterChange}
          />
        ))}
      </ScrollView>
    </View>
  );
}
