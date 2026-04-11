import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useUIStore } from '@/stores/uiStore';

// ---------------------------------------------------------------------------
// Spring / timing configs
// ---------------------------------------------------------------------------

const SPRING_FAB_PRESS_IN = { damping: 10, stiffness: 260, mass: 0.5 };
const SPRING_FAB_PRESS_OUT = { damping: 12, stiffness: 220, mass: 0.5 };
const SPRING_FAB_ROTATION = { damping: 18, stiffness: 240, mass: 0.7 };
const SPRING_MENU_OPEN = { damping: 22, stiffness: 200, mass: 0.8 };
const SPRING_MENU_CLOSE = { damping: 28, stiffness: 340, mass: 0.5 };
const TIMING_BACKDROP_OPEN = 220;
const TIMING_BACKDROP_CLOSE = 160;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function useCreateMenu() {
  const { createMenuOpen, setCreateMenuOpen } = useUIStore();

  // Shared values
  const fabRotation = useSharedValue(0);   // 0 → 1 (maps to 0deg → 45deg in style)
  const fabScale = useSharedValue(1);      // internal press feedback
  const menuProgress = useSharedValue(0);  // 0 → 1 drives item stagger
  const backdropOpacity = useSharedValue(0); // 0 → 0.5

  // ---------------------------------------------------------------------------
  // Animated styles
  // ---------------------------------------------------------------------------

  const fabAnimatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      fabRotation.value,
      [0, 1],
      [0, 45],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { rotate: `${rotate}deg` },
        { scale: fabScale.value },
      ],
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // ---------------------------------------------------------------------------
  // Per-item animated style (stagger via interpolate ranges)
  // ---------------------------------------------------------------------------

  /**
   * Returns an animated style for a menu item at `index` out of `total`.
   *
   * Input range for each item i: [i*0.1, i*0.1 + 0.6]
   * Output: translateY 20→0, scale 0.75→1, opacity 0→1
   *
   * When closing, menuProgress goes 1→0 so the interpolation naturally reverses.
   */
  const getItemAnimatedStyle = useCallback(
    (index: number, _total?: number) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useAnimatedStyle(() => {
        const inputStart = index * 0.1;
        const inputEnd = inputStart + 0.6;

        const progress = interpolate(
          menuProgress.value,
          [inputStart, inputEnd],
          [0, 1],
          Extrapolation.CLAMP,
        );

        return {
          opacity: progress,
          transform: [
            { translateY: interpolate(progress, [0, 1], [16, 0], Extrapolation.CLAMP) },
            { scale: interpolate(progress, [0, 1], [0.92, 1], Extrapolation.CLAMP) },
          ],
        };
      });
    },
    // menuProgress is a stable shared value reference — no deps needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------

  const openMenu = useCallback(() => {
    setCreateMenuOpen(true);

    // Haptic feedback on open
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);

    // FAB rotates to 45 deg
    fabRotation.value = withSpring(1, SPRING_FAB_ROTATION);

    // Backdrop fades in
    backdropOpacity.value = withTiming(0.75, { duration: TIMING_BACKDROP_OPEN });

    // Menu items animate in
    menuProgress.value = withSpring(1, SPRING_MENU_OPEN);
  }, [fabRotation, backdropOpacity, menuProgress, setCreateMenuOpen]);

  const closeMenu = useCallback(
    (callback?: () => void) => {
      setCreateMenuOpen(false);

      // Haptic feedback on close
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);

      // FAB rotates back to 0
      fabRotation.value = withSpring(0, SPRING_FAB_ROTATION);

      // Menu items animate out
      menuProgress.value = withSpring(0, SPRING_MENU_CLOSE);

      // Backdrop fades out — callback fires after it completes
      backdropOpacity.value = withTiming(
        0,
        { duration: TIMING_BACKDROP_CLOSE },
        (finished) => {
          if (finished && callback) {
            runOnJS(callback)();
          }
        },
      );
    },
    [fabRotation, backdropOpacity, menuProgress, setCreateMenuOpen],
  );

  // ---------------------------------------------------------------------------
  // FAB press feedback
  // ---------------------------------------------------------------------------

  const onFabPressIn = useCallback(() => {
    fabScale.value = withSpring(0.88, SPRING_FAB_PRESS_IN);
  }, [fabScale]);

  const onFabPressOut = useCallback(() => {
    fabScale.value = withSpring(1, SPRING_FAB_PRESS_OUT);
  }, [fabScale]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    // Shared values (for consumers that need to drive additional animations)
    fabRotation,
    menuProgress,
    backdropOpacity,
    // Animated styles
    fabAnimatedStyle,
    backdropAnimatedStyle,
    // Per-item style factory
    getItemAnimatedStyle,
    // Actions
    openMenu,
    closeMenu,
    onFabPressIn,
    onFabPressOut,
    // Derived state (convenience)
    isOpen: createMenuOpen,
  };
}
