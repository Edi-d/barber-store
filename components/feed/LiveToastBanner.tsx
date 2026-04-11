import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, Pressable, Image, View, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onLiveNotification, NotificationData } from '@/stores/notificationStore';
import { Colors, Bubble } from '@/constants/theme';

const BANNER_H = 72;
const DISMISS_MS = 5000;
const SPRING_IN = { damping: 18, stiffness: 260, mass: 0.7 };
const SPRING_OUT = { damping: 28, stiffness: 300, mass: 0.6 };

export function LiveToastBanner() {
  const insets = useSafeAreaInsets();
  const [notif, setNotif] = useState<NotificationData | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);

  const translateY = useSharedValue(-(BANNER_H + insets.top + 24));
  const opacity = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    translateY.value = withSpring(-(BANNER_H + insets.top + 24), SPRING_OUT);
    opacity.value = withTiming(0, { duration: 280 }, () => {
      runOnJS(setNotif)(null);
    });
  }, [insets.top]);

  const show = useCallback(
    (n: NotificationData) => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      setNotif(n);
      setLiveId(n.target_id);

      // Slide in
      translateY.value = withSpring(0, SPRING_IN);
      opacity.value = withTiming(1, { duration: 220 });

      // Auto-dismiss
      dismissTimer.current = setTimeout(() => {
        dismiss();
      }, DISMISS_MS);
    },
    [dismiss]
  );

  // Subscribe to live events from the notification store
  useEffect(() => {
    const unsub = onLiveNotification((n) => {
      show(n);
    });
    return unsub;
  }, [show]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!notif) return null;

  const initial = (notif.actor_name?.[0] ?? '?').toUpperCase();

  const handleWatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    dismiss();
    if (liveId) {
      setTimeout(() => router.push(`/live/${liveId}` as any), 220);
    }
  };

  return (
    <Animated.View
      style={[
        st.container,
        { top: insets.top + 12 },
        bannerStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={handleWatch}
        className="active:opacity-90"
        style={st.inner}
      >
        {/* Red live indicator pulse */}
        <View style={st.liveDot} />

        {/* Avatar */}
        <View style={st.avatarWrap}>
          {notif.actor_avatar ? (
            <Image source={{ uri: notif.actor_avatar }} style={st.avatar} />
          ) : (
            <View style={st.avatarFallback}>
              <Text style={st.avatarInitial}>{initial}</Text>
            </View>
          )}
          {/* Small LIVE badge on avatar */}
          <View style={st.avatarBadge}>
            <Text style={st.avatarBadgeText}>LIVE</Text>
          </View>
        </View>

        {/* Text */}
        <View style={st.textWrap}>
          <Text style={st.name} numberOfLines={1}>
            {notif.actor_name}
          </Text>
          <Text style={st.sub} numberOfLines={1}>
            tocmai a pornit un live!
          </Text>
        </View>

        {/* CTA */}
        <LinearGradient
          colors={['#E53935', '#B71C1C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={st.watchPill}
        >
          <Ionicons name="play" size={11} color="#fff" />
          <Text style={st.watchText}>Urmareste</Text>
        </LinearGradient>

        {/* Dismiss X */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          hitSlop={12}
          style={st.closeBtn}
        >
          <Ionicons name="close" size={16} color={Colors.textSecondary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 12 },
    }),
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.12)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53935',
    flexShrink: 0,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    flexShrink: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#E53935',
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E53935',
  },
  avatarInitial: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 16,
    color: Colors.primary,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -3,
    alignSelf: 'center',
    left: 4,
    right: 4,
    backgroundColor: '#E53935',
    borderRadius: 4,
    alignItems: 'center',
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  avatarBadgeText: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 7,
    color: '#fff',
    letterSpacing: 0.5,
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    color: Colors.text,
  },
  sub: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  watchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    flexShrink: 0,
  },
  watchText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 12,
    color: '#fff',
  },
  closeBtn: {
    flexShrink: 0,
    padding: 2,
  },
});
