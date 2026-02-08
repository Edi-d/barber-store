import { View, Text, ScrollView, Image, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCartStore } from "@/stores/cartStore";
import { Button, Badge } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addItem } = useCartStore();
  const [qty, setQty] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product, qty);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0a66c2" />
      </View>
    );
  }

  if (!product) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-dark-700">Produsul nu a fost găsit</Text>
      </View>
    );
  }

  const isOutOfStock = product.stock !== null && product.stock <= 0;

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      <ScrollView className="flex-1">
        {/* Product Image */}
        <View className="relative bg-white">
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              className="w-full aspect-square"
              resizeMode="cover"
            />
          ) : (
            <View className="w-full aspect-square bg-primary-100 items-center justify-center">
              <Ionicons name="image-outline" size={64} color="#0a66c2" />
            </View>
          )}

          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            className="absolute top-4 left-4 w-10 h-10 bg-white/90 rounded-full items-center justify-center"
          >
            <Ionicons name="arrow-back" size={24} color="#334155" />
          </Pressable>

          {/* Out of Stock Overlay */}
          {isOutOfStock && (
            <View className="absolute inset-0 bg-black/50 items-center justify-center">
              <Badge variant="danger" size="md">Stoc epuizat</Badge>
            </View>
          )}
        </View>

        {/* Product Info */}
        <View className="px-6 py-6 bg-white">
          {/* Stock Badge */}
          {product.stock !== null && product.stock > 0 && product.stock <= 5 && (
            <Badge variant="warning" size="sm" className="mb-3 self-start">
              Doar {product.stock} în stoc
            </Badge>
          )}

          <Text className="text-dark-700 text-2xl font-bold mb-2">
            {product.title}
          </Text>

          <Text className="text-primary-500 text-3xl font-bold mb-4">
            {formatPrice(product.price_cents, product.currency)}
          </Text>

          {product.description && (
            <Text className="text-dark-600 text-base leading-6">
              {product.description}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View className="px-6 py-4 border-t border-dark-300 bg-white">
        {/* Quantity Selector */}
        {!isOutOfStock && (
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-dark-700 font-semibold">Cantitate</Text>
            <View className="flex-row items-center bg-dark-200 rounded-xl border border-dark-300">
              <Pressable
                onPress={() => setQty(Math.max(1, qty - 1))}
                className="w-12 h-12 items-center justify-center"
              >
                <Ionicons name="remove" size={24} color="#334155" />
              </Pressable>
              <Text className="text-dark-700 font-bold text-lg w-12 text-center">
                {qty}
              </Text>
              <Pressable
                onPress={() => {
                  const max = product.stock ?? 99;
                  setQty(Math.min(max, qty + 1));
                }}
                className="w-12 h-12 items-center justify-center"
              >
                <Ionicons name="add" size={24} color="#334155" />
              </Pressable>
            </View>
          </View>
        )}

        {/* Add to Cart Button */}
        <Button
          size="lg"
          variant={addedToCart ? "secondary" : "primary"}
          disabled={isOutOfStock}
          onPress={handleAddToCart}
          className="w-full"
          icon={
            addedToCart ? (
              <Ionicons name="checkmark" size={20} color={addedToCart ? "#334155" : "white"} />
            ) : (
              <Ionicons name="cart" size={20} color="white" />
            )
          }
        >
          {isOutOfStock
            ? "Indisponibil"
            : addedToCart
            ? "Adăugat în coș!"
            : `Adaugă în coș • ${formatPrice(product.price_cents * qty, product.currency)}`}
        </Button>

        {/* View Cart Link */}
        {addedToCart && (
          <Pressable
            onPress={() => router.push("/cart")}
            className="mt-3 py-2"
          >
            <Text className="text-primary-500 text-center font-semibold">
              Vezi coșul →
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
