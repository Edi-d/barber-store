import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, Salon } from '@/types/database';

// ─── Result types ─────────────────────────────────────────────────────────────

export type SearchProfile = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'role' | 'verified'
>;

export type SearchSalon = Pick<
  Salon,
  'id' | 'name' | 'avatar_url' | 'salon_types' | 'rating_avg' | 'address'
>;

export interface SearchPost {
  id: string;
  caption: string | null;
  thumb_url: string | null;
  media_url: string | null;
  type: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 2;

export function useSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const enabled = debouncedQuery.length >= MIN_QUERY_LEN;

  // ── Profiles ──────────────────────────────────────────────────────────────
  const profilesQuery = useQuery<SearchProfile[]>({
    queryKey: ['search', 'profiles', debouncedQuery],
    enabled,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      // Try full-text search first, fall back to ilike
      const { data: ftsData, error: ftsError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, role, verified')
        .textSearch('search_vector', debouncedQuery, {
          type: 'websearch',
          config: 'english',
        })
        .limit(6);

      if (!ftsError && ftsData && ftsData.length > 0) {
        return ftsData as SearchProfile[];
      }

      // Fallback: ilike on display_name
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, role, verified')
        .ilike('display_name', `%${debouncedQuery}%`)
        .limit(6);

      if (error) throw error;
      return (data ?? []) as SearchProfile[];
    },
  });

  // ── Salons ────────────────────────────────────────────────────────────────
  const salonsQuery = useQuery<SearchSalon[]>({
    queryKey: ['search', 'salons', debouncedQuery],
    enabled,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salons')
        .select('id, name, avatar_url, salon_types, rating_avg, address')
        .ilike('name', `%${debouncedQuery}%`)
        .limit(6);

      if (error) throw error;
      return (data ?? []) as SearchSalon[];
    },
  });

  // ── Posts ─────────────────────────────────────────────────────────────────
  const postsQuery = useQuery<SearchPost[]>({
    queryKey: ['search', 'posts', debouncedQuery],
    enabled,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      // Try full-text search on caption search_vector
      const { data: ftsData, error: ftsError } = await supabase
        .from('content')
        .select(`
          id, caption, thumb_url, media_url, type, created_at,
          author:profiles!author_id(id, username, display_name, avatar_url)
        `)
        .eq('status', 'published')
        .textSearch('search_vector', debouncedQuery, {
          type: 'websearch',
          config: 'english',
        })
        .limit(8);

      if (!ftsError && ftsData && ftsData.length > 0) {
        return ftsData as unknown as SearchPost[];
      }

      // Fallback: ilike on caption
      const { data, error } = await supabase
        .from('content')
        .select(`
          id, caption, thumb_url, media_url, type, created_at,
          author:profiles!author_id(id, username, display_name, avatar_url)
        `)
        .eq('status', 'published')
        .ilike('caption', `%${debouncedQuery}%`)
        .limit(8);

      if (error) throw error;
      return (data ?? []) as unknown as SearchPost[];
    },
  });

  const profiles = profilesQuery.data ?? [];
  const salons = salonsQuery.data ?? [];
  const posts = postsQuery.data ?? [];

  const isLoading =
    enabled &&
    (profilesQuery.isFetching || salonsQuery.isFetching || postsQuery.isFetching);

  const hasResults =
    enabled && (profiles.length > 0 || salons.length > 0 || posts.length > 0);

  return {
    profiles,
    salons,
    posts,
    isLoading,
    hasResults,
    isEnabled: enabled,
    debouncedQuery,
  };
}
