import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

interface ProductFeaturesProps {
  inStock: boolean;
  brand?: string;
}

export default function ProductFeatures({ inStock, brand }: ProductFeaturesProps) {
  const features: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    iconColor: string;
    label: string;
  }[] = [
    {
      icon: inStock ? 'checkmark-circle-outline' : 'close-circle-outline',
      iconColor: inStock ? Colors.success : Colors.error,
      label: inStock ? 'In stoc' : 'Indisponibil',
    },
    {
      icon: 'car-outline',
      iconColor: Colors.primary,
      label: 'Livrare rapida',
    },
    {
      icon: 'ribbon-outline',
      iconColor: Colors.primary,
      label: brand ?? 'Calitate garantata',
    },
  ];

  return (
    <Animated.View
      entering={FadeInDown.duration(400)
        .delay(200)
        .easing(SMOOTH)
        .withInitialValues({ transform: [{ translateY: 12 }] })}
      style={styles.container}
    >
      {features.map((feature, index) => (
        <React.Fragment key={feature.icon}>
          {index > 0 && (
            <View style={[styles.divider, { backgroundColor: Colors.separator }]} />
          )}
          <View style={styles.item}>
            <View style={[styles.iconCircle, { backgroundColor: Colors.primaryMuted }]}>
              <Ionicons name={feature.icon} size={18} color={feature.iconColor} />
            </View>
            <Text
              style={[styles.label, { color: Colors.textSecondary }]}
              numberOfLines={1}
            >
              {feature.label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: 28,
  },
  label: {
    fontFamily: 'EuclidCircularA-Medium',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
});
