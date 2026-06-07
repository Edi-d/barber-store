/**
 * ShopStoriesRail — horizontal row of circular promo-story thumbnails shown at
 * the top of the shop screen. Reads the same useShopStories hook as the viewer
 * (one shared fetch) and delegates opening upward via onOpen(index) rather than
 * owning the viewer itself. Renders nothing when there are no stories.
 */
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useShopStories } from '@/hooks/use-shop-stories';
import { Brand, FontFamily, Spacing } from '@/constants/theme';

export function ShopStoriesRail({
  onOpen,
  label = 'Noutati',
}: {
  onOpen: (index: number) => void;
  label?: string;
}) {
  const { stories } = useShopStories();
  if (stories.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {stories.map((s, i) => (
        <Pressable
          key={s.id}
          onPress={() => onOpen(i)}
          style={({ pressed }) => [styles.item, { opacity: pressed ? 0.85 : 1 }]}
        >
          {/* Brand-primary ring around the circular thumbnail */}
          <View style={styles.ring}>
            <View style={styles.thumbClip}>
              <Image source={{ uri: s.imageUrl }} style={styles.thumb} resizeMode="cover" />
            </View>
          </View>
          <Text style={styles.caption} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const RING = 70;
const THUMB = RING - 8;

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  item: {
    width: RING,
    alignItems: 'center',
    gap: 4,
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: Brand.primary,
    backgroundColor: '#fff',
  },
  thumbClip: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    overflow: 'hidden',
    backgroundColor: '#EEF2F6',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  caption: {
    fontFamily: FontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    color: '#5B6470',
  },
});
