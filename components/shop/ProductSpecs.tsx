import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { ProductSpecGroup } from '@/lib/nop-catalog';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

interface ProductSpecsProps {
  groups: ProductSpecGroup[];
}

export default function ProductSpecs({ groups }: ProductSpecsProps) {
  // Keep only groups that actually have rows.
  const visibleGroups = (groups ?? []).filter((g) => g.specs && g.specs.length > 0);

  if (visibleGroups.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(400)
        .delay(300)
        .easing(SMOOTH)
        .withInitialValues({ transform: [{ translateY: 12 }], opacity: 0 })}
      style={styles.container}
    >
      {/* Separator */}
      <View style={[styles.separator, { backgroundColor: Colors.separator }]} />

      {/* Section header */}
      <View style={styles.header}>
        <Ionicons name="list-outline" size={16} color={Colors.primary} />
        <Text style={[styles.headerText, { color: Colors.text }]}>
          Specificatii
        </Text>
      </View>

      {/* Spec groups */}
      {visibleGroups.map((group, gi) => (
        <View key={group.name ?? `group-${gi}`} style={gi > 0 ? styles.groupSpacing : undefined}>
          {group.name ? (
            <Text style={[styles.groupName, { color: Colors.textSecondary }]}>
              {group.name}
            </Text>
          ) : null}

          {group.specs.map((spec, si) => (
            <View
              key={`${spec.label}-${si}`}
              style={[
                styles.row,
                si > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: Colors.separator,
                },
              ]}
            >
              <Text style={[styles.label, { color: Colors.textSecondary }]} numberOfLines={2}>
                {spec.label}
              </Text>
              <Text style={[styles.value, { color: Colors.text }]}>
                {spec.value}
              </Text>
            </View>
          ))}
        </View>
      ))}
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
  groupSpacing: {
    marginTop: 16,
  },
  groupName: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 10,
  },
  label: {
    ...Typography.body,
    flexShrink: 1,
  },
  value: {
    ...Typography.body,
    fontFamily: 'EuclidCircularA-Medium',
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '55%',
  },
});
