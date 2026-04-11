import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  InfiniteData,
} from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Brand, Spacing, Typography, Colors, Shadows, Bubble } from '@/constants/theme';
import { ContentWithAuthor, CommentWithAuthor, CommentWithReplies } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { timeAgo } from '@/lib/utils';
import { useCommentReactions, useCommentReactionsRealtime, CommentReactionData, ReactionEmoji } from '@/hooks/useCommentReactions';
import { ReactionPicker } from '@/components/feed/ReactionPicker';
import { ReactionBubbles } from '@/components/feed/ReactionBubbles';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.88;
const DISMISS_THRESHOLD = 120;
const PAGE_SIZE = 20;

const SPRING_CONFIG = { damping: 20, stiffness: 180, mass: 0.8 };
const SPRING_FAST = { damping: 22, stiffness: 260, mass: 0.6 };

type Props = {
  visible: boolean;
  item: ContentWithAuthor | null;
  onClose: () => void;
};

type CommentsPage = {
  comments: CommentWithReplies[];
  nextCursor: string | null;
};

export function CommentsModal({ visible, item, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const { session, profile } = useAuthStore();
  const [commentText, setCommentText] = useState('');

  // Reply state
  const [replyTarget, setReplyTarget] = useState<CommentWithAuthor | null>(null);

  // Edit state
  const [editingComment, setEditingComment] = useState<CommentWithAuthor | null>(null);
  const [editText, setEditText] = useState('');

  // Expanded replies state
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  // Reaction state
  const { fetchReactions, toggleReaction } = useCommentReactions();
  const [reactions, setReactions] = useState<Map<string, CommentReactionData[]>>(new Map());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });
  const [pickerCommentId, setPickerCommentId] = useState<string | null>(null);

  /* ── Fetch comments with infinite query (top-level only) ── */
  const {
    data: commentsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<CommentsPage>({
    queryKey: ['comments', item?.id],
    queryFn: async ({ pageParam }) => {
      if (!item) return { comments: [], nextCursor: null };

      let query = supabase
        .from('comments')
        .select('*, author:profiles!user_id(*)')
        .eq('content_id', item.id)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) {
        query = query.lt('created_at', pageParam as string);
      }

      const { data, error } = await query;
      if (error) throw error;

      const comments = (data || []) as CommentWithAuthor[];

      // Fetch reply counts for each parent
      const parentIds = comments.map((c) => c.id);
      let replyCounts: Record<string, number> = {};
      if (parentIds.length > 0) {
        const { data: countData } = await supabase
          .from('comments')
          .select('parent_id')
          .in('parent_id', parentIds);

        if (countData) {
          for (const row of countData) {
            if (row.parent_id) {
              replyCounts[row.parent_id] = (replyCounts[row.parent_id] || 0) + 1;
            }
          }
        }
      }

      const commentsWithReplies: CommentWithReplies[] = comments.map((c) => ({
        ...c,
        replies: [],
        _replyCount: replyCounts[c.id] || 0,
      })) as any;

      const nextCursor =
        comments.length === PAGE_SIZE
          ? comments[comments.length - 1].created_at
          : null;

      return { comments: commentsWithReplies, nextCursor };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: visible && !!item,
  });

  // Flatten pages into a single list
  const allComments: (CommentWithReplies & { _replyCount?: number })[] =
    commentsData?.pages.flatMap((page) => page.comments) || [];

  /* ── Fetch reactions whenever the comment list changes ── */
  useEffect(() => {
    if (allComments.length === 0) return;
    const commentIds = allComments.map((c) => c.id);
    fetchReactions(commentIds).then((reactionsMap) => {
      setReactions(reactionsMap);
    });
  }, [commentsData]);

  /* ── Realtime subscription for comment_reactions ── */
  useCommentReactionsRealtime(item?.id, setReactions, visible && !!item);

  /* ── Handle reaction selection from picker ── */
  const handleReaction = useCallback(
    async (emoji: ReactionEmoji) => {
      if (!pickerCommentId) return;
      const commentId = pickerCommentId;
      const existing = reactions.get(commentId) ?? [];
      const current = existing.find((r) => r.reaction === emoji);
      const hasReacted = current?.hasReacted ?? false;

      // Optimistic update
      const prevReactions = new Map(reactions);
      setReactions((prev) => {
        const next = new Map(prev);
        const list = (next.get(commentId) ?? []).map((r) => {
          if (r.reaction !== emoji) return r;
          return { ...r, count: hasReacted ? Math.max(0, r.count - 1) : r.count + 1, hasReacted: !hasReacted };
        });
        // If no entry yet for this emoji, add one
        if (!list.find((r) => r.reaction === emoji)) {
          list.push({ comment_id: commentId, reaction: emoji, count: 1, hasReacted: true });
        }
        next.set(commentId, list.filter((r) => r.count > 0));
        return next;
      });
      setPickerVisible(false);

      try {
        await toggleReaction(commentId, emoji, hasReacted);
      } catch {
        // Revert on failure
        setReactions(prevReactions);
      }
    },
    [pickerCommentId, reactions, toggleReaction],
  );

  /* ── Handle long-press on a comment to show reaction picker ── */
  const handleCommentLongPress = useCallback(
    (comment: CommentWithAuthor, isReply: boolean, position: { x: number; y: number }) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPickerCommentId(comment.id);
      setPickerPosition(position);
      // Bug 6: if already visible, briefly hide so the spring re-runs from zero
      if (pickerVisible) {
        setPickerVisible(false);
        setTimeout(() => setPickerVisible(true), 0);
      } else {
        setPickerVisible(true);
      }
    },
    [pickerVisible],
  );

  /* ── Handle toggling a reaction bubble directly ── */
  const handleToggleReactionBubble = useCallback(
    async (commentId: string, emoji: ReactionEmoji, hasReacted: boolean) => {
      // Optimistic update
      const prevReactions = new Map(reactions);
      setReactions((prev) => {
        const next = new Map(prev);
        const list = (next.get(commentId) ?? []).map((r) => {
          if (r.reaction !== emoji) return r;
          return { ...r, count: hasReacted ? Math.max(0, r.count - 1) : r.count + 1, hasReacted: !hasReacted };
        });
        next.set(commentId, list.filter((r) => r.count > 0));
        return next;
      });

      try {
        await toggleReaction(commentId, emoji, hasReacted);
      } catch {
        setReactions(prevReactions);
      }
    },
    [reactions, toggleReaction],
  );

  /* ── Fetch replies for a specific parent ── */
  const fetchReplies = useCallback(
    async (parentId: string) => {
      const { data, error } = await supabase
        .from('comments')
        .select('*, author:profiles!user_id(*)')
        .eq('parent_id', parentId)
        .order('created_at', { ascending: true });

      if (error) return;

      // Inject replies into the infinite query cache
      queryClient.setQueryData<InfiniteData<CommentsPage>>(
        ['comments', item?.id],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              comments: page.comments.map((c) =>
                c.id === parentId
                  ? { ...c, replies: data as CommentWithAuthor[] }
                  : c,
              ),
            })),
          };
        },
      );

      setExpandedReplies((prev) => new Set(prev).add(parentId));

      // Fetch reactions for reply IDs
      if (data && data.length > 0) {
        const replyIds = (data as CommentWithAuthor[]).map((r) => r.id);
        fetchReactions(replyIds).then((replyReactions) => {
          setReactions((prev) => new Map([...prev, ...replyReactions]));
        });
      }
    },
    [item?.id, queryClient, fetchReactions],
  );

  const collapseReplies = useCallback((parentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
  }, []);

  /* ── Add comment / reply mutation ── */
  const addCommentMutation = useMutation({
    mutationFn: async ({
      text,
      parentId,
    }: {
      text: string;
      parentId?: string | null;
    }) => {
      if (!session || !item) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('comments')
        .insert({
          content_id: item.id,
          user_id: session.user.id,
          text,
          parent_id: parentId || null,
        })
        .select('*, author:profiles!user_id(*)')
        .single();

      if (error) throw error;
      return data as CommentWithAuthor;
    },
    onSuccess: (newComment) => {
      if (newComment.parent_id) {
        // It's a reply - inject into the parent's replies array
        queryClient.setQueryData<InfiniteData<CommentsPage>>(
          ['comments', item?.id],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                comments: page.comments.map((c) => {
                  if (c.id === newComment.parent_id) {
                    const existing = c.replies || [];
                    return {
                      ...c,
                      replies: [...existing, newComment],
                      _replyCount: ((c as any)._replyCount || 0) + 1,
                    };
                  }
                  return c;
                }),
              })),
            };
          },
        );
        // Auto-expand replies for this parent
        setExpandedReplies((prev) => new Set(prev).add(newComment.parent_id!));
      } else {
        // Top-level comment: prepend to first page
        queryClient.setQueryData<InfiniteData<CommentsPage>>(
          ['comments', item?.id],
          (old) => {
            if (!old) return old;
            const newPages = [...old.pages];
            if (newPages.length > 0) {
              newPages[0] = {
                ...newPages[0],
                comments: [
                  { ...newComment, replies: [], _replyCount: 0 } as any,
                  ...newPages[0].comments,
                ],
              };
            }
            return { ...old, pages: newPages };
          },
        );
      }

      // Update comments_count in feed
      queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(['feed'], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((feedItem) =>
              feedItem.id === item?.id
                ? { ...feedItem, comments_count: feedItem.comments_count + 1 }
                : feedItem,
            ),
          ),
        };
      });
    },
  });

  /* ── Edit comment mutation ── */
  const editCommentMutation = useMutation({
    mutationFn: async ({ commentId, text }: { commentId: string; text: string }) => {
      const { error } = await supabase
        .from('comments')
        .update({
          text,
          updated_at: new Date().toISOString(),
          is_edited: true,
        })
        .eq('id', commentId);

      if (error) throw error;
      return { commentId, text };
    },
    onMutate: async ({ commentId, text }) => {
      // Optimistic update
      queryClient.setQueryData<InfiniteData<CommentsPage>>(
        ['comments', item?.id],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              comments: page.comments.map((c) => {
                if (c.id === commentId) {
                  return { ...c, text, is_edited: true, updated_at: new Date().toISOString() };
                }
                // Also check replies
                if (c.replies?.length) {
                  return {
                    ...c,
                    replies: c.replies.map((r) =>
                      r.id === commentId
                        ? { ...r, text, is_edited: true, updated_at: new Date().toISOString() }
                        : r,
                    ),
                  };
                }
                return c;
              }),
            })),
          };
        },
      );
      setEditingComment(null);
      setEditText('');
    },
  });

  /* ── Delete comment mutation ── */
  const deleteCommentMutation = useMutation({
    mutationFn: async ({ commentId, isReply }: { commentId: string; isReply: boolean }) => {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
      return { commentId, isReply };
    },
    onMutate: async ({ commentId, isReply }) => {
      // Optimistic removal
      queryClient.setQueryData<InfiniteData<CommentsPage>>(
        ['comments', item?.id],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              comments: isReply
                ? page.comments.map((c) => ({
                    ...c,
                    replies: c.replies?.filter((r) => r.id !== commentId),
                    _replyCount: c.replies?.some((r) => r.id === commentId)
                      ? Math.max(0, ((c as any)._replyCount || 1) - 1)
                      : (c as any)._replyCount,
                  }))
                : page.comments.filter((c) => c.id !== commentId),
            })),
          };
        },
      );

      // Decrement comments_count in feed cache
      queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(['feed'], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((feedItem) =>
              feedItem.id === item?.id
                ? { ...feedItem, comments_count: Math.max(0, feedItem.comments_count - 1) }
                : feedItem,
            ),
          ),
        };
      });
    },
  });

  const handleSend = useCallback(() => {
    const text = commentText.trim();
    if (!text) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCommentText('');
    addCommentMutation.mutate({
      text,
      parentId: replyTarget?.id || null,
    });
    setReplyTarget(null);
  }, [commentText, addCommentMutation, replyTarget]);

  const handleReply = useCallback(
    (comment: CommentWithAuthor) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReplyTarget(comment);
      inputRef.current?.focus();
    },
    [],
  );

  /* ── Edit/delete menu for own comments (triggered by "..." button) ── */
  const handleEditDelete = useCallback(
    (comment: CommentWithAuthor, isReply: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert('Comentariu', undefined, [
        {
          text: 'Editeaza',
          onPress: () => {
            setEditingComment(comment);
            setEditText(comment.text);
          },
        },
        {
          text: 'Sterge',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Sterge comentariul',
              'Esti sigur ca vrei sa stergi acest comentariu?',
              [
                { text: 'Anuleaza', style: 'cancel' },
                {
                  text: 'Sterge',
                  style: 'destructive',
                  onPress: () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    deleteCommentMutation.mutate({ commentId: comment.id, isReply });
                  },
                },
              ],
            );
          },
        },
        { text: 'Anuleaza', style: 'cancel' },
      ]);
    },
    [deleteCommentMutation],
  );

  const handleSaveEdit = useCallback(
    (commentId: string) => {
      const text = editText.trim();
      if (!text || !editingComment) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      editCommentMutation.mutate({ commentId, text });
    },
    [editText, editingComment, editCommentMutation],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingComment(null);
    setEditText('');
  }, []);

  /* ── Animated values ── */
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const handleIndicator = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 250 });
      translateY.value = withSpring(0, SPRING_CONFIG);
      handleIndicator.value = withDelay(200, withSpring(1, SPRING_FAST));
    } else {
      handleIndicator.value = withTiming(0, { duration: 120 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(SCREEN_HEIGHT, {
        duration: 280,
        easing: Easing.in(Easing.cubic),
      });
      // Reset state on close
      setReplyTarget(null);
      setEditingComment(null);
      setEditText('');
      setExpandedReplies(new Set());
    }
  }, [visible]);

  const closeModal = useCallback(() => {
    handleIndicator.value = withTiming(0, { duration: 120 });
    backdropOpacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 280, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
  }, [onClose]);

  /* ── Drag to dismiss ── */
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY * 0.6;
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 800) {
        runOnJS(closeModal)();
      } else {
        translateY.value = withSpring(0, SPRING_FAST);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.45,
    pointerEvents: backdropOpacity.value > 0 ? ('auto' as const) : ('none' as const),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleStyle = useAnimatedStyle(() => ({
    opacity: handleIndicator.value,
    transform: [
      {
        scaleX: interpolate(
          handleIndicator.value,
          [0, 1],
          [0.3, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      if (!authorId) return;
      if (authorId === session?.user.id) {
        closeModal();
        router.push('/(tabs)/profile');
      } else {
        closeModal();
        router.push(`/profile/${authorId}` as any);
      }
    },
    [session?.user.id, closeModal],
  );

  const renderComment = useCallback(
    ({ item: comment, index }: { item: CommentWithReplies & { _replyCount?: number }; index: number }) => (
      <CommentRow
        comment={comment}
        index={index}
        visible={visible}
        isReply={false}
        currentUserId={session?.user.id || null}
        editingComment={editingComment}
        editText={editText}
        setEditText={setEditText}
        onReply={handleReply}
        onEditDelete={handleEditDelete}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        onAuthorPress={handleAuthorPress}
        expandedReplies={expandedReplies}
        onExpandReplies={fetchReplies}
        onCollapseReplies={collapseReplies}
        commentReactions={reactions.get(comment.id) ?? []}
        allReactions={reactions}
        onReactionLongPress={handleCommentLongPress}
        onToggleReactionBubble={handleToggleReactionBubble}
      />
    ),
    [
      visible,
      session,
      editingComment,
      editText,
      handleReply,
      handleEditDelete,
      handleSaveEdit,
      handleCancelEdit,
      handleAuthorPress,
      expandedReplies,
      fetchReplies,
      collapseReplies,
      reactions,
      handleCommentLongPress,
      handleToggleReactionBubble,
    ],
  );

  const keyExtractor = useCallback((c: CommentWithReplies) => c.id, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!item) return null;

  const commentCount = allComments.length || item.comments_count;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeModal}
    >
      <View style={styles.modalRoot}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeModal}
          />
        </Animated.View>

        {/* Sheet */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
          keyboardVerticalOffset={0}
        >
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheetContainer, sheetStyle]}>
            <BlurView
              intensity={85}
              tint="light"
              style={styles.sheet}
            >
            {/* Drag handle */}
            <View style={styles.handleRow}>
              <Animated.View style={[styles.handle, handleStyle]} />
            </View>

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: Colors.text }]}>
                Comentarii
              </Text>
              <View style={styles.commentCountBadge}>
                <Text style={styles.commentCountText}>{commentCount}</Text>
              </View>
            </View>

            {/* Comments list - constrained to flex:1 so input stays visible */}
            <View style={styles.listContainer}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Brand.primary} />
                </View>
              ) : (
                <FlatList
                  data={allComments}
                  renderItem={renderComment}
                  keyExtractor={keyExtractor}
                  extraData={reactions}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  onEndReached={handleEndReached}
                  onEndReachedThreshold={0.3}
                  ListFooterComponent={
                    isFetchingNextPage ? (
                      <View style={styles.footerLoader}>
                        <ActivityIndicator size="small" color={Brand.primary} />
                      </View>
                    ) : null
                  }
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Feather
                        name="message-circle"
                        size={40}
                        color={Colors.textTertiary}
                        style={{ opacity: 0.5 }}
                      />
                      <Text
                        style={[styles.emptyText, { color: Colors.textTertiary }]}
                      >
                        Fii primul care comenteaza!
                      </Text>
                    </View>
                  }
                />
              )}
            </View>

            {/* Reply indicator */}
            {replyTarget && (
              <View style={styles.replyIndicator}>
                <Text style={styles.replyIndicatorText}>
                  Raspunzi lui{' '}
                  <Text style={styles.replyIndicatorName}>
                    @{replyTarget.author?.username || replyTarget.author?.display_name || 'User'}
                  </Text>
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setReplyTarget(null);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Input bar - Instagram style */}
            <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.inputAvatar}
                />
              ) : (
                <View
                  style={[
                    styles.inputAvatar,
                    { backgroundColor: Brand.primary },
                  ]}
                >
                  <Text style={styles.inputAvatarLetter}>
                    {(profile?.display_name || profile?.username || 'U')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.inputWrapper,
                  replyTarget && styles.inputWrapperActive,
                ]}
              >
                <TextInput
                  ref={inputRef}
                  style={[styles.input, { color: Colors.text }]}
                  placeholder={
                    replyTarget
                      ? 'Scrie un raspuns...'
                      : 'Adauga un comentariu...'
                  }
                  placeholderTextColor={Colors.textTertiary}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                />
                {commentText.trim() ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={addCommentMutation.isPending}
                    onPress={handleSend}
                    style={styles.sendBtnInline}
                  >
                    <Text style={styles.sendBtnText}>
                      {addCommentMutation.isPending ? '...' : 'Posteaza'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            </BlurView>
          </Animated.View>
        </GestureDetector>
        </KeyboardAvoidingView>
      </View>

      <ReactionPicker
        visible={pickerVisible}
        position={pickerPosition}
        onReact={(emoji) => handleReaction(emoji as ReactionEmoji)}
        onClose={() => setPickerVisible(false)}
      />
    </Modal>
  );
}

/* ── Individual comment row with stagger animation ── */
function CommentRow({
  comment,
  index,
  visible,
  isReply,
  currentUserId,
  editingComment,
  editText,
  setEditText,
  onReply,
  onEditDelete,
  onSaveEdit,
  onCancelEdit,
  onAuthorPress,
  expandedReplies,
  onExpandReplies,
  onCollapseReplies,
  commentReactions,
  allReactions,
  onReactionLongPress,
  onToggleReactionBubble,
}: {
  comment: CommentWithReplies & { _replyCount?: number };
  index: number;
  visible: boolean;
  isReply: boolean;
  currentUserId: string | null;
  editingComment: CommentWithAuthor | null;
  editText: string;
  setEditText: (text: string) => void;
  onReply: (comment: CommentWithAuthor) => void;
  onEditDelete: (comment: CommentWithAuthor, isReply: boolean) => void;
  onSaveEdit: (commentId: string) => void;
  onCancelEdit: () => void;
  onAuthorPress: (authorId: string) => void;
  expandedReplies: Set<string>;
  onExpandReplies: (parentId: string) => void;
  onCollapseReplies: (parentId: string) => void;
  commentReactions: CommentReactionData[];
  allReactions: Map<string, CommentReactionData[]>;
  onReactionLongPress: (comment: CommentWithAuthor, isReply: boolean, position: { x: number; y: number }) => void;
  onToggleReactionBubble: (commentId: string, emoji: ReactionEmoji, hasReacted: boolean) => void;
}) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(30);

  useEffect(() => {
    if (visible) {
      const delay = isReply ? 80 + index * 40 : 150 + index * 60;
      opacity.value = withDelay(delay, withSpring(1, SPRING_FAST));
      translateX.value = withDelay(delay, withSpring(0, SPRING_FAST));
    } else {
      opacity.value = 0;
      translateX.value = 30;
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const authorName =
    comment.author?.display_name || comment.author?.username || 'User';
  const isEditing = editingComment?.id === comment.id;
  const isOwn = currentUserId === comment.user_id;

  const replyCount = (comment as any)._replyCount || comment.replies?.length || 0;
  const isExpanded = expandedReplies.has(comment.id);
  const replies = comment.replies || [];

  return (
    <View style={isReply ? styles.replyContainer : undefined}>
      <Animated.View style={[styles.commentRow, animStyle]}>
        <View style={styles.commentRowInner}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => comment.user_id && onAuthorPress(comment.user_id)}
          >
            {comment.author?.avatar_url ? (
              <Image
                source={{ uri: comment.author.avatar_url }}
                style={isReply ? styles.replyAvatar : styles.commentAvatar}
              />
            ) : (
              <View
                style={[
                  isReply ? styles.replyAvatar : styles.commentAvatar,
                  { backgroundColor: Brand.primary + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.commentAvatarLetter,
                    { color: Brand.primary, fontSize: isReply ? 11 : 14 },
                  ]}
                >
                  {authorName[0].toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onLongPress={(e) => {
              const { pageX, pageY } = e.nativeEvent;
              onReactionLongPress(comment, isReply, { x: pageX, y: pageY });
            }}
            delayLongPress={400}
            style={styles.commentBody}
          >
            <View
              style={[
                styles.commentBubble,
                isReply && styles.replyBubble,
                isOwn && !isEditing && styles.ownCommentBubble,
              ]}
            >
              <Text style={[styles.commentAuthor, { color: Colors.text }]}>
                {authorName}
              </Text>
              {isEditing ? (
                <View>
                  <TextInput
                    style={[styles.editInput, { color: Colors.text }]}
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    maxLength={500}
                    autoFocus
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity
                      onPress={onCancelEdit}
                      style={styles.editActionBtn}
                    >
                      <Text
                        style={[
                          styles.editActionText,
                          { color: Colors.textSecondary },
                        ]}
                      >
                        Anuleaza
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onSaveEdit(comment.id)}
                      style={[
                        styles.editActionBtn,
                        styles.editSaveBtn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.editActionText,
                          { color: Brand.primary },
                        ]}
                      >
                        Salveaza
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Text style={[styles.commentText, { color: Colors.text }]}>
                  {comment.text}
                </Text>
              )}
            </View>
            <View style={styles.commentMeta}>
              <Text
                style={[styles.commentTime, { color: Colors.textTertiary }]}
              >
                {timeAgo(comment.created_at)}
              </Text>
              {comment.is_edited && (
                <Text
                  style={[
                    styles.editedLabel,
                    { color: Colors.textTertiary },
                  ]}
                >
                  (editat)
                </Text>
              )}
              {!isReply && (
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => onReply(comment)}
                >
                  <Text
                    style={[
                      styles.commentAction,
                      { color: Colors.textSecondary },
                    ]}
                  >
                    Raspunde
                  </Text>
                </TouchableOpacity>
              )}
              {isOwn && (
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => onEditDelete(comment, isReply)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="more-horizontal" size={14} color={Colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            {commentReactions.length > 0 && (
              <ReactionBubbles
                reactions={commentReactions}
                onToggle={(emoji, hasReacted) =>
                  onToggleReactionBubble(comment.id, emoji, hasReacted)
                }
              />
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Replies section (only for top-level comments) */}
      {!isReply && replyCount > 0 && (
        <View style={styles.repliesSection}>
          {isExpanded ? (
            <>
              {replies.map((reply, rIdx) => (
                <CommentRow
                  key={reply.id}
                  comment={{ ...reply, replies: [] } as any}
                  index={rIdx}
                  visible={visible}
                  isReply
                  currentUserId={currentUserId}
                  editingComment={editingComment}
                  editText={editText}
                  setEditText={setEditText}
                  onReply={onReply}
                  onEditDelete={onEditDelete}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  onAuthorPress={onAuthorPress}
                  expandedReplies={expandedReplies}
                  onExpandReplies={onExpandReplies}
                  onCollapseReplies={onCollapseReplies}
                  commentReactions={allReactions.get(reply.id) ?? []}
                  allReactions={allReactions}
                  onReactionLongPress={onReactionLongPress}
                  onToggleReactionBubble={onToggleReactionBubble}
                />
              ))}
              <TouchableOpacity
                style={styles.viewRepliesBtn}
                onPress={() => onCollapseReplies(comment.id)}
                activeOpacity={0.6}
              >
                <View style={styles.replyLine} />
                <Text style={styles.viewRepliesText}>Ascunde raspunsurile</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.viewRepliesBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onExpandReplies(comment.id);
              }}
              activeOpacity={0.6}
            >
              <View style={styles.replyLine} />
              <Text style={styles.viewRepliesText}>
                Vezi {replyCount} {replyCount === 1 ? 'raspuns' : 'raspunsuri'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.backdropBlack,
  },
  keyboardAvoid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    ...Shadows.glass,
  },
  sheet: {
    flex: 1,
    ...Bubble.sheetRadii,
    borderCurve: 'continuous' as const,
    overflow: 'hidden',
    backgroundColor: 'rgba(240, 244, 248, 0.92)',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.cardBorder,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.handleBar,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  sheetTitle: {
    ...Typography.h3,
  },
  commentCountBadge: {
    backgroundColor: Brand.primary,
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    borderCurve: 'continuous' as const,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  commentCountText: {
    ...Typography.smallSemiBold,
    color: Brand.white,
  },
  listContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3xl'] * 2,
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.caption,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  footerLoader: {
    paddingVertical: Spacing.base,
    alignItems: 'center',
  },
  commentRow: {
    marginBottom: Spacing.base,
  },
  commentRowInner: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderCurve: 'continuous' as const,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  replyAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderCurve: 'continuous' as const,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  commentAvatarLetter: {
    ...Typography.captionSemiBold,
  },
  commentBody: {
    flex: 1,
  },
  commentBubble: {
    ...Bubble.radiiSm,
    borderCurve: 'continuous' as const,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Shadows.sm,
  },
  replyBubble: {
    backgroundColor: Colors.glassLight,
  },
  ownCommentBubble: {
    borderColor: Brand.primary + '25',
  },
  commentAuthor: {
    ...Typography.captionSemiBold,
    marginBottom: Spacing.xs,
  },
  commentText: {
    ...Typography.caption,
    lineHeight: 19,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  commentTime: {
    ...Typography.small,
  },
  editedLabel: {
    ...Typography.small,
    fontStyle: 'italic',
  },
  commentAction: {
    ...Typography.smallSemiBold,
  },
  // Reply threading
  replyContainer: {
    marginLeft: Spacing.lg + Spacing.sm + 34, // avatar width + gap + indent
  },
  repliesSection: {
    marginLeft: 36,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.sm,
  },
  viewRepliesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  replyLine: {
    width: 24,
    height: 1,
    backgroundColor: Colors.textTertiary,
    opacity: 0.4,
  },
  viewRepliesText: {
    ...Typography.smallSemiBold,
    color: Colors.textSecondary,
  },
  // Reply indicator above input
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Brand.primaryMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.primary + '20',
  },
  replyIndicatorText: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  replyIndicatorName: {
    ...Typography.smallSemiBold,
    color: Brand.primary,
  },
  // Edit inline
  editInput: {
    ...Typography.caption,
    lineHeight: 19,
    padding: 0,
    margin: 0,
    borderBottomWidth: 1,
    borderBottomColor: Brand.primary + '40',
    paddingBottom: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
  },
  editActionBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  editSaveBtn: {},
  editActionText: {
    ...Typography.smallSemiBold,
  },
  // Input bar - Instagram style
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.separator,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  inputAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderCurve: 'continuous' as const,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputAvatarLetter: {
    ...Typography.captionSemiBold,
    color: Brand.white,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    ...Bubble.radii,
    borderCurve: 'continuous' as const,
    paddingHorizontal: Spacing.base,
    paddingVertical: Platform.OS === 'ios' ? 10 : Spacing.sm,
    maxHeight: 100,
    backgroundColor: Colors.inputBackground,
  },
  inputWrapperActive: {
    borderColor: Brand.primary + '40',
  },
  input: {
    ...Typography.caption,
    flex: 1,
    padding: 0,
    margin: 0,
  },
  sendBtnInline: {
    marginLeft: Spacing.sm,
  },
  sendBtnText: {
    ...Typography.captionSemiBold,
    color: Brand.primary,
  },
});
