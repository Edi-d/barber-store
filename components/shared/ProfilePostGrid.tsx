import { View, Text, Pressable, Image, Dimensions, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

interface Post {
  id: string;
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

const GAP = 2;
const COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = (SCREEN_WIDTH - GAP * (COLUMNS - 1)) / COLUMNS;

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
        const rowDelay = Math.floor(index / COLUMNS) * 80;
        const imageSource = post.thumb_url ?? post.media_url;

        return (
          <Animated.View
            key={post.id}
            entering={FadeIn.delay(rowDelay).duration(300)}
            style={styles.cell}
          >
            <Pressable
              onPress={() => onPostPress(post.id)}
              style={styles.pressable}
              android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
            >
              {imageSource ? (
                <Image
                  source={{ uri: imageSource }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={[Colors.gradientStart, Colors.gradientEnd]}
                  style={styles.gradientFallback}
                >
                  <Text style={styles.captionText} numberOfLines={4}>
                    {post.caption ?? ''}
                  </Text>
                </LinearGradient>
              )}

              <View style={styles.overlay}>
                <View style={styles.stat}>
                  <Ionicons name="heart" size={11} color="#fff" />
                  <Text style={styles.statText}>{post.likes_count}</Text>
                </View>
                <View style={styles.stat}>
                  <Ionicons name="chatbubble" size={11} color="#fff" />
                  <Text style={styles.statText}>{post.comments_count}</Text>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  pressable: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradientFallback: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  captionText: {
    ...Typography.small,
    color: '#fff',
    lineHeight: 15,
  },
  overlay: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    flexDirection: 'row',
    gap: 6,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  statText: {
    ...Typography.small,
    color: '#fff',
    fontSize: 10,
    lineHeight: 13,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
});
