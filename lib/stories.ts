import { supabase } from '@/lib/supabase';

export type StoryItem = {
  id: string;
  mediaUrl: string;
  type: 'image' | 'video';
  durationMs: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
  isSeen: boolean;
};

export type StoryGroup = {
  authorId: string;
  authorName: string;
  avatarUrl: string | null;
  hasUnseen: boolean;
  stories: StoryItem[];
};

export async function fetchStoriesWithSeenState(viewerId: string): Promise<StoryGroup[]> {
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id, author_id, media_url, type, duration_ms, thumbnail_url, created_at, expires_at,
      author:profiles!author_id(id, display_name, username, avatar_url),
      views:story_views!left(viewer_id)
    `)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  const rows = data as any[];

  // Group by author
  const authorMap = new Map<string, StoryGroup>();

  for (const story of rows) {
    const authorId = (story.author as any)?.id ?? story.author_id;
    // PostgREST may return a single object or null instead of an array when
    // there are 0 or 1 matching rows for the LEFT JOIN relation.
    // Normalize to an array before checking the current viewer's ID.
    const views: any[] = Array.isArray(story.views)
      ? story.views
      : story.views
      ? [story.views]
      : [];
    const isSeen = views.some((v: any) => v.viewer_id === viewerId);

    if (!authorMap.has(authorId)) {
      const author = story.author as any;
      authorMap.set(authorId, {
        authorId,
        authorName: author?.display_name ?? author?.username ?? 'Unknown',
        avatarUrl: author?.avatar_url ?? null,
        hasUnseen: false,
        stories: [],
      });
    }

    const group = authorMap.get(authorId)!;
    group.stories.push({
      id: story.id,
      mediaUrl: story.media_url,
      type: story.type as 'image' | 'video',
      durationMs: story.duration_ms,
      thumbnailUrl: story.thumbnail_url,
      createdAt: story.created_at,
      isSeen,
    });

    if (!isSeen) group.hasUnseen = true;
  }

  // Sort: unseen first, then by most recent story
  return Array.from(authorMap.values())
    .sort((a, b) => (a.hasUnseen === b.hasUnseen ? 0 : a.hasUnseen ? -1 : 1));
}
