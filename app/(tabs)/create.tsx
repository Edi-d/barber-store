import { View, Text } from "react-native";
import { Redirect } from "expo-router";

// This is a placeholder screen - the tab press is intercepted
// in _layout.tsx to show create options
export default function CreateScreen() {
  return <Redirect href="/(tabs)/feed" />;
}
