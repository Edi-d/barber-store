/**
 * Auth shim — thin wrapper around useAuthStore (Zustand).
 *
 * Ported Tapzi hooks import `useAuth` from `@/providers/auth-provider` and
 * expect the shape `{ session, user, profile, loading }`. This shim provides
 * that shape by reading from the existing useAuthStore without duplicating
 * any auth logic.
 *
 * `<AuthProvider>` is a no-op wrapper mounted in app/_layout.tsx for
 * structural symmetry (Tapzi expects the provider in the tree).
 */

import { type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';

// ─── Hook ────────────────────────────────────────────────
/**
 * Returns the auth context consumed by all ported marketplace/shop hooks.
 *
 * ```ts
 * const { session, user, profile, loading } = useAuth();
 * ```
 */
export function useAuth() {
  const { session, profile, isLoading } = useAuthStore();
  return {
    session,
    user: session?.user ?? null,
    profile,
    loading: isLoading,
  };
}

// ─── Provider ────────────────────────────────────────────
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * No-op provider — the actual auth state lives in useAuthStore (Zustand).
 * Mounted in app/_layout.tsx for structural symmetry with Tapzi-barber.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  return <>{children}</>;
}
