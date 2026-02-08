import { View, Text, FlatList, Image, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCartStore } from "@/stores/cartStore";
import { Button, Card } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";

export default function CartScreen() {
  const { items, fetchCart, updateQty, removeItem, totalPrice, isLoading } = useCartStore();

  useEffect(() => {
    fetchCart();
  }, []);

  const total = totalPrice();

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-dark-300 bg-white">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </Pressable>
        <Text className="text-dark-700 text-xl font-bold flex-1">Coșul meu</Text>
        <Text className="text-dark-500">{items.length} produse</Text>
      </View>

      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="cart-outline" size={80} color="#64748b" />
          <Text className="text-dark-700 text-xl font-bold mt-4">
            Coșul tău e gol
          </Text>
          <Text className="text-dark-500 text-center mt-2 mb-6">
            Adaugă produse din shop pentru a continua
          </Text>
          <Button onPress={() => router.push("/(tabs)/shop")}>
            Explorează Shop
          </Button>
        </View>
      ) : (
        <>
          {/* Cart Items */}
          <FlatList
            data={items}
            keyExtractor={(item) => item.product_id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item }) => (
              <Card className="flex-row p-3">
                {/* Product Image */}
                {item.product.image_url ? (
                  <Image
                    source={{ uri: item.product.image_url }}
                    className="w-20 h-20 rounded-lg"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-20 h-20 rounded-lg bg-primary-100 items-center justify-center">
                    <Ionicons name="image-outline" size={24} color="#0a66c2" />
                  </View>
                )}

                {/* Product Info */}
                <View className="flex-1 ml-3 justify-between">
                  <View>
                    <Text className="text-dark-700 font-semibold" numberOfLines={2}>
                      {item.product.title}
                    </Text>
                    <Text className="text-primary-500 font-bold mt-1">
                      {formatPrice(item.product.price_cents, item.product.currency)}
                    </Text>
                  </View>

                  {/* Quantity Controls */}
                  <View className="flex-row items-center justify-between mt-2">
                    <View className="flex-row items-center bg-dark-200 rounded-lg border border-dark-300">
                      <Pressable
                        onPress={() => updateQty(item.product_id, item.qty - 1)}
                        className="w-8 h-8 items-center justify-center"
                      >
                        <Ionicons name="remove" size={18} color="#334155" />
                      </Pressable>
                      <Text className="text-dark-700 font-bold w-8 text-center">
                        {item.qty}
                      </Text>
                      <Pressable
                        onPress={() => updateQty(item.product_id, item.qty + 1)}
                        className="w-8 h-8 items-center justify-center"
                      >
                        <Ionicons name="add" size={18} color="#334155" />
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => removeItem(item.product_id)}
                      className="p-2"
                    >
                      <Ionicons name="trash-outline" size={20} color="#dc2626" />
                    </Pressable>
                  </View>
                </View>
              </Card>
            )}
          />

          {/* Bottom Summary */}
          <View className="px-6 py-4 border-t border-dark-300 bg-white">
            <View className="flex-row justify-between mb-4">
              <Text className="text-dark-500 text-lg">Total</Text>
              <Text className="text-dark-700 text-2xl font-bold">
                {formatPrice(total, "RON")}
              </Text>
            </View>
            <Button
              size="lg"
              onPress={() => router.push("/checkout")}
              className="w-full"
            >
              Continuă către plată
            </Button>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
