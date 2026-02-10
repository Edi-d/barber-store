import { create } from "zustand";
import { supabase } from "@/lib/supabase";
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
      set({ session, isInitialized: true });
      
      if (session) {
        await get().fetchProfile();
      }
      
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
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
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
      await supabase.auth.signOut();
      set({ session: null, profile: null });
    } finally {
      set({ isSubmitting: false });
    }
  },

  resetPassword: async (email: string) => {
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
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
        .insert({
          id: session.user.id,
          username: data.username,
          display_name: data.display_name,
          bio: data.bio || null,
        });
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

      if (error) throw error;
      set({ profile: data });
    } catch (error) {
      console.error("Fetch profile error:", error);
    }
  },
}));
