import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from '@/components/ui/Image';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ProfileHeaderProps {
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
  onShare?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Stat column (number + label, no dividers) ────────────────────────────────

interface StatItemProps {
  value: number;
  label: string;
}

function StatItem({ value, label }: StatItemProps) {
  return (
    <View style={s.statItem}>
      <Text style={s.statValue}>{formatCount(value)}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Action button (IG-style flat pill) ───────────────────────────────────────
// Layout is entirely via className (NativeWind) to avoid the Pressable override issue.

interface ActionBtnProps {
  label: string;
  isPrimary?: boolean;
  isLoading?: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}

function ActionBtn({ label, isPrimary = false, isLoading = false, onPress, icon }: ActionBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading}
      accessibilityRole="button"
      className="flex-1 h-9 items-center justify-center flex-row gap-x-1.5"
      style={isPrimary ? s.actionBtnPrimary : s.actionBtnSecondary}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={isPrimary ? Colors.white : Colors.text} />
      ) : (
        <>
          {icon}
          <Text style={isPrimary ? s.actionBtnTextPrimary : s.actionBtnTextSecondary}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const AVATAR_SIZE = 86;

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
  onShare,
}: ProfileHeaderProps) {
  const handleFollow = () => {
    if (isFollowLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFollow();
  };

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onShare?.();
  };

  const displayName = profile.display_name ?? profile.username;

  return (
    <Animated.View entering={FadeIn.duration(280)} style={s.container}>

      {/* ── Row 1: Avatar LEFT + Stats RIGHT ─────────────────────────────── */}
      <View style={s.topRow}>
        {/* Avatar */}
        <View style={s.avatarWrapper}>
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={s.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Ionicons name="person" size={38} color={Colors.primary} />
            </View>
          )}
          {barberInfo ? (
            <View style={s.barberBadge}>
              <Ionicons name="cut" size={10} color="#fff" />
            </View>
          ) : null}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <StatItem value={postsCount} label="Postări" />
          <StatItem value={followersCount} label="Urmăritori" />
          <StatItem value={followingCount} label="Urmăresc" />
        </View>
      </View>

      {/* ── Row 2: Name + verified, username, bio ────────────────────────── */}
      <View style={s.infoBlock}>
        {/* Display name + verified */}
        <View style={s.nameRow}>
          <Text style={s.displayName} numberOfLines={1}>{displayName}</Text>
          {profile.verified && (
            <Ionicons name="checkmark-circle" size={17} color="#1D9BF0" style={s.verifiedIcon} />
          )}
        </View>

        {/* Username */}
        <Text style={s.username}>@{profile.username}</Text>

        {/* Bio */}
        {profile.bio ? (
          <Text style={s.bio} numberOfLines={4}>{profile.bio}</Text>
        ) : null}
      </View>

      {/* ── Row 3: Barber / salon card row ───────────────────────────────── */}
      {barberInfo ? (
        <Pressable
          onPress={onSalonPress}
          accessibilityRole="button"
          accessibilityLabel={`Vezi salonul ${barberInfo.salonName}`}
          className="flex-row items-center w-full min-h-[44px]"
          style={({ pressed }) => [s.salonCard, pressed && s.salonCardPressed]}
        >
          {/* Left: scissors squircle */}
          <View style={s.salonIconBox}>
            <Ionicons name="cut" size={14} color={Colors.primary} />
          </View>

          {/* Middle: salon name */}
          <Text style={s.salonName} numberOfLines={1}>{barberInfo.salonName}</Text>

          {/* Right cluster */}
          <View style={s.salonRight}>
            {barberInfo.reviewsCount > 0 ? (
              <View style={s.salonRating}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Text style={s.salonRatingText}>{barberInfo.ratingAvg.toFixed(1)}</Text>
              </View>
            ) : (
              <View style={s.salonNewPill}>
                <Text style={s.salonNewPillText}>Nou</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
          </View>
        </Pressable>
      ) : null}

      {/* ── Row 4: Action buttons (IG-style side-by-side) ────────────────── */}
      <View style={s.actionsRow}>
        {isOwnProfile ? (
          <>
            <ActionBtn
              label="Editează profilul"
              onPress={onEditProfile}
              icon={<Ionicons name="create-outline" size={15} color={Colors.text} />}
            />
            <ActionBtn
              label="Distribuie profilul"
              onPress={handleShare}
              icon={<Ionicons name="share-outline" size={15} color={Colors.text} />}
            />
          </>
        ) : isFollowing ? (
          <>
            <ActionBtn
              label="Urmărești"
              isLoading={isFollowLoading}
              onPress={handleFollow}
              icon={
                isFollowLoading ? undefined : (
                  <Ionicons name="checkmark" size={15} color={Colors.text} />
                )
              }
            />
            <ActionBtn
              label="Distribuie"
              onPress={handleShare}
              icon={<Ionicons name="share-outline" size={15} color={Colors.text} />}
            />
          </>
        ) : (
          <>
            <ActionBtn
              label="Urmărește"
              isPrimary
              isLoading={isFollowLoading}
              onPress={handleFollow}
              icon={
                isFollowLoading ? undefined : (
                  <Ionicons name="person-add-outline" size={15} color={Colors.white} />
                )
              }
            />
            <ActionBtn
              label="Distribuie"
              onPress={handleShare}
              icon={<Ionicons name="share-outline" size={15} color={Colors.text} />}
            />
          </>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // Top row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  // Avatar
  avatarWrapper: {
    position: 'relative',
    marginRight: 20,
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
  barberBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: Colors.white,
  },

  // Stats
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 17,
    lineHeight: 21,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...Typography.small,
    color: Colors.textTertiary,
  },

  // Info block (name / username / bio)
  infoBlock: {
    marginBottom: 10,
    gap: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 1,
  },
  displayName: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 15,
    lineHeight: 20,
    color: Colors.text,
  },
  verifiedIcon: {
    marginTop: 1,
  },
  username: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  bio: {
    ...Typography.caption,
    color: Colors.text,
    lineHeight: 19,
  },

  // Salon card row — full-width, IG link-row weight
  salonCard: {
    marginBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.separator,
    ...Bubble.radiiSm,
    ...Bubble.accent,
  },
  salonCardPressed: {
    backgroundColor: Colors.background,
  },
  salonIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salonName: {
    ...Typography.captionSemiBold,
    color: Colors.text,
    flexShrink: 1,
    marginLeft: 10,
  },
  salonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    paddingLeft: 8,
  },
  salonRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  salonRatingText: {
    ...Typography.small,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  salonNewPill: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  salonNewPillText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 10,
    lineHeight: 14,
    color: Colors.primary,
  },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },

  // Action button inner shells (squircle shape + colors/borders — layout via className)
  actionBtnPrimary: {
    backgroundColor: Colors.gradientStart,
    ...Bubble.radiiSm,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.inputBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.inputBorder,
    ...Bubble.radiiSm,
    ...Bubble.accent,
  },
  actionBtnTextPrimary: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    lineHeight: 17,
    color: Colors.white,
  },
  actionBtnTextSecondary: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 13,
    lineHeight: 17,
    color: Colors.text,
  },
});
