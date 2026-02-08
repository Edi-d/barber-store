import { View, Text, FlatList, RefreshControl, Image, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useCartStore } from "@/stores/cartStore";
import { Card, Button, Badge } from "@/components/ui";
import { Product } from "@/types/database";
import { formatPrice } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";

export default function ShopScreen() {
  const { addItem, totalItems } = useCartStore();
  const cartCount = totalItems();

  const { data: products, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Product[];
    },
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
      <View className="px-6 py-4 border-b border-dark-300 flex-row justify-between items-center bg-white">
        <View>
          <Text className="text-2xl font-bold text-dark-700">Shop</Text>
          <Text className="text-dark-500 mt-1">
            Produse profesionale
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/cart")}
          className="relative"
        >
          <View className="w-12 h-12 bg-dark-200 rounded-full items-center justify-center">
            <Ionicons name="cart" size={24} color="#64748b" />
          </View>
          {cartCount > 0 && (
            <View className="absolute -top-1 -right-1 bg-primary-500 w-6 h-6 rounded-full items-center justify-center">
              <Text className="text-white text-xs font-bold">{cartCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Products Grid */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ padding: 12 }}
        columnWrapperStyle={{ gap: 12 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#0a66c2"
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-12 bg-white rounded-xl">
            <Ionicons name="bag-outline" size={64} color="#64748b" />
            <Text className="text-dark-700 text-lg font-bold mt-4">
              Niciun produs disponibil
            </Text>
            <Text className="text-dark-500 mt-2">
              Revino curând pentru produse noi
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ProductCard product={item} onAddToCart={() => addItem(item)} />
        )}
      />
    </SafeAreaView>
  );
}

function ProductCard({
  product,
  onAddToCart,
}: {
  product: Product;
  onAddToCart: () => void;
}) {
  const isOutOfStock = product.stock !== null && product.stock <= 0;

  return (
    <Card className="flex-1" onPress={() => router.push(`/product/${product.id}`)}>
      {/* Product Image */}
      {product.image_url ? (
        <Image
          source={{ uri: product.image_url }}
          className="w-full h-32 rounded-lg mb-3"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-32 rounded-lg mb-3 bg-primary-100 items-center justify-center">
          <Ionicons name="image-outline" size={32} color="#0a66c2" />
        </View>
      )}

      {/* Out of Stock Badge */}
      {isOutOfStock && (
        <Badge variant="danger" size="sm" className="absolute top-2 right-2">
          Stoc epuizat
        </Badge>
      )}

      {/* Product Info */}
      <Text className="text-dark-700 font-semibold text-sm mb-1" numberOfLines={2}>
        {product.title}
      </Text>
      <Text className="text-primary-500 font-bold text-lg mb-3">
        {formatPrice(product.price_cents, product.currency)}
      </Text>

      {/* Add to Cart Button */}
      <Button
        size="sm"
        variant={isOutOfStock ? "secondary" : "primary"}
        disabled={isOutOfStock}
        onPress={() => onAddToCart()}
        className="w-full"
      >
        {isOutOfStock ? "Indisponibil" : "Adaugă"}
      </Button>
    </Card>
  );
}
