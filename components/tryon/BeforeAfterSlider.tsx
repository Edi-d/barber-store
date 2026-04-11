import React, { useCallback, useRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Brand, Bubble, Colors, Shadows, Typography } from '@/constants/theme';

interface BeforeAfterSliderProps {
  beforeUri: string;
  afterUri: string;
  width: number;
  height: number;
  fullBleed?: boolean;
}

const HANDLE_SIZE_DEFAULT = 40;
const HANDLE_SIZE_FULL_BLEED = 44;
const CLAMP_RATIO_MIN = 0.02;
const CLAMP_RATIO_MAX = 0.98;

export default function BeforeAfterSlider({
  beforeUri,
  afterUri,
  width,
  height,
  fullBleed = false,
}: BeforeAfterSliderProps) {
  const handleSize = fullBleed ? HANDLE_SIZE_FULL_BLEED : HANDLE_SIZE_DEFAULT;

  const minX = width * CLAMP_RATIO_MIN;
  const maxX = width * CLAMP_RATIO_MAX;
  const centerX = width * 0.5;

  const handleX = useSharedValue(centerX);
  const hasCrossedCenter = useRef(false);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const checkCenterCross = (x: number) => {
    'worklet';
    const isNowPastCenter = x >= centerX;
    if (isNowPastCenter !== hasCrossedCenter.current) {
      hasCrossedCenter.current = isNowPastCenter;
      runOnJS(triggerHaptic)();
    }
  };

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onUpdate((event) => {
      const next = clamp(event.x, minX, maxX);
      handleX.value = next;
      checkCenterCross(next);
    });

  // Clip the "before" image by animating its width
  const beforeClipStyle = useAnimatedStyle(() => ({
    width: handleX.value,
  }));

  // Translate the handle pill so its center tracks the drag position
  const handleTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: handleX.value - handleSize / 2 }],
  }));

  // The vertical line tracks the same X center
  const lineTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: handleX.value - 1 }], // 1 = half of 2px line width
  }));

  const labelTop = fullBleed ? 120 : 12;

  const labelBaseStyle = fullBleed
    ? {
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        ...Bubble.radiiSm,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }
    : {
        backgroundColor: 'rgba(255,255,255,0.22)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
      };

  const labelTextStyle = fullBleed
    ? {
        ...Typography.smallSemiBold,
        color: Colors.white,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.4,
        fontSize: 11,
      }
    : styles.labelText;

  const handleBorderStyle = fullBleed
    ? { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' }
    : {};

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[
          styles.container,
          { width, height },
          fullBleed
            ? {
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderBottomLeftRadius: 0,
              }
            : Bubble.radiiLg,
        ]}
      >
        {/* After image — full background */}
        <Image
          source={{ uri: afterUri }}
          style={[styles.image, { width, height }]}
          resizeMode="cover"
        />

        {/* Before image — clipped from left */}
        <Animated.View style={[styles.beforeClip, beforeClipStyle, { height }]}>
          <Image
            source={{ uri: beforeUri }}
            style={[styles.image, { width, height }]}
            resizeMode="cover"
          />
        </Animated.View>

        {/* Vertical divider line */}
        <Animated.View style={[styles.dividerLine, { height }, lineTranslateStyle]} />

        {/* Drag handle pill */}
        <Animated.View
          style={[
            styles.handle,
            handleTranslateStyle,
            {
              top: height / 2 - handleSize / 2,
              width: handleSize,
              height: handleSize,
              borderRadius: handleSize / 2,
            },
            handleBorderStyle,
          ]}
        >
          <Ionicons name="chevron-back" size={14} color={Brand.primary} />
          <Ionicons name="chevron-forward" size={14} color={Brand.primary} />
        </Animated.View>

        {/* Labels */}
        <View
          style={[styles.labelBefore, { top: labelTop }, labelBaseStyle]}
          pointerEvents="none"
        >
          <Text style={labelTextStyle}>Înainte</Text>
        </View>
        <View
          style={[styles.labelAfter, { top: labelTop }, labelBaseStyle]}
          pointerEvents="none"
        >
          <Text style={labelTextStyle}>După</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  beforeClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  dividerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2,
    backgroundColor: Colors.white,
  },
  handle: {
    position: 'absolute',
    left: 0,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  labelBefore: {
    position: 'absolute',
    left: 12,
  },
  labelAfter: {
    position: 'absolute',
    right: 12,
  },
  labelText: {
    ...Typography.smallSemiBold,
    color: Colors.white,
  },
});
