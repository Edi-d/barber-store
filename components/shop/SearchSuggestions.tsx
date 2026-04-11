import { useEffect, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { Brand, Colors, Spacing, Typography, Bubble, Shadows } from '@/constants/theme';
import type { Product } from '@/data/types';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const STORAGE_KEY = 'barber_recent_searches';
const MAX_RECENT = 5;
const MAX_SUGGESTIONS = 5;

type Props = {
  query: string;
  products: Product[];
  visible: boolean;
  onSelect: (text: string) => void;
};

export function SearchSuggestions({ query, products, visible, onSelect }: Props) {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const opacity = useSharedValue(0);

  // Load recent searches
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setRecentSearches(JSON.parse(raw));
      } catch {
        // ignore
      }
    })();
  }, []);

  // Animate visibility
  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 200, easing: SMOOTH });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    pointerEvents: opacity.value > 0.5 ? ('auto' as const) : ('none' as const),
  }));

  // Save a search to recent
  const saveRecent = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, MAX_RECENT);
    setRecentSearches(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }, [recentSearches]);

  const clearHistory = useCallback(async () => {
    setRecentSearches([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const handleSelect = useCallback((text: string) => {
    saveRecent(text);
    onSelect(text);
  }, [onSelect, saveRecent]);

  // Product name suggestions when typing
  const suggestions = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    const matches: string[] = [];
    for (const p of products) {
      if (matches.length >= MAX_SUGGESTIONS) break;
      if (p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)) {
        matches.push(p.name);
      }
    }
    return matches;
  }, [query, products]);

  const showRecent = query.length < 2 && recentSearches.length > 0;
  const showSuggestions = query.length >= 2 && suggestions.length > 0;

  if (!visible || (!showRecent && !showSuggestions)) return null;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <View style={[styles.shadow, Shadows.md]}>
        <BlurView
          intensity={75}
          tint="light"
          style={[
            styles.dropdown,
            {
              backgroundColor: 'rgba(255,255,255,0.88)',
              borderColor: 'rgba(255,255,255,0.7)',
            },
          ]}
        >
          {/* Recent searches */}
          {showRecent && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: Colors.textTertiary }]}>
                  Cautari recente
                </Text>
                <TouchableOpacity onPress={clearHistory} activeOpacity={0.6}>
                  <Text style={[styles.clearBtn, { color: Colors.error }]}>Sterge istoricul</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map((item, index) => (
                <TouchableOpacity
                  key={`recent-${index}`}
                  style={styles.row}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.6}
                >
                  <Feather name="clock" size={14} color={Colors.textTertiary} />
                  <Text style={[styles.rowText, { color: Colors.text }]} numberOfLines={1}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Product suggestions */}
          {showSuggestions && (
            <>
              {suggestions.map((item, index) => (
                <TouchableOpacity
                  key={`suggest-${index}`}
                  style={styles.row}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.6}
                >
                  <Feather name="search" size={14} color={Brand.primary} />
                  <Text style={[styles.rowText, { color: Colors.text }]} numberOfLines={1}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </BlurView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 44 + Spacing.sm,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 100,
  },
  shadow: {
    ...Bubble.radiiSm,
  },
  dropdown: {
    ...Bubble.radiiSm,
    ...Bubble.accent,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearBtn: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
  },
  rowText: {
    ...Typography.caption,
    flex: 1,
  },
});
