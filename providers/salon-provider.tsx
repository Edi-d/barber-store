/**
 * Salon provider — ported verbatim from Tapzi-barber/providers/salon-provider.tsx
 * with auth source adjusted to use the barber-store useAuth() shim.
 *
 * Exposes salon, members, services, hours, isOwner, and refresh helpers
 * via useSalon() hook. Required for all marketplace screens that determine
 * buyer mode (salon vs. client).
 *
 * Mounted inside <QueryClientProvider> in app/_layout.tsx.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const TAG = '[SALON]';

// ─── Types ────────────────────────────────────────────────────
export type Salon = {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  description: string | null;
  bio: string | null;
  specialties: string[] | null;
  latitude: number | null;
  longitude: number | null;
  rating_avg: number;
  reviews_count: number;
  avg_price_cents: number;
  is_promoted: boolean;
  amenities: string[] | null;
  active: boolean;
  salon_types: string[];
  created_at: string;
};

export type SalonMember = {
  id: string;
  salon_id: string;
  profile_id: string;
  role: 'owner' | 'barber';
  joined_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    username: string;
  };
};

export type BarberService = {
  id: string;
  salon_id: string | null;
  name: string;
  description: string | null;
  duration_min: number;
  price_cents: number;
  currency: string;
  category: string;
  active: boolean;
  created_at: string;
};

export type SalonHours = {
  id: string;
  salon_id: string;
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

type SalonContextType = {
  salon: Salon | null;
  members: SalonMember[];
  services: BarberService[];
  hours: SalonHours[];
  loading: boolean;
  isOwner: boolean;
  refreshSalon: () => Promise<void>;
  refreshServices: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshHours: () => Promise<void>;
};

const SalonContext = createContext<SalonContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────
export function SalonProvider({ children }: { children: ReactNode }) {
  const { profile, user } = useAuth();

  const [salon, setSalon] = useState<Salon | null>(null);
  const [members, setMembers] = useState<SalonMember[]>([]);
  const [services, setServices] = useState<BarberService[]>([]);
  const [hours, setHours] = useState<SalonHours[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwner = profile?.onboarding_role === 'salon_owner';

  // ── Fetch salon ───────────────────────────────────────────
  const fetchSalon = useCallback(async () => {
    if (!user?.id || !profile?.onboarding_completed) {
      setSalon(null);
      setLoading(false);
      return;
    }

    console.log(TAG, 'fetchSalon: starting...', { isOwner });

    try {
      let salonData: Salon | null = null;

      if (isOwner) {
        // Owner: fetch salon by owner_id
        const { data, error } = await supabase
          .from('salons')
          .select('*')
          .eq('owner_id', user.id)
          .single();

        if (error) {
          console.log(TAG, 'fetchSalon owner error:', error.message);
        } else {
          salonData = data as Salon;
        }
      } else {
        // Barber: fetch salon through salon_members
        const { data: membership, error: memberErr } = await supabase
          .from('salon_members')
          .select('salon_id')
          .eq('profile_id', user.id)
          .limit(1)
          .single();

        if (memberErr) {
          console.log(TAG, 'fetchSalon barber membership error:', memberErr.message);
        } else if (membership) {
          const { data, error } = await supabase
            .from('salons')
            .select('*')
            .eq('id', membership.salon_id)
            .single();

          if (error) {
            console.log(TAG, 'fetchSalon barber salon error:', error.message);
          } else {
            salonData = data as Salon;
          }
        }
      }

      console.log(TAG, 'fetchSalon result:', {
        hasSalon: !!salonData,
        salonName: salonData?.name ?? 'N/A',
      });

      setSalon(salonData);
    } catch (err) {
      console.error(TAG, 'fetchSalon error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, profile?.onboarding_completed, isOwner]);

  // ── Fetch services ────────────────────────────────────────
  const refreshServices = useCallback(async () => {
    if (!salon?.id) {
      setServices([]);
      return;
    }

    console.log(TAG, 'refreshServices for salon:', salon.id);

    const { data, error } = await supabase
      .from('barber_services')
      .select('*')
      .eq('salon_id', salon.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.log(TAG, 'refreshServices error:', error.message);
    } else {
      setServices((data ?? []) as BarberService[]);
    }
  }, [salon?.id]);

  // ── Fetch members ─────────────────────────────────────────
  const refreshMembers = useCallback(async () => {
    if (!salon?.id) {
      setMembers([]);
      return;
    }

    console.log(TAG, 'refreshMembers for salon:', salon.id);

    const { data, error } = await supabase
      .from('salon_members')
      .select('*, profile:profiles(display_name, avatar_url, username)')
      .eq('salon_id', salon.id)
      .order('joined_at', { ascending: true });

    if (error) {
      console.log(TAG, 'refreshMembers error:', error.message);
    } else {
      setMembers((data ?? []) as SalonMember[]);
    }
  }, [salon?.id]);

  // ── Fetch hours ───────────────────────────────────────────
  const refreshHours = useCallback(async () => {
    if (!salon?.id) {
      setHours([]);
      return;
    }

    console.log(TAG, 'refreshHours for salon:', salon.id);

    const { data, error } = await supabase
      .from('salon_hours')
      .select('*')
      .eq('salon_id', salon.id)
      .order('day_of_week', { ascending: true });

    if (error) {
      console.log(TAG, 'refreshHours error:', error.message);
    } else {
      setHours((data ?? []) as SalonHours[]);
    }
  }, [salon?.id]);

  // ── Refresh salon (public) ────────────────────────────────
  const refreshSalon = useCallback(async () => {
    await fetchSalon();
  }, [fetchSalon]);

  // ── Bootstrap: load salon on mount ────────────────────────
  useEffect(() => {
    fetchSalon();
  }, [fetchSalon]);

  // ── Load dependent data when salon changes ────────────────
  useEffect(() => {
    if (salon?.id) {
      refreshServices();
      refreshMembers();
      refreshHours();
    }
  }, [salon?.id, refreshServices, refreshMembers, refreshHours]);

  return (
    <SalonContext.Provider
      value={{
        salon,
        members,
        services,
        hours,
        loading,
        isOwner,
        refreshSalon,
        refreshServices,
        refreshMembers,
        refreshHours,
      }}
    >
      {children}
    </SalonContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────
export function useSalon() {
  const ctx = useContext(SalonContext);
  if (!ctx) throw new Error('useSalon must be used within <SalonProvider>');
  return ctx;
}
