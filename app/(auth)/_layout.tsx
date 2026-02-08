import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#f9fafb" },
        animation: "slide_from_right",
      }}
    />
  );
}
