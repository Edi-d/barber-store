import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '@/constants/theme';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);
const MAX_COLLAPSED_LENGTH = 150;

interface ProductDescriptionProps {
  description: string;
  categoryLabel?: string;
}

export default function ProductDescription({
  description,
  categoryLabel,
}: ProductDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  const isLong = description.length > MAX_COLLAPSED_LENGTH;
  const displayText =
    isLong && !expanded
      ? description.slice(0, MAX_COLLAPSED_LENGTH) + '...'
      : description;

  return (
    <Animated.View
      entering={FadeInDown.duration(400)
        .delay(250)
        .easing(SMOOTH)
        .withInitialValues({ transform: [{ translateY: 12 }], opacity: 0 })}
      style={styles.container}
    >
      {/* Separator */}
      <View style={[styles.separator, { backgroundColor: Colors.separator }]} />

      {/* Section header */}
      <View style={styles.header}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
        <Animated.Text style={[styles.headerText, { color: Colors.text }]}>
          Despre produs
        </Animated.Text>
      </View>

      {/* Description text */}
      <Animated.Text style={[styles.description, { color: Colors.textSecondary }]}>
        {displayText}
      </Animated.Text>

      {isLong && (
        <Pressable onPress={() => setExpanded((prev) => !prev)}>
          <Animated.Text style={[styles.toggle, { color: Colors.primary }]}>
            {expanded ? 'Citeste mai putin' : 'Citeste mai mult'}
          </Animated.Text>
        </Pressable>
      )}

      {/* Details row */}
      {categoryLabel ? (
        <View style={styles.detailsRow}>
          <View style={[styles.categoryPill, { backgroundColor: Colors.primaryMuted }]}>
            <Animated.Text style={[styles.categoryText, { color: Colors.primary }]}>
              {categoryLabel}
            </Animated.Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
    paddingHorizontal: 20,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  headerText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 16,
  },
  description: {
    ...Typography.body,
  },
  toggle: {
    fontFamily: 'EuclidCircularA-Medium',
    fontSize: 14,
    marginTop: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
  },
  categoryPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryText: {
    ...Typography.smallSemiBold,
  },
});
