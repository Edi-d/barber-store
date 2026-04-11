import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Brand, Colors, Spacing, Typography, Shadows, Bubble } from '@/constants/theme';
import { useHashtagPosts } from '@/hooks/useHashtagPosts';
import { FeedCard } from '@/components/feed/FeedCard';
import { ContentWithAuthor } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { checkRateLimit } from '@/lib/rateLimit';

// ─── Header ──────────────────────────────────────────────────────────────────

function HashtagHeader({ name, postCount }: { name: string; postCount: number }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
      >
        <Feather name="arrow-left" size={22} color={Colors.text} />
      </Pressable>

      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>
          <Text style={{ color: Brand.primary }}>#</Text>
          {name}
        </Text>
        {postCount > 0 && (
          <Text style={styles.headerSubtitle}>
            {postCount.toLocaleString('ro-RO')} postari
          </Text>
        )}
      </View>

      {/* spacer to balance the back button */}
      <View style={{ width: 40 }} />
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HashtagScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const pendingLikeIds = useRef(new Set<string>());

  const hashtagName = Array.isArray(name) ? name[0] : name ?? '';

  const {
    data: hashtagData,
    isLoading,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useHashtagPosts(hashtagName);

  const posts: ContentWithAuthor[] = hashtagData?.pages.flatMap((p) => p) ?? [];

  // ── Like mutation (mirrors feed.tsx pattern) ───────────────────────────────
  const likeMutation = useMutation({
    mutationFn: async ({
      contentId,
      isLiked,
    }: {
      contentId: string;
      isLiked: boolean;
    }) => {
      const rateCheck = checkRateLimit('like');
      if (!rateCheck.allowed) throw new Error('Prea multe actiuni. Incearca din nou.');
      if (!session) throw new Error('Not authenticated');

      if (isLiked) {
        await supabase
          .from('likes')
          .delete()
          .eq('user_id', session.user.id)
          .eq('content_id', contentId);
      } else {
        await supabase
          .from('likes')
          .insert({ user_id: session.user.id, content_id: contentId });
      }
    },
    onMutate: async ({ contentId, isLiked }) => {
      await queryClient.cancelQueries({ queryKey: ['hashtag-posts', hashtagName] });
      const previous = queryClient.getQueryData<InfiniteData<ContentWithAuthor[]>>([
        'hashtag-posts',
        hashtagName,
      ]);

      queryClient.setQueryData<InfiniteData<ContentWithAuthor[]>>(
        ['hashtag-posts', hashtagName],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((item) =>
                item.id === contentId
                  ? {
                      ...item,
                      is_liked: !isLiked,
                      likes_count: item.likes_count + (isLiked ? -1 : 1),
                    }
                  : item
              )
            ),
          };
        }
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['hashtag-posts', hashtagName], context.previous);
      }
    },
    onSettled: (_data, _error, variables) => {
      pendingLikeIds.current.delete(variables.contentId);
    },
  });

  const handleLike = useCallback(
    (contentId: string, isLiked: boolean) => {
      if (pendingLikeIds.current.has(contentId)) return;
      pendingLikeIds.current.add(contentId);
      likeMutation.mutate({ contentId, isLiked });
    },
    [likeMutation]
  );

  const handleHashtagPress = useCallback((tagName: string) => {
    router.push(`/hashtag/${tagName}` as any);
  }, []);

  // ── Comment stub (opens nothing from hashtag screen — kept for FeedCard API)
  const [, setCommentsOpen] = useState(false);
  const handleComment = useCallback(() => {
    setCommentsOpen(true);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <HashtagHeader name={hashtagName} postCount={0} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Brand.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <HashtagHeader name={hashtagName} postCount={posts.length} />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Brand.primary}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            onLikeToggle={() => handleLike(item.id, item.is_liked || false)}
            onLikeAdd={() => {
              if (!(item.is_liked || false)) {
                handleLike(item.id, false);
              }
            }}
            onComment={handleComment}
            isLikePending={likeMutation.isPending}
            onHashtagPress={handleHashtagPress}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>#</Text>
            <Text style={styles.emptyTitle}>
              Niciun rezultat pentru #{hashtagName}
            </Text>
            <Text style={styles.emptySubtitle}>
              Fii primul care foloseste acest hashtag!
            </Text>
          </View>
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={Brand.primary} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...Bubble.radiiSm,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(10,102,194,0.18)',
    ...Shadows.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  headerSubtitle: {
    ...Typography.small,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  listContent: {
    paddingTop: Spacing.md,
    paddingBottom: 180,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    fontSize: 56,
    fontFamily: 'EuclidCircularA-Bold',
    color: Brand.primaryMuted,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
