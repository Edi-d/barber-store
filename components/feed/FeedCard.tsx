import { useState, useCallback, useEffect, useRef } from 'react';
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Dimensions, Share, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { TapGestureHandler, State } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import { ContentWithAuthor } from '@/types/database';
import { timeAgo } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { VideoPlayer } from '@/components/feed/VideoPlayer';
import { HashtagText } from '@/components/feed/HashtagText';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_RATIO = 1; // square like Instagram

const SPRING_BOUNCY = { damping: 6, stiffness: 200, mass: 0.5 };
const SPRING_SETTLE = { damping: 14, stiffness: 180, mass: 0.6 };

/* ── Particle trajectories (6 particles) ── */
const PARTICLES = [
  { dx: -18, dy: -38, rot: -15, delay: 0 },
  { dx: 6, dy: -44, rot: 10, delay: 30 },
  { dx: 20, dy: -32, rot: 25, delay: 60 },
  { dx: -10, dy: -50, rot: -20, delay: 20 },
  { dx: 14, dy: -48, rot: 5, delay: 50 },
  { dx: -22, dy: -28, rot: -30, delay: 40 },
];

interface FeedCardProps {
  item: ContentWithAuthor;
  onLikeToggle: () => void;
  onLikeAdd: () => void;
  onComment: () => void;
  onShare?: () => void;
  isFollowing?: boolean;
  onFollow?: (authorId: string) => void;
  isLikePending?: boolean;
  isActiveVideo?: boolean;
  isMuted?: boolean;
  onMuteToggle?: () => void;
  onHashtagPress?: (name: string) => void;
  // Tutorial refs — only passed for the first card (index 0)
  likeRef?: React.RefObject<View>;
  commentRef?: React.RefObject<View>;
  shareRef?: React.RefObject<View>;
  followRef?: React.RefObject<View>;
}

export function FeedCard({ item, onLikeToggle, onLikeAdd, onComment, onShare, isFollowing, onFollow, isLikePending, isActiveVideo, isMuted, onMuteToggle, onHashtagPress, likeRef, commentRef, shareRef, followRef }: FeedCardProps) {
  const { session } = useAuthStore();
  const isOwnPost = session?.user.id === item.author_id;
  const [liked, setLiked] = useState(item.is_liked || false);
  const [displayLikes, setDisplayLikes] = useState(item.likes_count);
  const likedRef = useRef(item.is_liked || false);
  const originalLikesCount = useRef(item.likes_count);

  // Sync local state when realtime updates change the parent data
  useEffect(() => {
    likedRef.current = item.is_liked || false;
    setLiked(item.is_liked || false);
    setDisplayLikes(item.likes_count);
    originalLikesCount.current = item.likes_count;
  }, [item.is_liked, item.likes_count]);

  /* ── Debounce ref ── */
  const lastLikeTime = useRef(0);
  const LIKE_DEBOUNCE_MS = 500;

  /* ── Like animation values ── */
  const iconScale = useSharedValue(1);
  const iconRotate = useSharedValue(0);
  const likeProgress = useSharedValue(item.is_liked ? 1 : 0);
  const particleBurst = useSharedValue(0);
  const countSlide = useSharedValue(0);

  /* ── Double-tap heart overlay animation values ── */
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const triggerLikeAnimation = useCallback((newLiked: boolean) => {
    if (newLiked) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      iconScale.value = withSequence(
        withSpring(1.6, SPRING_BOUNCY),
        withSpring(1, SPRING_SETTLE),
      );
      iconRotate.value = withSequence(
        withTiming(-12, { duration: 100 }),
        withSpring(0, SPRING_SETTLE),
      );
      likeProgress.value = withSpring(1, SPRING_SETTLE);
      particleBurst.value = 0;
      particleBurst.value = withTiming(1, { duration: 600 });
      countSlide.value = 0;
      countSlide.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 0 }),
      );
      setDisplayLikes(item.likes_count + 1);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      iconScale.value = withSequence(
        withTiming(0.75, { duration: 80 }),
        withSpring(1, SPRING_SETTLE),
      );
      likeProgress.value = withTiming(0, { duration: 200 });
      countSlide.value = 0;
      countSlide.value = withSequence(
        withTiming(-1, { duration: 150 }),
        withTiming(0, { duration: 0 }),
      );
      setDisplayLikes(Math.max(originalLikesCount.current, item.likes_count));
    }
  }, [item.likes_count]);

  const handleLike = useCallback(() => {
    const now = Date.now();
    if (now - lastLikeTime.current < LIKE_DEBOUNCE_MS) return;
    lastLikeTime.current = now;

    const newLiked = !likedRef.current;
    likedRef.current = newLiked;
    setLiked(newLiked);
    triggerLikeAnimation(newLiked);
    onLikeToggle();
  }, [triggerLikeAnimation, onLikeToggle]);

  /* ── Double-tap to like on image ── */
  const handleDoubleTap = useCallback((event: any) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      // Always show heart overlay animation
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      heartScale.value = 0;
      heartOpacity.value = 0;
      heartScale.value = withSequence(
        withSpring(1.2, SPRING_BOUNCY),
        withSpring(1, SPRING_SETTLE),
        withDelay(200, withTiming(0, { duration: 250 })),
      );
      heartOpacity.value = withSequence(
        withTiming(1, { duration: 100 }),
        withDelay(450, withTiming(0, { duration: 250 })),
      );

      // Only fire like if not already liked AND debounce passes
      if (likedRef.current) return;
      const now = Date.now();
      if (now - lastLikeTime.current < LIKE_DEBOUNCE_MS) return;

      lastLikeTime.current = now;
      likedRef.current = true;
      setLiked(true);
      triggerLikeAnimation(true);
      onLikeAdd();
    }
  }, [triggerLikeAnimation, onLikeAdd]);

  const heartOverlayStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  const handleComment = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onComment();
  }, [onComment]);

  const handleShare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Share.share({ message: item.caption || 'Descopera acest continut pe Tapzi!' });
    onShare?.();
  }, [item.caption, onShare]);

  const handleFollow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFollow?.(item.author_id);
  }, [item.author_id, onFollow]);

  /* ── Animated styles ── */
  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: iconScale.value },
      { rotate: `${iconRotate.value}deg` },
    ],
  }));

  const iconColorStyle = useAnimatedStyle(() => ({
    opacity: likeProgress.value,
  }));

  const iconGrayStyle = useAnimatedStyle(() => ({
    opacity: 1 - likeProgress.value,
  }));

  const countAnimStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          countSlide.value,
          [-1, 0, 1],
          [8, 0, -8],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      countSlide.value,
      [-1, -0.5, 0, 0.5, 1],
      [0, 1, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const labelColorStyle = useAnimatedStyle(() => ({
    color: likeProgress.value > 0.5 ? Brand.primary : Colors.textSecondary,
  }));

  const authorName = item.author.display_name || item.author.username;
  const authorRole = item.author.role === 'creator' ? 'Creator' : item.author.role === 'admin' ? 'Admin' : 'Membru';
  const isVerified = item.author.role === 'creator' || item.author.role === 'admin';

  return (
    <View style={[styles.cardShadow, Shadows.sm]}>
      <BlurView intensity={50} tint="light" style={styles.card}>
        {/* ─── Author row ─── */}
        <View style={styles.authorRow}>
          <TouchableOpacity
            style={styles.authorLeft}
            activeOpacity={0.7}
            onPress={() => {
              if (isOwnPost) {
                router.push('/(tabs)/profile');
              } else {
                router.push(`/profile/${item.author_id}` as any);
              }
            }}
          >
            {item.author.avatar_url ? (
              <Image source={{ uri: item.author.avatar_url }} style={styles.authorAvatar} />
            ) : (
              <View style={[styles.authorAvatar, { backgroundColor: Brand.primary }]}>
                <Text style={styles.authorInitial}>
                  {(authorName ?? '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.authorInfo}>
              <View style={styles.authorNameRow}>
                <Text style={[styles.authorName, { color: Colors.text }]} numberOfLines={1}>
                  {authorName}
                </Text>
                {isVerified && (
                  <View style={styles.verifiedBadge}>
                    <Feather name="check" size={10} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={[styles.authorSubtitle, { color: Colors.textTertiary }]} numberOfLines={1}>
                {authorRole} · {timeAgo(item.created_at)}
              </Text>
            </View>
          </TouchableOpacity>

          {!isOwnPost && (
            <TouchableOpacity
              ref={followRef}
              style={[
                styles.followButton,
                isFollowing ? styles.followingBtn : styles.followBtn,
              ]}
              onPress={handleFollow}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.followText,
                  { color: isFollowing ? Colors.text : '#fff' },
                ]}
              >
                {isFollowing ? 'Urmaresti' : 'Urmareste'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.moreBtn}
            onPress={() =>
              Alert.alert('Opțiuni', '', [
                { text: 'Raportează', onPress: () => {} },
                { text: 'Ascunde', onPress: () => {} },
                { text: 'Copiază link', onPress: () => {} },
                { text: 'Anulează', style: 'cancel' },
              ])
            }
          >
            <Feather name="more-horizontal" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ─── Post text ─── */}
        {item.caption && (
          <HashtagText
            text={item.caption}
            numberOfLines={3}
            style={[styles.postText, { color: Colors.text }]}
            onHashtagPress={(name) => {
              if (onHashtagPress) {
                onHashtagPress(name);
              } else {
                router.push(`/hashtag/${name}` as any);
              }
            }}
          />
        )}

        {/* ─── Post media with double-tap to like ─── */}
        {(item.thumb_url || item.media_url) && (
          <TapGestureHandler numberOfTaps={2} onHandlerStateChange={handleDoubleTap}>
            <Animated.View style={styles.postImageWrap}>
              {item.type === 'video' && item.media_url ? (
                <VideoPlayer
                  mediaUrl={item.media_url}
                  thumbUrl={item.thumb_url}
                  isActive={isActiveVideo ?? false}
                  isMuted={isMuted ?? true}
                  onMuteToggle={onMuteToggle ?? (() => {})}
                />
              ) : (
                <Image
                  source={{ uri: item.thumb_url || item.media_url || '' }}
                  style={styles.postImage}
                  resizeMode="cover"
                />
              )}
              {/* Heart overlay animation */}
              <Animated.View style={[styles.heartOverlay, heartOverlayStyle]} pointerEvents="none">
                <Ionicons
                  name="heart"
                  size={80}
                  color="#fff"
                  style={styles.heartIcon}
                />
              </Animated.View>
            </Animated.View>
          </TapGestureHandler>
        )}

        {/* ─── Stats row ─── */}
        {(displayLikes > 0 || item.comments_count > 0) && (
          <View style={[styles.statsRow, { borderBottomColor: Colors.separator }]}>
            {displayLikes > 0 && (
              <View style={styles.statItem}>
                <View style={styles.likeIcon}>
                  <Feather name="thumbs-up" size={10} color="#fff" />
                </View>
                <Animated.Text
                  style={[styles.statText, { color: Colors.textTertiary }, countAnimStyle]}
                >
                  {displayLikes}
                </Animated.Text>
              </View>
            )}
            {item.comments_count > 0 && (
              <Text style={[styles.statText, { color: Colors.textTertiary }]}>
                {item.comments_count} comentarii
              </Text>
            )}
          </View>
        )}

        {/* ─── Action buttons ─── */}
        <View style={styles.actionsRow}>
          {/* Like button with animation */}
          <TouchableOpacity
            ref={likeRef}
            style={[styles.actionButton, isLikePending && { opacity: 0.5 }]}
            onPress={handleLike}
            activeOpacity={0.6}
          >
            <View style={styles.likeButtonWrap}>
              {/* Particles */}
              {PARTICLES.map((p, i) => (
                <LikeParticle key={i} config={p} progress={particleBurst} />
              ))}
              {/* Icon layers */}
              <Animated.View style={iconAnimStyle}>
                <Animated.View style={[styles.iconAbsolute, iconGrayStyle]}>
                  <Feather name="thumbs-up" size={18} color={Colors.textSecondary} />
                </Animated.View>
                <Animated.View style={[styles.iconAbsolute, iconColorStyle]}>
                  <Feather name="thumbs-up" size={18} color={Brand.primary} />
                </Animated.View>
                <Feather name="thumbs-up" size={18} color="transparent" />
              </Animated.View>
            </View>
            <Animated.Text style={[styles.actionText, labelColorStyle]}>
              Apreciaza
            </Animated.Text>
          </TouchableOpacity>

          <TouchableOpacity
            ref={commentRef}
            style={styles.actionButton}
            onPress={handleComment}
            activeOpacity={0.6}
          >
            <Feather name="message-circle" size={18} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textSecondary }]}>Comenteaza</Text>
          </TouchableOpacity>

          <TouchableOpacity
            ref={shareRef}
            style={styles.actionButton}
            onPress={handleShare}
            activeOpacity={0.6}
          >
            <Feather name="send" size={18} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textSecondary }]}>Trimite</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </View>
  );
}

/* ── Particle that flies up from the like button ── */
function LikeParticle({
  config,
  progress,
}: {
  config: (typeof PARTICLES)[number];
  progress: { value: number };
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const delayed = Math.max(0, (p - config.delay / 600) / (1 - config.delay / 600));
    return {
      opacity: interpolate(delayed, [0, 0.2, 0.7, 1], [0, 1, 0.6, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(delayed, [0, 1], [0, config.dx], Extrapolation.CLAMP) },
        { translateY: interpolate(delayed, [0, 1], [0, config.dy], Extrapolation.CLAMP) },
        { scale: interpolate(delayed, [0, 0.3, 1], [0, 1, 0.3], Extrapolation.CLAMP) },
        { rotate: `${interpolate(delayed, [0, 1], [0, config.rot], Extrapolation.CLAMP)}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[styles.particle, style]}>
      <Feather name="thumbs-up" size={10} color={Brand.primary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    ...Bubble.radii,
  },
  card: {
    ...Bubble.radii,
    ...Bubble.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  /* ─── Author ─── */
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  authorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  authorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  authorInfo: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  authorName: {
    ...Typography.bodySemiBold,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorSubtitle: {
    ...Typography.small,
    marginTop: 1,
  },
  followButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Bubble.radiiSm,
  },
  followBtn: {
    backgroundColor: Brand.primary,
  },
  followingBtn: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  followText: {
    ...Typography.captionSemiBold,
  },
  moreBtn: {
    padding: Spacing.xs,
  },
  /* ─── Content ─── */
  postText: {
    ...Typography.caption,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
    lineHeight: 20,
  },
  postImageWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: IMAGE_RATIO,
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  heartIcon: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  /* ─── Stats ─── */
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: {
    ...Typography.small,
  },
  /* ─── Actions ─── */
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm + 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  actionText: {
    ...Typography.small,
    fontWeight: '600',
  },
  /* ─── Like button specifics ─── */
  likeButtonWrap: {
    position: 'relative',
  },
  iconAbsolute: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
  },
});
