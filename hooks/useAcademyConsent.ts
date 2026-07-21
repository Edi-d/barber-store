import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { ACADEMY_CONSENT_VERSION } from "@/constants/academy";

type AcademyConsentRow = {
  academy_consent_accepted_at: string | null;
  academy_consent_version: string | null;
};

const ACADEMY_CONSENT_QK = (userId: string) => ["academy-consent", userId];

/**
 * Version-aware consent gate for the Academy free-haircut flow. `hasConsented`
 * flips false again if ACADEMY_CONSENT_VERSION is bumped, forcing a re-prompt
 * even for users who already accepted an older waiver.
 */
export function useAcademyConsent() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const query = useQuery<AcademyConsentRow | null>({
    queryKey: userId ? ACADEMY_CONSENT_QK(userId) : ["academy-consent", "anonymous"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("academy_consent_accepted_at, academy_consent_version")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("accept_academy_consent", {
        p_version: ACADEMY_CONSENT_VERSION,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ACADEMY_CONSENT_QK(userId) });
      }
    },
  });

  const hasConsented =
    !!query.data?.academy_consent_accepted_at &&
    query.data?.academy_consent_version === ACADEMY_CONSENT_VERSION;

  return {
    hasConsented,
    isLoading: query.isLoading,
    accept: async () => {
      await mutation.mutateAsync();
    },
  };
}
