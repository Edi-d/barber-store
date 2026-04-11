import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';
import { ProfileHeader } from '@/components/shared/ProfileHeader';
import ProfileTabBar, { ProfileTab } from '@/components/shared/ProfileTabBar';
import ProfilePostGrid from '@/components/shared/ProfilePostGrid';
import ProfileAbout from '@/components/shared/ProfileAbout';
import ProfileActionSheet from '@/components/shared/ProfileActionSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  verified: boolean;
  followers_count: number;
  following_count: number;
  created_at: string;
};

type PostThumb = {
  id: string;
  media_url: string | null;
  thumb_url: string | null;
  likes_count: number;
  comments_count: number;
  caption: string | null;
};

type BarberInfo = {
  id: string;
  salon_id: string;
  rating_avg: number | null;
  reviews_count: number | null;
  salon: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
};

type SalonService = {
  id: string;
  name: string;
  price_cents: number;
  duration_min: number;
  currency: string;
};

function formatPrice(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(0);
  return `${amount} ${currency.toUpperCase()}`;
}

// ─── NavBar ───────────────────────────────────────────────────────────────────

interface NavBarProps {
  title: string;
  isOwnProfile: boolean;
  onMenuPress: () => void;
  onSharePress: () => void;
}

function NavBar({ title, isOwnProfile, onMenuPress, onSharePress }: NavBarProps) {
  return (
    <View style={st.navBar}>
      <Pressable
        onPress={() => router.back()}
        className="w-10 h-10 items-center justify-center"
        style={st.navIconBtn}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={20} color={Colors.text} />
      </Pressable>

      <Text style={st.navTitle} numberOfLines={1}>{title}</Text>

      <View style={st.navRight}>
        {!isOwnProfile && (
          <Pressable
            onPress={onSharePress}
            className="w-10 h-10 items-center justify-center"
            style={st.navIconBtn}
            hitSlop={8}
          >
            <Ionicons name="share-outline" size={20} color={Colors.text} />
          </Pressable>
        )}
        <Pressable
          onPress={onMenuPress}
          className="w-10 h-10 items-center justify-center"
          style={st.navIconBtn}
          hitSlop={8}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  const currentUserId = session?.user.id ?? null;
  const isOwnProfile = currentUserId === id;

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!id,
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['user-posts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content')
        .select('id, media_url, thumb_url, likes_count, comments_count, caption')
        .eq('author_id', id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PostThumb[];
    },
    enabled: !!id,
  });

  const { data: followData } = useQuery({
    queryKey: ['follow-status', currentUserId, id],
    queryFn: async () => {
      if (!currentUserId || isOwnProfile) return null;
      const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', currentUserId)
        .eq('following_id', id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentUserId && !isOwnProfile,
  });

  const isFollowing = !!followData;

  const { data: barberInfo } = useQuery({
    queryKey: ['barber-info', id],
    queryFn: async () => {
      const { data: barber } = await supabase
        .from('barbers')
        .select('id, salon_id, rating_avg, reviews_count')
        .eq('profile_id', id)
        .eq('active', true)
        .maybeSingle();
      if (!barber) return null;
      const { data: salon } = await supabase
        .from('salons')
        .select('id, name, address, phone')
        .eq('id', barber.salon_id)
        .single();
      return { ...barber, salon: salon ?? null } as BarberInfo;
    },
    enabled: !!id,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['barber-services', barberInfo?.id],
    queryFn: async () => {
      if (!barberInfo?.id) return [];
      const { data } = await supabase
        .from('services')
        .select('id, name, price_cents, duration_min, currency')
        .eq('barber_id', barberInfo.id)
        .eq('active', true)
        .order('price_cents', { ascending: true });
      return (data ?? []) as SalonService[];
    },
    enabled: !!barberInfo?.id,
  });

  // ── Follow mutation ────────────────────────────────────────────────────

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!currentUserId) return;
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', id);
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: currentUserId, following_id: id });
      }
    },
    onMutate: () => {
      queryClient.setQueryData(
        ['follow-status', currentUserId, id],
        isFollowing ? null : { follower_id: currentUserId },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-status', currentUserId, id] });
      queryClient.invalidateQueries({ queryKey: ['user-profile', id] });
    },
  });

  // ── Action sheet handlers ──────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    const name = profile?.display_name ?? profile?.username ?? 'profil';
    try {
      await Share.share({
        message: `Urmărește pe ${name} pe Tapzi! https://tapzi.app/profile/${id}`,
        title: `Profilul lui ${name}`,
      });
    } catch {
      // user dismissed
    }
  }, [profile, id]);

  const handleCopyLink = useCallback(() => {
    // expo-clipboard not in deps; use Share as fallback
    Share.share({ message: `https://tapzi.app/profile/${id}` }).catch(() => {});
  }, [id]);

  const handleReport = useCallback(() => {
    Alert.alert('Raport trimis', 'Mulțumim! Vom analiza profilul în curând.');
  }, []);

  const handleBlock = useCallback(() => {
    router.back();
  }, []);

  const handleTabChange = useCallback((tab: ProfileTab) => {
    setActiveTab(tab);
  }, []);

  // ── Loading / not found ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={st.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <NavBar
          title="Profil"
          isOwnProfile={false}
          onMenuPress={() => {}}
          onSharePress={() => {}}
        />
        <View style={st.loadingWrap}>
          <Ionicons name="person-outline" size={48} color={Colors.textTertiary} />
          <Text style={st.emptyTitle}>Profil negăsit</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = profile.display_name ?? profile.username;
  const isBarber = !!barberInfo;
  const showSalonTab = isBarber && !!barberInfo?.salon;

  const barberHeaderInfo = barberInfo?.salon
    ? {
        salonName: barberInfo.salon.name,
        salonId: barberInfo.salon.id,
        ratingAvg: barberInfo.rating_avg ?? 0,
        reviewsCount: barberInfo.reviews_count ?? 0,
      }
    : null;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <NavBar
        title={displayName}
        isOwnProfile={isOwnProfile}
        onMenuPress={() => setActionSheetVisible(true)}
        onSharePress={handleShare}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeader
          profile={profile}
          postsCount={posts.length}
          followersCount={profile.followers_count ?? 0}
          followingCount={profile.following_count ?? 0}
          isFollowing={isFollowing}
          isOwnProfile={isOwnProfile}
          isFollowLoading={followMutation.isPending}
          barberInfo={barberHeaderInfo}
          onFollow={() => followMutation.mutate()}
          onEditProfile={() => router.push('/settings')}
          onSalonPress={() => {
            if (barberInfo?.salon) {
              router.push(`/salon/${barberInfo.salon.id}` as any);
            }
          }}
        />

        <ProfileTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          showSalonTab={showSalonTab}
        />

        {/* Posts tab */}
        {activeTab === 'posts' && (
          <Animated.View entering={FadeIn.duration(220)}>
            <ProfilePostGrid
              posts={posts}
              onPostPress={(postId) => router.push(`/post/${postId}` as any)}
            />
          </Animated.View>
        )}

        {/* About tab */}
        {activeTab === 'about' && (
          <Animated.View entering={FadeIn.duration(220)} style={st.tabContent}>
            <ProfileAbout
              bio={profile.bio}
              memberSince={profile.created_at}
              barberInfo={
                barberInfo?.salon
                  ? {
                      salonName: barberInfo.salon.name,
                      salonAddress: barberInfo.salon.address,
                      salonPhone: barberInfo.salon.phone,
                    }
                  : null
              }
              services={services}
              formatPrice={formatPrice}
            />
          </Animated.View>
        )}

        {/* Salon tab */}
        {activeTab === 'salon' && barberInfo?.salon && (
          <Animated.View entering={FadeIn.duration(220)} style={st.tabContent}>
            <SalonTabContent
              salon={barberInfo.salon}
              ratingAvg={barberInfo.rating_avg ?? 0}
              reviewsCount={barberInfo.reviews_count ?? 0}
              services={services}
            />
          </Animated.View>
        )}
      </ScrollView>

      <ProfileActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        onShare={handleShare}
        onCopyLink={handleCopyLink}
        onReport={handleReport}
        onBlock={handleBlock}
        targetName={displayName}
      />
    </SafeAreaView>
  );
}

// ─── Salon Tab Content ────────────────────────────────────────────────────────

interface SalonTabContentProps {
  salon: { id: string; name: string; address: string | null; phone: string | null };
  ratingAvg: number;
  reviewsCount: number;
  services: SalonService[];
}

function SalonTabContent({ salon, ratingAvg, reviewsCount, services }: SalonTabContentProps) {
  return (
    <View style={st.salonTab}>
      {/* Salon info card */}
      <View style={st.salonCard}>
        <View style={st.salonCardHeader}>
          <View style={st.salonIconWrap}>
            <Ionicons name="storefront" size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.salonCardName}>{salon.name}</Text>
            {salon.address ? (
              <Text style={st.salonCardAddr} numberOfLines={2}>{salon.address}</Text>
            ) : null}
          </View>
          <View style={st.ratingPill}>
            <Ionicons name="star" size={11} color="#F59E0B" />
            <Text style={st.ratingText}>{ratingAvg.toFixed(1)}</Text>
          </View>
        </View>

        {reviewsCount > 0 && (
          <Text style={st.reviewCount}>{reviewsCount} recenzii</Text>
        )}

        <Pressable
          onPress={() => router.push(`/salon/${salon.id}` as any)}
          className="mt-3 py-3 items-center"
          style={st.salonBtn}
        >
          <Text style={st.salonBtnText}>Vezi salonul</Text>
        </Pressable>
      </View>

      {/* Services */}
      {services.length > 0 && (
        <View style={st.servicesCard}>
          <Text style={st.servicesTitle}>Servicii</Text>
          {services.map((s, i) => (
            <View
              key={s.id}
              style={[st.serviceRow, i < services.length - 1 && st.serviceRowDivider]}
            >
              <View style={{ flex: 1 }}>
                <Text style={st.serviceName}>{s.name}</Text>
                <Text style={st.serviceDuration}>{s.duration_min} min</Text>
              </View>
              <Text style={st.servicePrice}>{formatPrice(s.price_cents, s.currency)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.background,
  },

  // NavBar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
    gap: 4,
  },
  navIconBtn: {
    backgroundColor: Colors.background,
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 17,
    color: Colors.text,
  },
  navRight: {
    flexDirection: 'row',
    gap: 4,
  },

  // Tab content wrapper (adds top padding for about/salon)
  tabContent: {
    paddingTop: 12,
  },

  // Empty / error
  emptyTitle: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 16,
    color: Colors.textSecondary,
  },

  // Salon tab
  salonTab: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  salonCard: {
    backgroundColor: Colors.white,
    ...Bubble.radii,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.separator,
    padding: 16,
  },
  salonCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  salonIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salonCardName: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 16,
    color: Colors.text,
    marginBottom: 2,
  },
  salonCardAddr: {
    ...Typography.small,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  ratingText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 12,
    color: '#92400E',
  },
  reviewCount: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 2,
    marginLeft: 52,
  },
  salonBtn: {
    backgroundColor: Colors.primaryMuted,
    ...Bubble.radii,
  },
  salonBtnText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 14,
    color: Colors.primary,
  },
  servicesCard: {
    backgroundColor: Colors.white,
    ...Bubble.radii,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.separator,
    padding: 16,
  },
  servicesTitle: {
    ...Typography.captionSemiBold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  serviceRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  serviceName: {
    ...Typography.captionSemiBold,
    color: Colors.text,
  },
  serviceDuration: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  servicePrice: {
    ...Typography.captionSemiBold,
    color: Colors.primary,
  },
});
