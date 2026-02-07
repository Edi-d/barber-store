import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Pressable, Platform } from "react-native";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";
import { router } from "expo-router";

export default function TabsLayout() {
  const { fetchCart, totalItems } = useCartStore();
  const { profile } = useAuthStore();
  const cartCount = totalItems();

  useEffect(() => {
    fetchCart();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e2e8f0",
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
        },
        tabBarActiveTintColor: "#0a66c2",
        tabBarInactiveTintColor: "#64748b",
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? "home" : "home-outline"} 
              size={24} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: "Academy",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? "school" : "school-outline"} 
              size={24} 
              color={color} 
            />
          ),
        }}
      />
      {/* Center Add Button */}
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          tabBarIcon: () => (
            <View className="w-14 h-14 -mt-4 bg-primary-600 rounded-2xl items-center justify-center shadow-lg">
              <Ionicons name="add" size={32} color="white" />
            </View>
          ),
          tabBarLabel: () => null,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e: any) => {
            e.preventDefault();
            // Show create options modal or navigate
            if (profile?.role === "creator" || profile?.role === "admin") {
              router.push("/go-live");
            }
          },
        })}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: "Shop",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons 
                name={focused ? "bag" : "bag-outline"} 
                size={24} 
                color={color} 
              />
              {cartCount > 0 && (
                <View className="absolute -top-1 -right-2 bg-primary-600 min-w-[18px] h-[18px] rounded-full items-center justify-center">
                  <Ionicons name="ellipse" size={4} color="white" />
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? "person" : "person-outline"} 
              size={24} 
              color={color} 
            />
          ),
        }}
      />
    </Tabs>
  );
}
