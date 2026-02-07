import { View, Text, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { Card, Badge } from "@/components/ui";
import { OrderWithItems } from "@/types/database";
import { formatPrice, timeAgo } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

const statusConfig = {
  pending: { label: "În așteptare", variant: "warning" as const, icon: "time" as const },
  paid: { label: "Plătit", variant: "success" as const, icon: "checkmark-circle" as const },
  shipped: { label: "Expediat", variant: "primary" as const, icon: "airplane" as const },
  cancelled: { label: "Anulat", variant: "danger" as const, icon: "close-circle" as const },
};

export default function OrdersScreen() {
  const { session } = useAuthStore();

  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["orders", session?.user.id],
    queryFn: async () => {
      if (!session) return [];

      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          items:order_items(
            *,
            product:products(*)
          )
        `)
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as OrderWithItems[];
    },
    enabled: !!session,
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0a66c2" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-dark-300 bg-white">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </Pressable>
        <Text className="text-dark-700 text-xl font-bold">Comenzile mele</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#0a66c2"
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-12 bg-white rounded-xl">
            <Ionicons name="receipt-outline" size={64} color="#64748b" />
            <Text className="text-dark-700 text-lg font-bold mt-4">
              Nicio comandă încă
            </Text>
            <Text className="text-dark-500 mt-2 text-center">
              Comenzile tale vor apărea aici
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = statusConfig[item.status];
          const itemsCount = item.items?.reduce((acc, i) => acc + i.qty, 0) || 0;

          return (
            <Card>
              {/* Header */}
              <View className="flex-row justify-between items-start mb-3">
                <View>
                  <Text className="text-dark-500 text-sm">
                    Comandă #{item.id.slice(0, 8)}
                  </Text>
                  <Text className="text-dark-400 text-xs mt-1">
                    {timeAgo(item.created_at)}
                  </Text>
                </View>
                <Badge variant={status.variant} size="sm">
                  <Ionicons name={status.icon} size={12} color="white" /> {status.label}
                </Badge>
              </View>

              {/* Items Preview */}
              <View className="border-t border-dark-300 pt-3">
                {item.items?.slice(0, 2).map((orderItem) => (
                  <View key={orderItem.product_id} className="flex-row justify-between py-1">
                    <Text className="text-dark-600 flex-1" numberOfLines={1}>
                      {orderItem.qty}x {orderItem.product?.title}
                    </Text>
                    <Text className="text-dark-700 font-medium ml-2">
                      {formatPrice(orderItem.price_cents * orderItem.qty, item.currency)}
                    </Text>
                  </View>
                ))}
                {(item.items?.length || 0) > 2 && (
                  <Text className="text-dark-500 text-sm mt-1">
                    +{(item.items?.length || 0) - 2} alte produse
                  </Text>
                )}
              </View>

              {/* Total */}
              <View className="flex-row justify-between items-center pt-3 mt-3 border-t border-dark-300">
                <Text className="text-dark-500">
                  {itemsCount} {itemsCount === 1 ? "produs" : "produse"}
                </Text>
                <Text className="text-dark-700 font-bold text-lg">
                  {formatPrice(item.total_cents, item.currency)}
                </Text>
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}
