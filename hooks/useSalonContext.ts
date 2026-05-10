/**
 * useSalonContext — derive the active salon + owner status for the current user.
 * Reads from `salon_members` table (role = 'owner').
 * Replaces `useSalon()` from Tapzi's salon-provider in ported screens.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export type SalonContext = {
  salonId: string | null;
  isOwner: boolean;
  loading: boolean;
};

export function useSalonContext(): SalonContext {
  const session = useAuthStore((s) => s.session);
  const [salonId, setSalonId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user.id) {
      setLoading(false);
      return;
    }
    supabase
      .from('salon_members')
      .select('salon_id, role')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setSalonId(data?.salon_id ?? null);
        setIsOwner(data?.role === 'owner');
        setLoading(false);
      });
  }, [session?.user.id]);

  return { salonId, isOwner, loading };
}
