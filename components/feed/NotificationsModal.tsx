import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Image,
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  FlatList,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  FadeIn,
} from 'react-native-reanimated';

import { useNotifications, NotificationData, NotificationType } from '@/hooks/useNotifications';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Bubble } from '@/constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.82;
const SPRING = { damping: 22, stiffness: 200, mass: 0.8 };

// ─── Notification config ──────────────────────────────────────────────────────

const NOTIF_CFG: Record<string, { icon: string; color: string; label: string }> = {
  like:                 { icon: 'heart',            color: '#E53935', label: 'a apreciat postarea ta' },
  comment:              { icon: 'chatbubble',        color: Colors.primary, label: 'a comentat la postarea ta' },
  reply:                { icon: 'arrow-undo',        color: Colors.primary, label: 'a raspuns la comentariul tau' },
  follow:               { icon: 'person-add',        color: Colors.indigo, label: 'a inceput sa te urmareasca' },
  mention:              { icon: 'at',                color: '#F59E0B', label: 'te-a mentionat' },
  live:                 { icon: 'videocam',          color: '#E53935', label: 'a inceput un live' },
  appointment_reminder: { icon: 'calendar',          color: '#2E7D32', label: 'ai o programare in curand' },
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type FilterTab = 'toate' | 'social' | 'urmariri' | 'live' | 'programari';

const TABS: { key: FilterTab; label: string; icon: string }[] = [
  { key: 'toate',      label: 'Toate',      icon: 'apps-outline' },
  { key: 'social',     label: 'Social',     icon: 'heart-outline' },
  { key: 'urmariri',   label: 'Urmariri',   icon: 'people-outline' },
  { key: 'live',       label: 'Live',       icon: 'videocam-outline' },
  { key: 'programari', label: 'Programari', icon: 'calendar-outline' },
];

const SOCIAL_TYPES: NotificationType[] = ['like', 'comment', 'reply', 'mention'];

function filterItems(items: NotificationData[], tab: FilterTab): NotificationData[] {
  switch (tab) {
    case 'social':     return items.filter((n) => SOCIAL_TYPES.includes(n.type));
    case 'urmariri':   return items.filter((n) => n.type === 'follow');
    case 'live':       return items.filter((n) => n.type === 'live');
    case 'programari': return items.filter((n) => n.type === 'appointment_reminder');
    default:           return items;
  }
}

// ─── Navigation resolver ──────────────────────────────────────────────────────

function resolveNotificationRoute(
  type: NotificationType,
  target_type: string | null,
  target_id: string | null,
  actor_id: string
): string {
  if (type === 'follow') return `/profile/${actor_id}`;
  if (type === 'live' && target_id) return `/live/${target_id}`;
  // like / comment / reply / mention — no dedicated post route yet
  return '/(tabs)/feed';
}

// ─── Empty state per tab ──────────────────────────────────────────────────────

const EMPTY_STATE: Record<FilterTab, { icon: string; title: string; subtitle: string }> = {
  toate:      { icon: 'notifications-outline',  title: 'Nicio notificare', subtitle: 'Vei fi notificat cand cineva interactioneaza cu tine.' },
  social:     { icon: 'heart-outline',          title: 'Nicio interactiune', subtitle: 'Apar aicii aprecierile, comentariile si mentiunile tale.' },
  urmariri:   { icon: 'people-outline',         title: 'Niciun nou urmaritor', subtitle: 'Cand cineva incepe sa te urmareasca vei fi notificat.' },
  live:       { icon: 'videocam-outline',        title: 'Niciun live recent', subtitle: 'Vei fi notificat cand un creator porneste un live.' },
  programari: { icon: 'calendar-outline',        title: 'Nicio programare', subtitle: 'Vei primi remindere inainte de programarile tale.' },
};

// ─── Follow button ────────────────────────────────────────────────────────────

function FollowBtn({ actorId }: { actorId: string }) {
  const session = useAuthStore((s) => s.session);
  const [following, setFollowing] = useState<boolean | null>(null); // null = loading
  const [busy, setBusy] = useState(false);

  // Query current follow state on mount
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', session.user.id)
      .eq('following_id', actorId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFollowing(!!data);
      });

    return () => { cancelled = true; };
  }, [session, actorId]);

  const toggle = useCallback(async () => {
    if (!session || busy || following === null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true);
    try {
      if (following) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', session.user.id)
          .eq('following_id', actorId);
        setFollowing(false);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: session.user.id, following_id: actorId });
        setFollowing(true);
      }
    } finally {
      setBusy(false);
    }
  }, [session, actorId, following, busy]);

  if (following === null) {
    return (
      <View style={st.followBtnOutline}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.7} disabled={busy}>
      {following ? (
        <View style={st.followBtnOutline}>
          <Text style={st.followBtnOutlineText}>Urmaresti</Text>
        </View>
      ) : (
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={st.followBtnGrad}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={st.followBtnGradText}>Urmareste</Text>
          )}
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotifRow({
  item,
  onPress,
}: {
  item: NotificationData;
  onPress: (item: NotificationData) => void;
}) {
  const cfg = NOTIF_CFG[item.type] ?? NOTIF_CFG.like;
  const initial = (item.actor_name?.[0] ?? '?').toUpperCase();
  const isUnread = !item.read;

  // Fade-out animation for unread background when read
  const bgOpacity = useSharedValue(isUnread ? 1 : 0);
  const prevRead = useRef(item.read);

  useEffect(() => {
    if (!prevRead.current && item.read) {
      // Transition from unread → read: fade out the tint
      bgOpacity.value = withTiming(0, { duration: 500 });
    }
    prevRead.current = item.read;
  }, [item.read]);

  const unreadBgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  return (
    <Pressable
      onPress={() => onPress(item)}
      className="active:opacity-80"
    >
      <View style={nr.row}>
        {/* Unread accent bar */}
        {isUnread && <View style={nr.accentBar} />}

        {/* Unread bg tint — fades out on markRead */}
        <Animated.View style={[StyleSheet.absoluteFillObject, nr.unreadBg, unreadBgStyle]} />

        {/* Avatar */}
        <View style={nr.avatarBox}>
          {item.actor_avatar ? (
            <Image source={{ uri: item.actor_avatar }} style={nr.avatarImg} />
          ) : (
            <View style={nr.avatarFallback}>
              <Text style={nr.avatarLetter}>{initial}</Text>
            </View>
          )}
          <View style={[nr.typeBadge, { backgroundColor: cfg.color }]}>
            <Ionicons name={cfg.icon as any} size={10} color="#fff" />
          </View>
        </View>

        {/* Content */}
        <View style={nr.body}>
          <Text style={nr.bodyText} numberOfLines={2}>
            <Text style={isUnread ? nr.nameBold : nr.nameSemi}>{item.actor_name} </Text>
            {item.body ?? cfg.label}
          </Text>
          <Text style={isUnread ? nr.timeUnread : nr.timeRead}>{item.time_ago}</Text>
        </View>

        {/* Follow back */}
        {item.type === 'follow' && <FollowBtn actorId={item.actor_id} />}
      </View>
    </Pressable>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function NotificationsModal({ visible, onClose }: NotificationsModalProps) {
  const insets = useSafeAreaInsets();
  const {
    notifications,
    unreadCount,
    loading,
    isFetchingNextPage,
    hasNextPage,
    markRead,
    markAllRead,
    refetch,
    fetchNextPage,
  } = useNotifications();

  const [tab, setTab] = useState<FilterTab>('toate');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = filterItems(notifications, tab);

  const translateY = useSharedValue(SHEET_H);
  const backdropOp = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, SPRING);
      setTab('toate');
    } else {
      backdropOp.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(SHEET_H, {
        duration: 260,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [visible]);

  const close = useCallback(() => {
    backdropOp.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(
      SHEET_H,
      { duration: 260, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)()
    );
  }, [onClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOp.value * 0.5 }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const onNotifPress = useCallback(
    (item: NotificationData) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Mark as read immediately
      if (!item.read) {
        markRead(item.id);
      }

      const route = resolveNotificationRoute(
        item.type,
        item.target_type,
        item.target_id,
        item.actor_id
      );

      close();
      setTimeout(() => {
        router.push(route as any);
      }, 300);
    },
    [close, markRead]
  );

  const onMarkAll = useCallback(() => {
    if (unreadCount === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    markAllRead();
  }, [unreadCount, markAllRead]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const onEndReached = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  if (!visible) return null;

  const emptyState = EMPTY_STATE[tab];

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, st.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          st.sheet,
          { height: SHEET_H, paddingBottom: insets.bottom + 12 },
          sheetStyle,
        ]}
      >
        {/* Handle */}
        <View style={st.handleWrap}>
          <View style={st.handle} />
        </View>

        {/* Header */}
        <View style={st.header}>
          <View style={st.headerLeft}>
            <Text style={st.title}>Notificari</Text>
            {unreadCount > 0 && (
              <Animated.View entering={FadeIn.duration(200)}>
                <LinearGradient
                  colors={[Colors.gradientStart, Colors.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={st.countPill}
                >
                  <Text style={st.countText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </LinearGradient>
              </Animated.View>
            )}
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={onMarkAll} hitSlop={8} activeOpacity={0.6}>
              <Text style={st.markAll}>Marcheaza toate</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab bar */}
        <FlatList
          horizontal
          data={TABS}
          keyExtractor={(t) => t.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.tabRow}
          style={{ flexGrow: 0 }}
          renderItem={({ item: t }) => {
            const on = tab === t.key;
            // Count for this tab
            const tabCount = filterItems(notifications, t.key).filter(
              (n) => !n.read
            ).length;

            if (on) {
              return (
                <LinearGradient
                  colors={[Colors.gradientStart, Colors.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={st.tabChip}
                >
                  <Text style={st.tabChipOn}>{t.label}</Text>
                  {tabCount > 0 && (
                    <View style={st.tabBadgeOn}>
                      <Text style={st.tabBadgeOnText}>
                        {tabCount > 9 ? '9+' : tabCount}
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              );
            }

            return (
              <TouchableOpacity
                style={st.tabChipOff}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setTab(t.key);
                }}
                activeOpacity={0.7}
              >
                <Text style={st.tabChipOffText}>{t.label}</Text>
                {tabCount > 0 && (
                  <View style={st.tabBadgeOff}>
                    <Text style={st.tabBadgeOffText}>
                      {tabCount > 9 ? '9+' : tabCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />

        {/* Divider */}
        <View style={st.divider} />

        {/* List */}
        {loading ? (
          <View style={st.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={filtered.length === 0 ? st.emptyContainer : { paddingVertical: 4 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Colors.primary}
              />
            }
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
            renderItem={({ item }) => (
              <NotifRow item={item} onPress={onNotifPress} />
            )}
            ListEmptyComponent={
              <View style={st.center}>
                <Ionicons
                  name={emptyState.icon as any}
                  size={44}
                  color={Colors.textTertiary}
                />
                <Text style={st.emptyTitle}>{emptyState.title}</Text>
                <Text style={st.emptySub}>{emptyState.subtitle}</Text>
              </View>
            }
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : null
            }
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  backdrop: { backgroundColor: '#000' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    ...Bubble.sheetRadii,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.handleBar },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 20,
    color: Colors.text,
  },
  countPill: {
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 11,
    color: '#fff',
    lineHeight: 16,
  },
  markAll: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },

  tabRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...Bubble.radiiSm,
  },
  tabChipOn: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    color: '#fff',
  },
  tabChipOff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...Bubble.radiiSm,
    borderWidth: 1.5,
    borderColor: Colors.separator,
    backgroundColor: Colors.white,
  },
  tabChipOffText: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tabBadgeOn: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 99,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeOnText: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 10,
    color: '#fff',
    lineHeight: 14,
  },
  tabBadgeOff: {
    backgroundColor: Colors.gradientStart,
    borderRadius: 99,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeOffText: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 10,
    color: '#fff',
    lineHeight: 14,
  },

  divider: { height: 1, backgroundColor: Colors.separator, marginHorizontal: 20 },

  followBtnGrad: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...Bubble.radiiSm,
    alignItems: 'center',
    minWidth: 92,
  },
  followBtnGradText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    color: '#fff',
  },
  followBtnOutline: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...Bubble.radiiSm,
    borderWidth: 1.5,
    borderColor: Colors.separator,
    alignItems: 'center',
    minWidth: 92,
  },
  followBtnOutlineText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    color: Colors.textSecondary,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyContainer: { flex: 1 },
  emptyTitle: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

// ─── Notification Row styles ──────────────────────────────────────────────────

const nr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 20,
    paddingVertical: 12,
    gap: 12,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.gradientStart,
  },
  unreadBg: {
    backgroundColor: 'rgba(68,129,235,0.05)',
  },
  avatarBox: { width: 48, height: 48, flexShrink: 0 },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 18,
    color: Colors.primary,
  },
  typeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: Colors.white,
  },
  body: { flex: 1, gap: 3 },
  bodyText: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  nameBold: { fontFamily: 'EuclidCircularA-Bold', color: Colors.text },
  nameSemi: { fontFamily: 'EuclidCircularA-SemiBold', color: Colors.text },
  timeUnread: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 12,
    color: Colors.gradientStart,
  },
  timeRead: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 12,
    color: Colors.textTertiary,
  },
});
