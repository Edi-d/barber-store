import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Bubble, Spacing } from '@/constants/theme';
import { timeAgo } from '@/lib/utils';
import type { SearchProfile, SearchSalon, SearchPost } from '@/hooks/useSearch';

const AVATAR_SIZE = 44;
const ACCENT = '#0A66C2';

// ─── Deterministic color palette for letter avatars ──────────────────────────

const AVATAR_COLORS = [
  { bg: '#DBEAFE', fg: '#1E40AF' }, // blue
  { bg: '#FCE7F3', fg: '#9F1239' }, // pink
  { bg: '#DCFCE7', fg: '#166534' }, // green
  { bg: '#FEF3C7', fg: '#92400E' }, // amber
  { bg: '#EDE9FE', fg: '#5B21B6' }, // violet
  { bg: '#FEE2E2', fg: '#991B1B' }, // red
  { bg: '#CCFBF1', fg: '#115E59' }, // teal
  { bg: '#FFE4E6', fg: '#9F1239' }, // rose
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function LetterSquircleAvatar({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const palette = AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length];
  return (
    <View style={[styles.squareAvatar, styles.letterAvatarCenter, { backgroundColor: palette.bg, borderColor: palette.fg + '25' }]}>
      <Text style={[styles.letterAvatarText, { color: palette.fg }]}>{letter}</Text>
    </View>
  );
}

// ─── Salon Item ───────────────────────────────────────────────────────────────

function SalonItem({ salon, onPress }: { salon: SearchSalon; onPress: () => void }) {
  const typeLabel = (salon.salon_types ?? [])
    .map((t) => (t === 'barbershop' ? 'Barbershop' : 'Coafor'))
    .join(' / ');

  const hasType = typeLabel.length > 0;
  const hasRating = salon.rating_avg != null;
  const hasAddress = !!salon.address;
  const hasAnyMeta = hasType || hasRating || hasAddress;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {salon.avatar_url ? (
        <View style={styles.squareAvatar}>
          <Image source={{ uri: salon.avatar_url }} style={styles.squareAvatarImg} resizeMode="cover" />
        </View>
      ) : (
        <LetterSquircleAvatar name={salon.name} />
      )}

      <View style={styles.textBlock}>
        <Text style={styles.primaryText} numberOfLines={1}>
          {salon.name}
        </Text>

        {hasAnyMeta && (
          <Text style={styles.metaTextRow} numberOfLines={1}>
            {hasType && <Text>{typeLabel}</Text>}
            {hasType && hasRating && <Text> · </Text>}
            {hasRating && (
              <Text>
                <Ionicons name="star" size={10} color="#F59E0B" />
                {' '}
                <Text style={styles.ratingNumber}>{salon.rating_avg!.toFixed(1)}</Text>
              </Text>
            )}
            {(hasType || hasRating) && hasAddress && <Text> · </Text>}
            {hasAddress && <Text>{salon.address}</Text>}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Person Item ──────────────────────────────────────────────────────────────

function PersonItem({ profile, onPress }: { profile: SearchProfile; onPress: () => void }) {
  const displayName = profile.display_name ?? profile.username;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.circleAvatar, !profile.avatar_url && { alignItems: 'center', justifyContent: 'center' }]}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.circleAvatarImg} resizeMode="cover" />
        ) : (() => {
          const palette = AVATAR_COLORS[hashString(displayName) % AVATAR_COLORS.length];
          return (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', borderRadius: AVATAR_SIZE / 2 }]}>
              <Text style={[styles.initialText, { color: palette.fg }]}>{initial}</Text>
            </View>
          );
        })()}
      </View>

      <View style={styles.textBlock}>
        <View style={styles.nameRow}>
          <Text style={styles.primaryText} numberOfLines={1}>
            {displayName}
          </Text>
          {profile.verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={8} color="#fff" />
            </View>
          )}
        </View>
        <Text style={styles.usernameText} numberOfLines={1}>
          @{profile.username}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Post Item ────────────────────────────────────────────────────────────────

function PostItem({ post, onPress }: { post: SearchPost; onPress: () => void }) {
  const thumbUri = post.thumb_url ?? post.media_url;
  const videoOverlay =
    post.type === 'video' ? (
      <View style={styles.videoOverlay}>
        <Ionicons name="play" size={8} color="#fff" />
      </View>
    ) : null;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {thumbUri ? (
        <View style={styles.squareAvatar}>
          <Image source={{ uri: thumbUri }} style={styles.squareAvatarImg} resizeMode="cover" />
          {videoOverlay}
        </View>
      ) : (
        <View style={[styles.squareAvatar, styles.letterAvatarCenter, { backgroundColor: '#F1F5F9', borderColor: 'rgba(100,116,139,0.2)' }]}>
          <Ionicons name={post.type === 'video' ? 'videocam' : 'image'} size={22} color="#94A3B8" />
          {videoOverlay}
        </View>
      )}

      <View style={styles.textBlock}>
        {post.caption ? (
          <Text style={styles.primaryText} numberOfLines={1}>
            {post.caption}
          </Text>
        ) : (
          <Text style={[styles.primaryText, { color: Colors.textTertiary, fontFamily: FontFamily.regular }]}>
            {post.type === 'video' ? 'Video' : 'Imagine'}
          </Text>
        )}
        <Text style={styles.usernameText} numberOfLines={1}>
          {post.author.display_name ?? post.author.username}
          {' · '}
          {timeAgo(post.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Union ────────────────────────────────────────────────────────────────────

type SearchResultItemProps =
  | { type: 'salon'; item: SearchSalon; onPress: () => void }
  | { type: 'person'; item: SearchProfile; onPress: () => void }
  | { type: 'post'; item: SearchPost; onPress: () => void };

export function SearchResultItem(props: SearchResultItemProps) {
  if (props.type === 'salon') return <SalonItem salon={props.item} onPress={props.onPress} />;
  if (props.type === 'person') return <PersonItem profile={props.item} onPress={props.onPress} />;
  return <PostItem post={props.item} onPress={props.onPress} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 76,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...Bubble.radiiSm,
    ...Bubble.accent,
    overflow: 'hidden',
  },
  pressed: {
    backgroundColor: 'rgba(248,250,252,0.9)',
  },

  // ─── Square avatar ─────────────────────────────────────
  squareAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#DCEBFF',
    ...Bubble.radiiSm,
    borderWidth: 1,
    borderColor: 'rgba(10,102,194,0.12)',
  },
  squareAvatarImg: {
    width: '100%',
    height: '100%',
  },

  // ─── Letter avatar helpers ─────────────────────────────
  letterAvatarCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterAvatarText: {
    fontFamily: FontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.5,
  },

  // ─── Circle avatar (person) ────────────────────────────
  circleAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#DCEBFF',
    borderWidth: 1,
    borderColor: 'rgba(10,102,194,0.12)',
  },
  circleAvatarImg: {
    width: '100%',
    height: '100%',
  },
  initialText: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    letterSpacing: -0.5,
  },

  // ─── Video overlay on post thumbnail ───────────────────
  videoOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Text block ────────────────────────────────────────
  textBlock: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  primaryText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 0,
  },

  // ─── Inline metadata row (salon) ───────────────────────
  metaTextRow: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  ratingNumber: {
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    color: '#0F172A',
  },

  // ─── Person specific ───────────────────────────────────
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  usernameText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  verifiedBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
