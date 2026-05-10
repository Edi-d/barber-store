/**
 * useShopXP — shop marketplace XP system ("XP Magazin").
 *
 * Separate from the platform XP (platform_xp_transactions) — this is a
 * spendable reward currency per-user per-salon, earned from marketplace
 * orders, spent on Glamm/Rovra reward products.
 *
 * Adapter changes from Tapzi source:
 * - useAuth() from @/providers/auth-provider (Wave A shim over useAuthStore)
 * - useSalon() from @/providers/salon-provider (Wave A port)
 * - salonId override param; defaults via useSalon() if not provided
 * - earnXP() returns { xp_earned, leveled_up, level } | null (per spec 08)
 * - Realtime channel name: shop-xp-{user_id}-{salon_id}
 *
 * Tables: user_shop_xp, shop_xp_transactions, xp_level_thresholds
 * RPC: earn_xp_from_purchase (migration 069)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useSalon } from '@/providers/salon-provider';
import type {
  UserShopXP,
  XPSummary,
  XPLevel,
} from '@/types/shop-xp';

const TAG = '[SHOP-XP]';

// ─── Default XP Levels (match DB seed in 069_shop_gamification_xp.sql) ──

const DEFAULT_LEVELS: XPLevel[] = [
  { level: 1, title: 'Bronze', xpRequired: 0, perks: ['Acces la produse de baza'] },
  { level: 2, title: 'Silver', xpRequired: 1000, perks: ['Acces la produse exclusive', 'Badge Silver pe profil'] },
  { level: 3, title: 'Gold', xpRequired: 3000, perks: ['Produse Gold deblocate', 'Acces anticipat la produse noi'] },
  { level: 4, title: 'Platinum', xpRequired: 7000, perks: ['Produse Platinum disponibile', 'Prioritate la comenzi'] },
  { level: 5, title: 'Diamond', xpRequired: 15000, perks: ['Toate produsele deblocate', 'Prioritate maxima', 'Cadou la fiecare nivel'] },
];

// ─── Types ──────────────────────────────────────────────

export type EarnXPResult = {
  xp_earned: number;
  leveled_up: boolean;
  level: number;
};

export interface UseShopXPReturn {
  xpSummary: XPSummary | null;
  isLoading: boolean;
  error: string | null;
  /** Returns { xp_earned, leveled_up, level } on success, null on failure. */
  earnXP: (orderId: string, amountRon: number) => Promise<EarnXPResult | null>;
  refetch: () => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────

function computeSummary(
  userXP: UserShopXP,
  levels: XPLevel[],
): XPSummary {
  const sorted = [...levels].sort((a, b) => a.xpRequired - b.xpRequired);
  const currentLevel = sorted
    .filter((l) => userXP.totalXPEarned >= l.xpRequired)
    .pop() ?? sorted[0];
  const nextLevel = sorted.find((l) => l.xpRequired > userXP.totalXPEarned) ?? null;

  const xpToNextLevel = nextLevel
    ? nextLevel.xpRequired - userXP.totalXPEarned
    : 0;

  const progressPercentage = nextLevel
    ? Math.round(
        ((userXP.totalXPEarned - currentLevel.xpRequired) /
          (nextLevel.xpRequired - currentLevel.xpRequired)) *
          100,
      )
    : 100;

  return {
    currentXP: userXP.currentXP,
    totalXP: userXP.totalXPEarned,
    level: currentLevel.level,
    levelTitle: currentLevel.title,
    xpToNextLevel,
    progressPercentage: Math.max(0, Math.min(100, progressPercentage)),
  };
}

function mapRowToUserXP(row: any): UserShopXP {
  return {
    id: row.id,
    userId: row.user_id,
    salonId: row.salon_id,
    currentXP: row.current_xp ?? 0,
    totalXPEarned: row.total_xp_earned ?? 0,
    level: row.level ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Hook ───────────────────────────────────────────────

/**
 * @param salonIdOverride — optional explicit salon ID. When omitted, the hook
 *   reads from useSalon() context. Pass explicitly on screens that have their
 *   own salon scope (e.g., app/salon/[id].tsx).
 */
export function useShopXP(salonIdOverride?: string): UseShopXPReturn {
  const { user } = useAuth();

  // Resolve salon ID from context if not overridden.
  // useSalon() is safe here — SalonProvider is mounted at root layout (Wave A).
  const { salon } = useSalon();
  const contextSalonId: string | null = salon?.id ?? null;
  const salonId = salonIdOverride ?? contextSalonId ?? undefined;

  const [userXP, setUserXP] = useState<UserShopXP | null>(null);
  const [levels, setLevels] = useState<XPLevel[]>(DEFAULT_LEVELS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch XP data ──

  const fetchData = useCallback(async () => {
    if (!user?.id || !salonId) {
      setUserXP(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    try {
      setError(null);

      // Fetch user XP and level thresholds in parallel
      const [xpRes, levelsRes] = await Promise.all([
        supabase
          .from('user_shop_xp')
          .select('*')
          .eq('user_id', user.id)
          .eq('salon_id', salonId)
          .maybeSingle(),
        supabase
          .from('xp_level_thresholds')
          .select('*')
          .order('xp_required', { ascending: true }),
      ]);

      if (xpRes.error) throw xpRes.error;

      if (xpRes.data) {
        setUserXP(mapRowToUserXP(xpRes.data));
      } else {
        setUserXP(null);
      }

      // Use DB levels if available, otherwise keep defaults
      if (!levelsRes.error && levelsRes.data && levelsRes.data.length > 0) {
        setLevels(
          levelsRes.data.map((r: any) => ({
            level: r.level,
            title: r.title,
            xpRequired: r.xp_required,
            perks: r.perks ?? [],
          })),
        );
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Eroare la incarcarea XP-ului';
      console.error(TAG, 'fetchData error:', msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, salonId]);

  // ── Initial fetch ──

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  // ── Realtime subscription ──

  useEffect(() => {
    if (!user?.id || !salonId) return;

    const channel = supabase
      .channel(`shop-xp-${user.id}-${salonId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_shop_xp',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row && row.salon_id === salonId) {
            if (payload.eventType === 'DELETE') {
              setUserXP(null);
            } else {
              setUserXP(mapRowToUserXP(row));
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, salonId]);

  // ── Earn XP — returns structured result for toast/modal queue ──

  const earnXP = useCallback(
    async (orderId: string, amountRon: number): Promise<EarnXPResult | null> => {
      if (!user?.id || !salonId) return null;

      try {
        const { data, error: rpcErr } = await supabase.rpc('earn_xp_from_purchase', {
          p_user_id: user.id,
          p_salon_id: salonId,
          p_order_id: orderId,
          p_amount_ron: amountRon,
        });

        if (rpcErr) throw rpcErr;

        // Refetch for safety; realtime will also pick up the change
        await fetchData();

        // Parse the RPC response; fall back to a minimal result on unexpected shape
        const result = data as any;
        return {
          xp_earned: Number(result?.xp_earned ?? 0),
          leveled_up: Boolean(result?.leveled_up ?? false),
          level: Number(result?.level ?? userXP?.level ?? 1),
        };
      } catch (err: any) {
        const msg = err?.message ?? 'Eroare la acordarea XP-ului';
        console.error(TAG, 'earnXP error:', msg);
        return null;
      }
    },
    [user?.id, salonId, fetchData, userXP?.level],
  );

  // ── Computed summary ──

  const xpSummary = useMemo<XPSummary | null>(() => {
    if (!userXP) return null;
    return computeSummary(userXP, levels);
  }, [userXP, levels]);

  return {
    xpSummary,
    isLoading,
    error,
    earnXP,
    refetch: fetchData,
  };
}
