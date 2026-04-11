import { Redirect } from 'expo-router';

export default function CreateStub() {
  // This tab is intercepted by the GlassTabBar center button.
  // If somehow navigated to directly, redirect to feed.
  return <Redirect href="/(tabs)/feed" />;
}
