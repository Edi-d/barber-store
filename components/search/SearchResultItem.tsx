import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { timeAgo } from '@/lib/utils';
import type { SearchProfile, SearchSalon, SearchPost } from '@/hooks/useSearch';

// ─── Salon Item ───────────────────────────────────────────────────────────────

interface SalonItemProps {
  salon: SearchSalon;
  onPress: () => void;
}

function SalonItem({ salon, onPress }: SalonItemProps) {
  const typeLabel = (salon.salon_types ?? [])
    .map((t) => (t === 'barbershop' ? 'Barbershop' : 'Coafor'))
    .join(' · ');

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {/* Square avatar */}
      <View style={styles.squareAvatar}>
        {salon.avatar_url ? (
          <Image source={{ uri: salon.avatar_url }} style={styles.squareAvatarImg} />
        ) : (
          <View style={[styles.squareAvatarImg, styles.avatarFallback]}>
            <Ionicons name="cut-outline" size={20} color={Colors.primary} />
          </View>
        )}
      </View>

      {/* Text */}
      <View style={styles.textBlock}>
        <Text style={styles.primaryText} numberOfLines={1}>
          {salon.name}
        </Text>
        <View style={styles.metaRow}>
          {typeLabel ? (
            <Text style={styles.secondaryText} numberOfLines={1}>
              {typeLabel}
            </Text>
          ) : null}
          {salon.rating_avg != null && typeLabel ? (
            <Text style={styles.dot}> · </Text>
          ) : null}
          {salon.rating_avg != null && (
            <Ionicons name="star" size={11} color="#F59E0B" />
          )}
          {salon.rating_avg != null && (
            <Text style={[styles.secondaryText, { marginLeft: 2 }]}>
              {salon.rating_avg.toFixed(1)}
            </Text>
          )}
        </View>
        {salon.address ? (
          <Text style={styles.tertiaryText} numberOfLines={1}>
            {salon.address}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
  );
}

// ─── Person Item ──────────────────────────────────────────────────────────────

interface PersonItemProps {
  profile: SearchProfile;
  onPress: () => void;
}

function PersonItem({ profile, onPress }: PersonItemProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {/* Circular Avatar */}
      <Avatar
        source={profile.avatar_url}
        name={profile.display_name ?? profile.username}
        size="md"
      />

      {/* Text */}
      <View style={styles.textBlock}>
        <View style={styles.nameRow}>
          <Text style={styles.primaryText} numberOfLines={1}>
            {profile.display_name ?? profile.username}
          </Text>
          {profile.verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={8} color="#fff" />
            </View>
          )}
        </View>
        <Text style={styles.secondaryText} numberOfLines={1}>
          @{profile.username}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
  );
}

// ─── Post Item ────────────────────────────────────────────────────────────────

interface PostItemProps {
  post: SearchPost;
  onPress: () => void;
}

function PostItem({ post, onPress }: PostItemProps) {
  const thumbUri = post.thumb_url ?? post.media_url;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {/* Square thumbnail */}
      <View style={styles.squareAvatar}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.squareAvatarImg} resizeMode="cover" />
        ) : (
          <View style={[styles.squareAvatarImg, styles.avatarFallback]}>
            <Ionicons name="image-outline" size={20} color={Colors.textSecondary} />
          </View>
        )}
        {post.type === 'video' && (
          <View style={styles.videoOverlay}>
            <Ionicons name="play" size={10} color="#fff" />
          </View>
        )}
      </View>

      {/* Text */}
      <View style={styles.textBlock}>
        {post.caption ? (
          <Text style={styles.primaryText} numberOfLines={2}>
            {post.caption}
          </Text>
        ) : (
          <Text style={[styles.primaryText, { color: Colors.textTertiary }]}>
            {post.type === 'video' ? 'Video' : 'Imagine'}
          </Text>
        )}
        <Text style={styles.secondaryText} numberOfLines={1}>
          {post.author.display_name ?? post.author.username}
          {' · '}
          {timeAgo(post.created_at)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
  );
}

// ─── Union Component ──────────────────────────────────────────────────────────

type SearchResultItemProps =
  | { type: 'salon'; item: SearchSalon; onPress: () => void }
  | { type: 'person'; item: SearchProfile; onPress: () => void }
  | { type: 'post'; item: SearchPost; onPress: () => void };

export function SearchResultItem(props: SearchResultItemProps) {
  if (props.type === 'salon') {
    return <SalonItem salon={props.item} onPress={props.onPress} />;
  }
  if (props.type === 'person') {
    return <PersonItem profile={props.item} onPress={props.onPress} />;
  }
  return <PostItem post={props.item} onPress={props.onPress} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.md,
    backgroundColor: Colors.white,
  },
  pressed: {
    backgroundColor: Colors.inputBackground,
  },
  squareAvatar: {
    width: 46,
    height: 46,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    flexShrink: 0,
  },
  squareAvatarImg: {
    width: 46,
    height: 46,
    borderRadius: Radius.sm,
  },
  avatarFallback: {
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  primaryText: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.text,
    flexShrink: 1,
  },
  secondaryText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  tertiaryText: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    color: Colors.textTertiary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textTertiary,
  },
  verifiedBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
