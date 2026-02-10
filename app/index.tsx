import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function Index() {
  const { session, profile } = useAuthStore();

  if (session && profile) {
    return <Redirect href="/(tabs)/feed" />;
  }

  if (session && !profile) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
