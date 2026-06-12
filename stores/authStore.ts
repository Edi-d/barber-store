import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { cleanupAllChannels } from "@/lib/realtime";
import { Profile } from "@/types/database";
import { Session, User } from "@supabase/supabase-js";

/**
 * This is the CLIENT app. Barber/salon (professional) accounts belong to the
 * separate Tapzi Barber app and share the same Supabase backend, so a valid
 * pro credential would otherwise authenticate straight into the customer UI.
 * An account is treated as professional if EITHER:
 *   - it was created by the pro app (user_metadata.signup_flow === 'salon_owner'), or
 *   - it has any salon domain link: owns a salon, is a salon team member, or
 *     has a barber record.
 * Returns true for pro accounts (which signIn then rejects).
 */
async function isProfessionalAccount(user: User): Promise<boolean> {
  // 1) Origin signal from the pro app's signup — cheap, no round-trip.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  if (meta.signup_flow === "salon_owner") return true;

  // 2) Authoritative domain membership for established pros.
  const uid = user.id;
  const [owner, member, barber] = await Promise.all([
    supabase.from("salons").select("id").eq("owner_id", uid).limit(1).maybeSingle(),
    supabase.from("salon_members").select("id").eq("profile_id", uid).limit(1).maybeSingle(),
    supabase.from("barbers").select("id").eq("profile_id", uid).limit(1).maybeSingle(),
  ]);
  return Boolean(owner.data || member.data || barber.data);
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isSubmitting: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  verifyResetPasswordOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  createProfile: (data: { username: string; display_name: string; bio?: string }) => Promise<{ error: Error | null }>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,
  isSubmitting: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const { data: { session: cachedSession } } = await supabase.auth.getSession();
      let session = cachedSession;
      console.log("[AUTH] Session:", session ? `User ${session.user.id}` : "null");

      // Validate the cached session against the auth server. If the underlying
      // user was deleted while signed in (e.g. the account was removed from the
      // shared backend), getSession() still returns a locally-valid JWT but
      // getUser() gets a definitive 401/403 — drop the orphaned session so we
      // land on welcome instead of the "Completează profilul" screen (which then
      // hangs on the Profil tab, since profile stays null forever). A legitimate
      // user always has a profile row (handle_new_user trigger), so a live
      // session with no profile only ever means a deleted/orphaned account.
      // Transient/offline failures carry no 401/403 status, so they must NOT log
      // the user out — we keep the cached session and proceed.
      if (session) {
        const { error: userError } = await supabase.auth.getUser();
        const status = (userError as { status?: number } | null)?.status;
        if (userError && (status === 401 || status === 403)) {
          console.warn("[AUTH] Auth user no longer exists - clearing orphaned session.");
          cleanupAllChannels();
          await supabase.auth.signOut({ scope: "local" });
          session = null;
        }
      }

      set({ session });

      if (session) {
        await get().fetchProfile();
        console.log("[AUTH] Profile after fetch:", get().profile?.username ?? "null");
      }

      set({ isInitialized: true });
      console.log("[AUTH] Initialized - session:", !!session, "profile:", !!get().profile);

      // Listen for auth changes.
      //
      // IMPORTANT: this callback must NOT await other supabase calls. The auth
      // client emits events while holding its internal lock; fetchProfile() runs
      // a supabase query that needs the same lock to read the access token, so
      // awaiting it here deadlocks the client (frozen UI, e.g. after
      // updateUser/password change). Keep the callback synchronous and defer the
      // profile fetch to a separate tick so the lock is released first.
      supabase.auth.onAuthStateChange((event, session) => {
        set({ session });
        if (session) {
          setTimeout(() => {
            void get().fetchProfile();
          }, 0);
        } else {
          set({ profile: null });
        }
      });
    } catch (error) {
      console.error("Auth initialization error:", error);
      set({ isInitialized: true });
    } finally {
      set({ isLoading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isSubmitting: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Gate professional accounts out of the client app. Detection runs against
      // the freshly-authenticated session (the membership queries need it), then
      // we tear the session back down so no pro session lingers if it's blocked.
      if (data.user && (await isProfessionalAccount(data.user))) {
        cleanupAllChannels();
        await supabase.auth.signOut();
        set({ session: null, profile: null });
        return { error: new Error("PROFESSIONAL_ACCOUNT") };
      }

      // Load the profile BEFORE returning so the caller can navigate without
      // racing the deferred onAuthStateChange fetch. Otherwise the index guard
      // briefly sees a session with profile === null right after login and
      // wrongly bounces existing users to "Completează profilul" (it self-corrects
      // only on the next launch, once initialize() pre-loads the profile).
      // fetchProfile reads get().session, so seed it from the fresh sign-in first.
      if (data.session) {
        set({ session: data.session });
        await get().fetchProfile();
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      set({ isSubmitting: false });
    }
  },

  signUp: async (email: string, password: string) => {
    set({ isSubmitting: true });
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: "tapzi://auth/callback",
          data: {
            signup_source: "customer_app",
          },
        },
      });
      console.log("[AUTH] signUp result - email:", email);
      console.log("[AUTH] signUp result - user:", data?.user ? {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        confirmation_sent_at: data.user.confirmation_sent_at,
        created_at: data.user.created_at,
        identities_count: data.user.identities?.length,
      } : null);
      console.log("[AUTH] signUp result - session:", data?.session ? "SET" : "null");
      console.log("[AUTH] signUp result - error:", signUpError);
      if (signUpError) throw signUpError;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      set({ isSubmitting: false });
    }
  },

  signOut: async () => {
    set({ isSubmitting: true });
    try {
      cleanupAllChannels(); // Clean up realtime channels before signing out
      await supabase.auth.signOut();
      set({ session: null, profile: null });
    } finally {
      set({ isSubmitting: false });
    }
  },

  resetPassword: async (email: string) => {
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "tapzi://reset-password",
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      set({ isSubmitting: false });
    }
  },

  verifyResetPasswordOtp: async (email: string, token: string) => {
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
      console.log("[AUTH] verifyResetPasswordOtp result:", error ?? "ok");
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      set({ isSubmitting: false });
    }
  },

  updatePassword: async (newPassword: string) => {
    if (!get().session) return { error: new Error("Not authenticated") };
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      console.log("[AUTH] updatePassword result:", error ?? "ok");
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      set({ isSubmitting: false });
    }
  },

  createProfile: async (data: { username: string; display_name: string; bio?: string }) => {
    const { session } = get();
    if (!session) return { error: new Error("Not authenticated") };

    set({ isSubmitting: true });
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: data.username,
          display_name: data.display_name,
          bio: data.bio || null,
          onboarding_completed: true,
        })
        .eq("id", session.user.id);
      if (error) throw error;

      await get().fetchProfile();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      set({ isSubmitting: false });
    }
  },

  updateProfile: async (updates: Partial<Profile>) => {
    const { session } = get();
    if (!session) return { error: new Error("Not authenticated") };
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", session.user.id);
      
      if (error) throw error;
      
      await get().fetchProfile();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  },

  fetchProfile: async () => {
    const { session } = get();
    if (!session) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      console.log("[AUTH] fetchProfile result - data:", data, "error:", error);
      if (error) throw error;
      set({ profile: data });
    } catch (error) {
      console.error("Fetch profile error:", error);
    }
  },
}));
