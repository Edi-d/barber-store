import { useEffect } from 'react';
import { View, Modal, StyleSheet, Platform, BackHandler } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import ActionMenuItem from './ActionMenuItem';
import CreateMenuBackdrop from './CreateMenuBackdrop';
import PlusButton from './PlusButton';
import { CLIENT_ACTIONS, BARBER_ACTIONS, type CreateMenuAction } from '@/data/createMenuActions';
import { Colors, Bubble, CreateMenuColors, Shadows } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateActionMenuProps {
  menuProgress: any;
  backdropAnimatedStyle: any;
  closeMenu: (callback?: () => void) => void;
  fabAnimatedStyle: any;
  onFabPressIn: () => void;
  onFabPressOut: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateActionMenu({
  menuProgress,
  backdropAnimatedStyle,
  closeMenu,
  fabAnimatedStyle,
  onFabPressIn,
  onFabPressOut,
}: CreateActionMenuProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { createMenuOpen } = useUIStore();

  const isBarberUser =
    profile?.onboarding_role === 'salon_owner' ||
    profile?.onboarding_role === 'barber' ||
    profile?.role === 'creator' ||
    profile?.role === 'admin';

  const actions: CreateMenuAction[] = isBarberUser ? BARBER_ACTIONS : CLIENT_ACTIONS;

  // ---------------------------------------------------------------------------
  // Android hardware back button
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (Platform.OS !== 'android' || !createMenuOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (createMenuOpen) { closeMenu(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [createMenuOpen, closeMenu]);

  // ---------------------------------------------------------------------------
  // Item press handler
  // ---------------------------------------------------------------------------

  const handleItemPress = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeMenu(() => router.push(route as any));
  };

  // ---------------------------------------------------------------------------
  // Per-item stagger animated style
  // ---------------------------------------------------------------------------

  const getItemStyle = (index: number) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAnimatedStyle(() => {
      const inputStart = index * 0.1;
      const inputEnd = inputStart + 0.6;
      const progress = interpolate(menuProgress.value, [inputStart, inputEnd], [0, 1], Extrapolation.CLAMP);
      return {
        opacity: progress,
        transform: [
          { translateY: interpolate(progress, [0, 1], [16, 0], Extrapolation.CLAMP) },
          { scale: interpolate(progress, [0, 1], [0.92, 1], Extrapolation.CLAMP) },
        ],
      };
    });
  };

  // ---------------------------------------------------------------------------
  // Card entrance: scale + translateY
  // ---------------------------------------------------------------------------

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(menuProgress.value, [0, 0.4], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: progress,
      transform: [
        { translateY: interpolate(progress, [0, 1], [20, 0], Extrapolation.CLAMP) },
        { scale: interpolate(progress, [0, 1], [0.96, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  // ---------------------------------------------------------------------------
  // Position above FAB: tabBarBottom + barHeight + protrusion + 10px gap
  // ---------------------------------------------------------------------------

  const tabBarBottom = Math.max(insets.bottom - 12, 6);
  const bottomOffset = tabBarBottom + 70 + 14 + 10;

  // ---------------------------------------------------------------------------
  // Card content — shared between iOS BlurView and Android solid View
  // ---------------------------------------------------------------------------

  const cardContent = (
    <>
      {/* Inner glow — specular highlight at top of card */}
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        style={styles.innerGlow}
        pointerEvents="none"
      />

      {/* Action items */}
      <View style={styles.itemsContainer}>
        {actions.map((action, index) => {
          const colors = CreateMenuColors[action.colorKey as keyof typeof CreateMenuColors];
          return (
            <Animated.View key={action.id} style={getItemStyle(index)}>
              <ActionMenuItem
                icon={action.icon}
                label={action.label}
                iconColor={colors?.icon ?? Colors.primary}
                iconBg={colors?.bg ?? 'rgba(0,0,0,0.05)'}
                onPress={() => handleItemPress(action.route)}
                isLast={index === actions.length - 1}
              />
            </Animated.View>
          );
        })}
      </View>

      <View style={{ height: 8 }} />
    </>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      visible={createMenuOpen}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={() => closeMenu()}
    >
      <View style={styles.fullScreen}>
        {/* Backdrop */}
        <CreateMenuBackdrop
          animatedStyle={backdropAnimatedStyle}
          onPress={() => closeMenu()}
        />

        {/* FAB X button — rendered above backdrop, below card */}
        <View
          style={[
            styles.fabOverlay,
            { bottom: tabBarBottom + 70 / 2 - 28 + 14 },
          ]}
          pointerEvents="box-none"
        >
          <PlusButton
            onPress={() => closeMenu()}
            onPressIn={onFabPressIn}
            onPressOut={onFabPressOut}
            fabAnimatedStyle={fabAnimatedStyle}
            isOpen={true}
            containerStyle={{ position: 'relative', top: 0, left: 0, marginLeft: 0, width: undefined }}
          />
        </View>

        {/* Sheet card */}
        <Animated.View
          style={[styles.cardOuter, { bottom: bottomOffset }, cardAnimatedStyle]}
          accessibilityViewIsModal
        >
          <View style={styles.card}>
            {cardContent}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  fullScreen: { flex: 1 },

  cardOuter: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  card: {
    ...Bubble.floatingRadii,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as any } : {}),
    ...Shadows.glass,
  },

  innerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    zIndex: 1,
  },

  itemsContainer: {
    paddingTop: 8,
    paddingHorizontal: 4,
  },

  fabOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },


});
