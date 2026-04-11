import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Bubble, Shadows, Typography } from '@/constants/theme';
import { FeedCard } from '@/components/feed/FeedCard';
import { CommentsModal } from '@/components/feed/CommentsModal';
import type { ContentWithAuthor } from '@/types/database';

// ─── NavBar ───────────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <View style={st.navBar}>
      <Pressable
        onPress={() => router.back()}
        className="w-10 h-10 items-center justify-center"
        style={st.navIconBtn}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={20} color={Colors.text} />
      </Pressable>
      <Text style={st.navTitle}>Postare</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export default function PostViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const [commentsItem, setCommentsItem] = useState<ContentWithAuthor | null>(null);

  // ── Fetch single post ──────────────────────────────────────────────────

  const { data: post, isLoading, isError } = useQuery({
    queryKey: ['post', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content')
        .select(`*, author:profiles!author_id(*)`)
        .eq('id', id)
        .eq('status', 'published')
        .single();
      if (error) throw error;

      // Check if current user has liked this post
      if (session?.user.id) {
        const { data: likeRow } = await supabase
          .from('likes')
          .select('content_id')
          .eq('user_id', session.user.id)
          .eq('content_id', id)
          .maybeSingle();
        return { ...data, is_liked: !!likeRow } as ContentWithAuthor;
      }

      return { ...data, is_liked: false } as ContentWithAuthor;
    },
    enabled: !!id,
  });

  // ── Like mutation ──────────────────────────────────────────────────────

  const likeMutation = useMutation({
    mutationFn: async ({ isLiked }: { isLiked: boolean }) => {
      if (!session) throw new Error('Autentificare necesară');
      if (isLiked) {
        await supabase
          .from('likes')
          .delete()
          .eq('user_id', session.user.id)
          .eq('content_id', id);
      } else {
        await supabase.from('likes').insert({
          user_id: session.user.id,
          content_id: id,
        });
      }
    },
    onMutate: async ({ isLiked }) => {
      await queryClient.cancelQueries({ queryKey: ['post', id] });
      const previous = queryClient.getQueryData<ContentWithAuthor>(['post', id]);
      queryClient.setQueryData<ContentWithAuthor>(['post', id], (old) => {
        if (!old) return old;
        return {
          ...old,
          is_liked: !isLiked,
          likes_count: old.likes_count + (isLiked ? -1 : 1),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['post', id], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  const handleLike = () => {
    if (!post || likeMutation.isPending) return;
    likeMutation.mutate({ isLiked: post.is_liked ?? false });
  };

  const handleComment = () => {
    if (post) setCommentsItem(post);
  };

  // ── Loading ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <NavBar />
        <View style={st.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error / not found ──────────────────────────────────────────────────

  if (isError || !post) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <NavBar />
        <View style={st.center}>
          <Ionicons name="image-outline" size={52} color={Colors.textTertiary} />
          <Text style={st.emptyTitle}>Postare negăsită</Text>
          <Text style={st.emptySubtitle}>
            Această postare nu mai este disponibilă.
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-6 px-6 py-3"
            style={st.backBtn}
          >
            <Text style={st.backBtnText}>Înapoi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <NavBar />

      <ScrollView
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FeedCard
          item={post}
          onLikeToggle={handleLike}
          onLikeAdd={() => {
            if (!(post.is_liked ?? false)) {
              handleLike();
            }
          }}
          onComment={handleComment}
          isLikePending={likeMutation.isPending}
        />
      </ScrollView>

      <CommentsModal
        visible={commentsItem !== null}
        item={commentsItem}
        onClose={() => setCommentsItem(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // NavBar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  navIconBtn: {
    backgroundColor: Colors.background,
    ...Bubble.radiiSm,
    ...Shadows.sm,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 17,
    color: Colors.text,
  },

  // States
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: 'EuclidCircularA-Bold',
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  backBtn: {
    backgroundColor: Colors.primaryMuted,
    ...Bubble.radii,
  },
  backBtnText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 15,
    color: Colors.primary,
  },

  // Scroll
  scrollContent: {
    paddingBottom: 32,
  },
});
