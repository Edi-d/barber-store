import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { cleanupAllChannels } from "@/lib/realtime";
import { Profile } from "@/types/database";
import { Session } from "@supabase/supabase-js";

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
      const { data: { session } } = await supabase.auth.getSession();
      console.log("[AUTH] Session:", session ? `User ${session.user.id}` : "null");
      set({ session });

      if (session) {
        await get().fetchProfile();
        console.log("[AUTH] Profile after fetch:", get().profile?.username ?? "null");
      }

      set({ isInitialized: true });
      console.log("[AUTH] Initialized - session:", !!session, "profile:", !!get().profile);

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        set({ session });
        if (session) {
          await get().fetchProfile();
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
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
