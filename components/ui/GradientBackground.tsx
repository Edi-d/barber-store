/**
 * GradientBackground — subtle gradient backdrop wrapper used by every
 * marketplace screen. Ported verbatim from:
 *   Tapzi-barber/components/ui/gradient-background.tsx
 *
 * Differences from source:
 *  - Named export (source uses named export too)
 *  - `static` prop renamed to `isStatic` internally; public API kept identical
 */

import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

type BlobPosition = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type Props = {
  children: ReactNode;
  /** Override position for the blue blob (default: top-left) */
  blob1?: BlobPosition;
  /** Override position for the indigo blob (default: bottom-right) */
  blob2?: BlobPosition;
  /** When true, blobs animate in with a subtle scale + fade on mount */
  animateBlobs?: boolean;
  /**
   * When true, skip SVG blobs entirely.
   * Use on heavy list screens to save GPU/CPU.
   */
  static?: boolean;
};

export function GradientBackground({
  children,
  blob1,
  blob2,
  animateBlobs,
  static: isStatic,
}: Props) {
  if (isStatic) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#EDF1F7', '#F0F4F8', '#EEF1F6', '#F0F4F8']}
          locations={[0, 0.35, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  return (
    <GradientBackgroundFull blob1={blob1} blob2={blob2} animateBlobs={animateBlobs}>
      {children}
    </GradientBackgroundFull>
  );
}

/** Full version with SVG blobs — extracted so `static` mode avoids hook allocation entirely */
function GradientBackgroundFull({
  children,
  blob1,
  blob2,
  animateBlobs,
}: Omit<Props, 'static'>) {
  const b1 = blob1 ?? { top: -160, left: -100 };
  const b2 = blob2 ?? { bottom: -140, right: -120 };

  const blob1Progress = useSharedValue(animateBlobs ? 0 : 1);
  const blob2Progress = useSharedValue(animateBlobs ? 0 : 1);

  useEffect(() => {
    if (animateBlobs) {
      const timingConfig = { duration: 800, easing: Easing.out(Easing.cubic) };
      blob1Progress.value = withTiming(1, timingConfig);
      blob2Progress.value = withDelay(50, withTiming(1, timingConfig));
    }
  }, [animateBlobs, blob1Progress, blob2Progress]);

  const blob1Style = useAnimatedStyle(() => ({
    opacity: blob1Progress.value,
    transform: [{ scale: 0.8 + blob1Progress.value * 0.2 }],
  }));

  const blob2Style = useAnimatedStyle(() => ({
    opacity: blob2Progress.value,
    transform: [{ scale: 0.85 + blob2Progress.value * 0.15 }],
  }));

  return (
    <View style={styles.container}>
      {/* Fixed gradient — covers full viewport */}
      <LinearGradient
        colors={['#EDF1F7', '#F0F4F8', '#EEF1F6', '#F0F4F8']}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Blue blob — top area */}
      <Animated.View style={[styles.blob, b1, animateBlobs && blob1Style]}>
        <Svg width={500} height={500}>
          <Defs>
            <RadialGradient id="bgBlob1" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#4481EB" stopOpacity={0.4} />
              <Stop offset="40%" stopColor="#4481EB" stopOpacity={0.2} />
              <Stop offset="70%" stopColor="#4481EB" stopOpacity={0.07} />
              <Stop offset="100%" stopColor="#4481EB" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="250" cy="250" r="250" fill="url(#bgBlob1)" />
        </Svg>
      </Animated.View>

      {/* Soft blue wash — mid-screen, keeps the gradient feeling alive */}
      <View style={styles.midBlob}>
        <Svg width={600} height={600}>
          <Defs>
            <RadialGradient id="bgBlobMid" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#4481EB" stopOpacity={0.12} />
              <Stop offset="50%" stopColor="#4481EB" stopOpacity={0.04} />
              <Stop offset="100%" stopColor="#4481EB" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="300" cy="300" r="300" fill="url(#bgBlobMid)" />
        </Svg>
      </View>

      {/* Indigo blob — bottom area */}
      <Animated.View style={[styles.blob, b2, animateBlobs && blob2Style]}>
        <Svg width={500} height={500}>
          <Defs>
            <RadialGradient id="bgBlob2" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#6366F1" stopOpacity={0.34} />
              <Stop offset="40%" stopColor="#6366F1" stopOpacity={0.14} />
              <Stop offset="70%" stopColor="#6366F1" stopOpacity={0.04} />
              <Stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="250" cy="250" r="250" fill="url(#bgBlob2)" />
        </Svg>
      </Animated.View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  blob: {
    position: 'absolute',
    width: 500,
    height: 500,
  },
  midBlob: {
    position: 'absolute',
    top: '25%',
    left: -100,
    width: 600,
    height: 600,
  },
});
