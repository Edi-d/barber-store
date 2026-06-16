import { useEffect } from 'react';
import { registerPushToken } from '@/utils/push-notifications';

/**
 * Registers an Expo push token for the signed-in user (permission → token →
 * upsert into the shared push_tokens table). Wired in app/_layout.tsx after
 * auth. Re-runs when the user id changes (login/account switch).
 */
export function usePushRegistration(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    registerPushToken().catch((e) =>
      console.warn('[push] register failed', e)
    );
  }, [userId]);
}
