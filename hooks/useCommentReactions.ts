import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { getOrCreateChannel, removeChannel } from '@/lib/realtime';

export const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export type CommentReactionData = {
  comment_id: string;
  reaction: ReactionEmoji;
  count: number;
  hasReacted: boolean;
};

export function useCommentReactions() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  async function fetchReactions(
    commentIds: string[]
  ): Promise<Map<string, CommentReactionData[]>> {
    const result = new Map<string, CommentReactionData[]>();
    if (commentIds.length === 0) return result;

    const { data, error } = await supabase
      .from('comment_reactions')
      .select('comment_id, reaction, user_id')
      .in('comment_id', commentIds);

    if (error) {
      console.error('[useCommentReactions] fetchReactions error:', error);
      return result;
    }

    // Group rows by comment_id + reaction, tally counts and hasReacted flag
    const grouped = new Map<string, { count: number; hasReacted: boolean }>();

    for (const row of data ?? []) {
      const key = `${row.comment_id}::${row.reaction}`;
      const existing = grouped.get(key) ?? { count: 0, hasReacted: false };
      existing.count += 1;
      if (userId && row.user_id === userId) existing.hasReacted = true;
      grouped.set(key, existing);
    }

    for (const [key, value] of grouped) {
      const [comment_id, reaction] = key.split('::') as [string, ReactionEmoji];
      const entry: CommentReactionData = {
        comment_id,
        reaction,
        count: value.count,
        hasReacted: value.hasReacted,
      };
      const list = result.get(comment_id) ?? [];
      list.push(entry);
      result.set(comment_id, list);
    }

    return result;
  }

  async function toggleReaction(
    commentId: string,
    reaction: ReactionEmoji,
    hasReacted: boolean
  ): Promise<void> {
    if (!userId) return;

    if (hasReacted) {
      const { error } = await supabase
        .from('comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId)
        .eq('reaction', reaction);

      if (error) console.error('[useCommentReactions] toggleReaction delete error:', error);
    } else {
      const { error } = await supabase
        .from('comment_reactions')
        .insert({ comment_id: commentId, user_id: userId, reaction });

      if (error) console.error('[useCommentReactions] toggleReaction insert error:', error);
    }
  }

  return { fetchReactions, toggleReaction };
}

/**
 * Subscribes to Supabase Realtime postgres_changes on the `comment_reactions`
 * table, scoped to the open comment sheet for a given content item.
 *
 * The channel is named `comment-reactions:<contentId>` so the channel registry
 * deduplicates it across StrictMode double-mounts and sibling renders.
 *
 * INSERT events increment the count (and set hasReacted when the row belongs to
 * the current user). DELETE events decrement the count and clear hasReacted,
 * pruning entries that reach zero. The state updater function is passed in by
 * CommentsModal so reaction state stays owned by the component.
 *
 * @param contentId  - The content / post ID whose comments are displayed.
 * @param setReactions - React setState dispatcher from the caller.
 * @param enabled    - Whether the sheet is open; skips the subscription when false.
 */
export function useCommentReactionsRealtime(
  contentId: string | null | undefined,
  setReactions: React.Dispatch<React.SetStateAction<Map<string, CommentReactionData[]>>>,
  enabled: boolean
) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  useEffect(() => {
    if (!enabled || !contentId) return;

    const channelName = `comment-reactions:${contentId}`;

    const channel = getOrCreateChannel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comment_reactions',
        },
        (payload) => {
          const row = payload.new as {
            comment_id: string;
            reaction: ReactionEmoji;
            user_id: string;
          };

          setReactions((prev) => {
            const next = new Map(prev);
            const list = next.get(row.comment_id) ?? [];
            const idx = list.findIndex((r) => r.reaction === row.reaction);

            if (idx >= 0) {
              const updated = [...list];
              updated[idx] = {
                ...updated[idx],
                count: updated[idx].count + 1,
                hasReacted: updated[idx].hasReacted || row.user_id === userId,
              };
              next.set(row.comment_id, updated);
            } else {
              next.set(row.comment_id, [
                ...list,
                {
                  comment_id: row.comment_id,
                  reaction: row.reaction,
                  count: 1,
                  hasReacted: row.user_id === userId,
                },
              ]);
            }

            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comment_reactions',
        },
        (payload) => {
          const row = payload.old as {
            comment_id: string;
            reaction: ReactionEmoji;
            user_id: string;
          };

          setReactions((prev) => {
            const next = new Map(prev);
            const list = next.get(row.comment_id);
            if (!list) return prev;

            const updated = list
              .map((r) => {
                if (r.reaction !== row.reaction) return r;
                return {
                  ...r,
                  count: Math.max(0, r.count - 1),
                  hasReacted: row.user_id === userId ? false : r.hasReacted,
                };
              })
              .filter((r) => r.count > 0);

            next.set(row.comment_id, updated);
            return next;
          });
        }
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          console.log(`[Realtime] ${channelName} status:`, status, err ?? '');
        }
      });

    return () => {
      removeChannel(channelName);
    };
  }, [contentId, enabled, userId]);
}

export function useCommentLikes() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  async function toggleCommentLike(commentId: string, isLiked: boolean): Promise<void> {
    if (!userId) return;

    if (isLiked) {
      await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);
    } else {
      // Upsert — ignore duplicate if already liked
      await supabase
        .from('comment_likes')
        .upsert({ comment_id: commentId, user_id: userId }, { onConflict: 'user_id,comment_id' });
    }
  }

  return { toggleCommentLike };
}
