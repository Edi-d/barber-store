import React, { useEffect } from 'react';
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
import { Colors } from '@/constants/theme';

interface AuthBackgroundProps {
  children: React.ReactNode;
  animateBlobs?: boolean;
}

export function AuthBackground({ children, animateBlobs = true }: AuthBackgroundProps) {
  const blob1Progress = useSharedValue(animateBlobs ? 0 : 1);
  const blob2Progress = useSharedValue(animateBlobs ? 0 : 1);

  useEffect(() => {
    if (animateBlobs) {
      const timingConfig = { duration: 800, easing: Easing.out(Easing.cubic) };
      blob1Progress.value = withTiming(1, timingConfig);
      blob2Progress.value = withDelay(50, withTiming(1, timingConfig));
    }
  }, [animateBlobs]);

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
      <LinearGradient
        colors={['#EDF1F7', '#F0F4F8', '#EEF1F6', '#F0F4F8']}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Blue blob - top right */}
      <Animated.View style={[styles.blobTopRight, animateBlobs && blob1Style]}>
        <Svg width={500} height={500}>
          <Defs>
            <RadialGradient id="blob1" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={Colors.gradientStart} stopOpacity={0.4} />
              <Stop offset="40%" stopColor={Colors.gradientStart} stopOpacity={0.2} />
              <Stop offset="70%" stopColor={Colors.gradientStart} stopOpacity={0.07} />
              <Stop offset="100%" stopColor={Colors.gradientStart} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={250} cy={250} r={250} fill="url(#blob1)" />
        </Svg>
      </Animated.View>

      {/* Soft blue wash - mid screen */}
      <View style={styles.midBlob}>
        <Svg width={600} height={600}>
          <Defs>
            <RadialGradient id="blobMid" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={Colors.gradientStart} stopOpacity={0.12} />
              <Stop offset="50%" stopColor={Colors.gradientStart} stopOpacity={0.04} />
              <Stop offset="100%" stopColor={Colors.gradientStart} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={300} cy={300} r={300} fill="url(#blobMid)" />
        </Svg>
      </View>

      {/* Indigo blob - bottom left */}
      <Animated.View style={[styles.blobBottomLeft, animateBlobs && blob2Style]}>
        <Svg width={500} height={500}>
          <Defs>
            <RadialGradient id="blob2" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={Colors.indigo} stopOpacity={0.34} />
              <Stop offset="40%" stopColor={Colors.indigo} stopOpacity={0.14} />
              <Stop offset="70%" stopColor={Colors.indigo} stopOpacity={0.04} />
              <Stop offset="100%" stopColor={Colors.indigo} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={250} cy={250} r={250} fill="url(#blob2)" />
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
  blobTopRight: {
    position: 'absolute',
    top: -120,
    right: -120,
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
  blobBottomLeft: {
    position: 'absolute',
    bottom: -100,
    left: -140,
    width: 500,
    height: 500,
  },
});
