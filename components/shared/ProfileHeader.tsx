import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

interface ProfileHeaderProps {
  profile: {
    id: string;
    display_name: string | null;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    verified: boolean;
    created_at: string;
  };
  postsCount: number;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  isFollowLoading?: boolean;
  barberInfo?: {
    salonName: string;
    salonId: string;
    ratingAvg: number;
    reviewsCount: number;
  } | null;
  onFollow: () => void;
  onEditProfile: () => void;
  onSalonPress: () => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface StatColumnProps {
  value: number;
  label: string;
  delay: number;
}

function StatColumn({ value, label, delay }: StatColumnProps) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)} style={s.statCol}>
      <Text style={s.statValue}>{formatCount(value)}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Animated.View>
  );
}

export function ProfileHeader({
  profile,
  postsCount,
  followersCount,
  followingCount,
  isFollowing,
  isOwnProfile,
  isFollowLoading = false,
  barberInfo,
  onFollow,
  onEditProfile,
  onSalonPress,
}: ProfileHeaderProps) {
  const handleFollow = () => {
    if (isFollowLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFollow();
  };

  const displayName = profile.display_name ?? profile.username;

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={s.container}>
      {/* Avatar */}
      <Animated.View entering={FadeIn.delay(80).duration(300)} style={s.avatarWrapper}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={s.avatar} resizeMode="cover" />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Ionicons name="person" size={36} color={Colors.primary} />
          </View>
        )}
        {barberInfo ? (
          <View style={s.barberIndicator}>
            <Ionicons name="cut" size={10} color="#fff" />
          </View>
        ) : null}
      </Animated.View>

      {/* Name + verified badge */}
      <Animated.View entering={FadeInDown.delay(120).duration(300)} style={s.nameRow}>
        <Text style={s.displayName} numberOfLines={1}>{displayName}</Text>
        {profile.verified && (
          <View style={s.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#1D9BF0" />
          </View>
        )}
      </Animated.View>

      {/* Username */}
      <Animated.View entering={FadeInDown.delay(160).duration(300)}>
        <Text style={s.username}>@{profile.username}</Text>
      </Animated.View>

      {/* Bio */}
      {profile.bio ? (
        <Animated.View entering={FadeInDown.delay(200).duration(300)}>
          <Text style={s.bio} numberOfLines={3}>{profile.bio}</Text>
        </Animated.View>
      ) : null}

      {/* Barber badge */}
      {barberInfo ? (
        <Animated.View entering={FadeInDown.delay(230).duration(300)}>
          <Pressable
            onPress={onSalonPress}
            className="flex-row items-center gap-x-1.5 px-3 py-1.5 rounded-full mt-2"
            style={s.barberBadge}
          >
            <Ionicons name="cut" size={14} color={Colors.primary} />
            <Text style={s.barberSalonName} numberOfLines={1}>{barberInfo.salonName}</Text>
            <View style={s.barberRating}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={s.barberRatingText}>{barberInfo.ratingAvg.toFixed(1)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={13} color={Colors.textTertiary} />
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Stats row */}
      <View style={s.statsRow}>
        <StatColumn value={postsCount} label="Postări" delay={260} />
        <View style={s.statDivider} />
        <StatColumn value={followersCount} label="Urmăritori" delay={310} />
        <View style={s.statDivider} />
        <StatColumn value={followingCount} label="Urmăresc" delay={360} />
      </View>

      {/* Action button */}
      <Animated.View entering={FadeInDown.delay(400).duration(300)} style={s.actionRow}>
        {isOwnProfile ? (
          <Button
            variant="secondary"
            size="md"
            onPress={onEditProfile}
            style={s.actionBtn}
            icon={<Ionicons name="create-outline" size={16} color={Colors.text} />}
          >
            Editează profilul
          </Button>
        ) : isFollowing ? (
          <Button
            variant="outline"
            size="md"
            onPress={handleFollow}
            loading={isFollowLoading}
            style={s.actionBtn}
            icon={<Ionicons name="checkmark" size={16} color={Colors.gradientStart} />}
          >
            Urmărești
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            onPress={handleFollow}
            loading={isFollowLoading}
            style={s.actionBtn}
            icon={<Ionicons name="person-add" size={16} color="#fff" />}
          >
            Urmărește
          </Button>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const AVATAR_SIZE = 80;

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
  },
  avatarWrapper: {
    marginBottom: 12,
    position: 'relative',
    ...Shadows.md,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barberIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: Colors.white,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  displayName: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 22,
    lineHeight: 28,
    color: Colors.text,
  },
  verifiedBadge: {
    marginTop: 1,
  },
  username: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  bio: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 20,
    maxWidth: 280,
  },
  barberBadge: {
    backgroundColor: Colors.primaryMuted,
    marginBottom: 16,
    ...Shadows.sm,
  },
  barberSalonName: {
    ...Typography.smallSemiBold,
    color: Colors.primary,
    maxWidth: 160,
  },
  barberRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  barberRatingText: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 18,
    lineHeight: 22,
    color: Colors.text,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.textTertiary,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.separator,
    marginHorizontal: 8,
  },
  actionRow: {
    width: '100%',
  },
  actionBtn: {
    width: '100%',
  },
});
