import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Bubble, Shadows, Spacing } from '@/constants/theme';
import { getInitials } from '@/lib/utils';

const AVATAR_SIZE = 88;
const RING_GAP = 3;
const RING_WIDTH = 3;
const RING_OUTER = AVATAR_SIZE + (RING_GAP + RING_WIDTH) * 2;
const GAP_LAYER = AVATAR_SIZE + RING_GAP * 2;
const BADGE_SIZE = 22;

interface ProfileHeroProps {
  avatarUrl?: string | null;
  displayName: string;
  username: string;
  bio?: string | null;
  isCreator?: boolean;
  followers: number;
  following: number;
  onEditProfile: () => void;
}

export function ProfileHero({
  avatarUrl,
  displayName,
  username,
  bio,
  isCreator = false,
  followers,
  following,
  onEditProfile,
}: ProfileHeroProps) {
  const initials = getInitials(displayName);

  return (
    <View style={styles.card}>
      {/* Avatar with gradient ring */}
      <View style={styles.avatarWrapper}>
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientRing}
        >
          <View style={styles.ringGap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarFallback}
              >
                <Text style={styles.initialsText}>{initials}</Text>
              </LinearGradient>
            )}
          </View>
        </LinearGradient>

        {isCreator && (
          <View style={styles.creatorBadge}>
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.creatorBadgeInner}
            >
              <Ionicons name="checkmark" size={12} color={Colors.white} />
            </LinearGradient>
          </View>
        )}
      </View>

      {/* Name */}
      <View style={styles.nameRow}>
        <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
        {isCreator && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
      </View>

      {/* Username */}
      <Text style={styles.username}>@{username}</Text>

      {/* Bio */}
      {!!bio && <Text style={styles.bio} numberOfLines={3}>{bio}</Text>}

      {/* Followers / Following */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{followers}</Text>
          <Text style={styles.statLabel}>Urmăritori</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{following}</Text>
          <Text style={styles.statLabel}>Urmărești</Text>
        </View>
      </View>

      {/* Edit Profile */}
      <Pressable
        onPress={onEditProfile}
        className="self-stretch flex-row items-center justify-center mt-[18px] active:opacity-70"
        style={styles.editBtn}
      >
        <Ionicons name="create-outline" size={15} color={Colors.text} />
        <Text style={styles.editBtnText}>Editează profilul</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    ...Bubble.radiiLg,
    ...Bubble.accent,
    ...Shadows.md,
  },
  avatarWrapper: {
    width: RING_OUTER,
    height: RING_OUTER,
  },
  gradientRing: {
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringGap: {
    width: GAP_LAYER,
    height: GAP_LAYER,
    borderRadius: GAP_LAYER / 2,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.inputBackground,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 28,
    color: Colors.white,
  },
  creatorBadge: {
    position: 'absolute',
    bottom: RING_WIDTH + 2,
    right: RING_WIDTH + 2,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.white,
    overflow: 'hidden',
  },
  creatorBadgeInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
  },
  displayName: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 22,
    color: Colors.text,
  },
  username: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bio: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 15,
    lineHeight: 21,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statNum: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 17,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: 'EuclidCircularA-Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E8E8E8',
  },
  editBtn: {
    height: 44,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    gap: 6,
    ...Bubble.radii,
  },
  editBtnText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
});
