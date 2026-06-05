import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/theme';
import type { ProductReviewSummary } from '@/lib/nop-catalog';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const STAR_COLOR = '#F59E0B';
const STAR_COUNT = 5;

interface ProductReviewsProps {
  review: ProductReviewSummary | null;
}

export default function ProductReviews({ review }: ProductReviewsProps) {
  if (!review) return null;

  const rounded = Math.round(review.average);
  const averageLabel = review.average.toFixed(review.average % 1 === 0 ? 1 : 2);
  const totalLabel = `${review.total} ${review.total === 1 ? 'recenzie' : 'recenzii'}`;

  return (
    <Animated.View
      entering={FadeInDown.duration(400)
        .delay(160)
        .easing(SMOOTH)
        .withInitialValues({ transform: [{ translateY: 12 }], opacity: 0 })}
      style={styles.container}
    >
      <View style={styles.row}>
        {/* Stars */}
        <View style={styles.stars}>
          {Array.from({ length: STAR_COUNT }).map((_, i) => {
            const filled = i < rounded;
            // Feather has no filled glyph — color signals the rating state.
            return (
              <Feather
                key={i}
                name="star"
                size={15}
                color={filled ? STAR_COLOR : Colors.textTertiary}
              />
            );
          })}
        </View>

        {/* Numeric average */}
        <Text style={[styles.average, { color: Colors.text }]}>
          {averageLabel}
        </Text>

        {/* Total count */}
        <Text style={[styles.total, { color: Colors.textTertiary }]}>
          {totalLabel}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  average: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 14,
  },
  total: {
    fontFamily: 'EuclidCircularA-Medium',
    fontSize: 13,
  },
});
