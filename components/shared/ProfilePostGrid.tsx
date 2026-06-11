import { View, Text, Pressable, Image, Dimensions, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  type?: string;
  media_url: string | null;
  thumb_url: string | null;
  likes_count: number;
  comments_count: number;
  caption: string | null;
}

interface ProfilePostGridProps {
  posts: Post[];
  onPostPress: (postId: string) => void;
}

// ─── Layout constants ─────────────────────────────────────────────────────────
// Full-bleed: no horizontal page padding. 3 columns, 1px gaps.

const GAP = 1;
const COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - GAP * (COLUMNS - 1)) / COLUMNS);

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfilePostGrid({ posts, onPostPress }: ProfilePostGridProps) {
  if (posts.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="camera-outline" size={48} color={Colors.textTertiary} />
        <Text style={styles.emptyText}>Nicio postare încă</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {posts.map((post, index) => {
        const rowDelay = Math.floor(index / COLUMNS) * 60;
        const imageUri = post.thumb_url ?? post.media_url;
        const isVideo = post.type === 'video';

        return (
          <Animated.View
            key={post.id}
            entering={FadeIn.delay(rowDelay).duration(260)}
            style={styles.cell}
          >
            <Pressable
              onPress={() => onPostPress(post.id)}
              style={styles.pressable}
              android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
            >
              {/* Thumbnail or placeholder */}
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ) : (
                /* Graceful placeholder: light bg + camera icon */
                <View style={styles.placeholder}>
                  <Ionicons
                    name={isVideo ? 'videocam-outline' : 'image-outline'}
                    size={24}
                    color={Colors.textTertiary}
                  />
                </View>
              )}

              {/* Video indicator — top-right, IG Reels style */}
              {isVideo && (
                <View style={styles.videoIcon} pointerEvents="none">
                  <Ionicons name="play" size={13} color="#fff" />
                </View>
              )}

              {/* Subtle stat overlay — bottom-left, only likes */}
              {(post.likes_count > 0 || post.comments_count > 0) && (
                <View style={styles.overlay} pointerEvents="none">
                  <View style={styles.stat}>
                    <Ionicons name="heart" size={10} color="#fff" />
                    <Text style={styles.statText}>{post.likes_count}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Full-bleed grid, no outer padding
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    backgroundColor: Colors.white,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  pressable: {
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    backgroundColor: Colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Video badge — top-right corner (IG Reels style)
  videoIcon: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Likes overlay — bottom-left, very subtle
  overlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  statText: {
    ...Typography.small,
    color: '#fff',
    fontSize: 10,
    lineHeight: 13,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 72,
    gap: 12,
    backgroundColor: Colors.white,
  },
  emptyText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
});
