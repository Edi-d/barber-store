import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function Index() {
  const { session, profile } = useAuthStore();

  if (session && profile?.onboarding_completed) {
    return <Redirect href="/(tabs)/discover" />;
  }

  if (session && !profile?.onboarding_completed) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
