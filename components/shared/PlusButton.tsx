import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FAB } from '@/constants/theme';

interface PlusButtonProps {
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
  fabAnimatedStyle: any;
  isOpen: boolean;
  containerStyle?: any;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export default function PlusButton({
  onPress,
  onPressIn,
  onPressOut,
  fabAnimatedStyle,
  isOpen,
  containerStyle,
}: PlusButtonProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.pedestal}>
        <Animated.View style={[fabAnimatedStyle, styles.fabAnimatedView]}>
          <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            hitSlop={HIT_SLOP}
            accessibilityLabel={isOpen ? 'Close create menu' : 'Open create menu'}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
          >
            <View style={styles.shadowOuter}>
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
              >
                <Ionicons name="add" size={26} color="#fff" />
              </LinearGradient>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -(FAB.protrusion),
    left: '50%',
    marginLeft: -(FAB.pedestalSize / 2),
    width: FAB.pedestalSize,
    zIndex: 10,
  },
  pedestal: {
    width: FAB.pedestalSize,
    height: FAB.pedestalSize,
    borderRadius: FAB.pedestalSize / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1.5,
    borderColor: FAB.pedestalBorder,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle lift shadow so the pedestal reads as a glass disc behind the gradient button
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  fabAnimatedView: {
    overflow: 'visible',
  },
  shadowOuter: {
    width: FAB.size,
    height: FAB.size,
    borderRadius: FAB.size / 2,
    ...FAB.liftShadow,
  },
  gradient: {
    width: FAB.size,
    height: FAB.size,
    borderRadius: FAB.size / 2,
    borderWidth: FAB.borderWidth,
    borderColor: FAB.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
    ...FAB.shadow,
  },
});
