import { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { Button, Input, Card } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";

interface CheckoutForm {
  name: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
}

export default function CheckoutScreen() {
  const { items, totalPrice, clearCart } = useCartStore();
  const { session } = useAuthStore();
  const total = totalPrice();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutForm>({
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      city: "",
      notes: "",
    },
  });

  const orderMutation = useMutation({
    mutationFn: async (data: CheckoutForm) => {
      if (!session) throw new Error("Not authenticated");

      const shippingAddress = `${data.name}\n${data.phone}\n${data.address}\n${data.city}${data.notes ? `\n\nNote: ${data.notes}` : ""}`;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: session.user.id,
          status: "pending",
          total_cents: total,
          currency: "RON",
          shipping_address: shippingAddress,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        qty: item.qty,
        price_cents: item.product.price_cents,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return order;
    },
    onSuccess: async () => {
      await clearCart();
      Alert.alert(
        "Comandă plasată!",
        "Comanda ta a fost înregistrată cu succes. Vei fi contactat pentru confirmare.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/orders"),
          },
        ]
      );
    },
    onError: (error) => {
      Alert.alert("Eroare", "Nu am putut plasa comanda. Încearcă din nou.");
      console.error(error);
    },
  });

  const onSubmit = (data: CheckoutForm) => {
    orderMutation.mutate(data);
  };

  if (items.length === 0) {
    router.replace("/cart");
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-dark-200" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-dark-300 bg-white">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </Pressable>
        <Text className="text-dark-700 text-xl font-bold">Finalizare comandă</Text>
      </View>

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="px-6 py-4">
          {/* Order Summary */}
          <Card className="mb-6">
            <Text className="text-dark-700 font-bold text-lg mb-3">
              Sumar comandă
            </Text>
            {items.map((item) => (
              <View key={item.product_id} className="flex-row justify-between py-2">
                <Text className="text-dark-600 flex-1" numberOfLines={1}>
                  {item.qty}x {item.product.title}
                </Text>
                <Text className="text-dark-700 font-semibold ml-2">
                  {formatPrice(item.product.price_cents * item.qty, item.product.currency)}
                </Text>
              </View>
            ))}
            <View className="flex-row justify-between pt-3 mt-3 border-t border-dark-300">
              <Text className="text-dark-700 font-bold">Total</Text>
              <Text className="text-primary-600 font-bold text-lg">
                {formatPrice(total, "RON")}
              </Text>
            </View>
          </Card>

          {/* Shipping Form */}
          <Text className="text-dark-700 font-bold text-lg mb-4">
            Date livrare
          </Text>
          <View className="gap-4">
            <Controller
              control={control}
              name="name"
              rules={{ required: "Numele este obligatoriu" }}
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Nume complet"
                  value={value}
                  onChangeText={onChange}
                  placeholder="Ion Popescu"
                  error={errors.name?.message}
                  icon={<Ionicons name="person" size={20} color="#64748b" />}
                />
              )}
            />

            <Controller
              control={control}
              name="phone"
              rules={{
                required: "Telefonul este obligatoriu",
                pattern: {
                  value: /^[0-9+\s-]{10,}$/,
                  message: "Număr invalid",
                },
              }}
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Telefon"
                  value={value}
                  onChangeText={onChange}
                  placeholder="0712 345 678"
                  keyboardType="phone-pad"
                  error={errors.phone?.message}
                  icon={<Ionicons name="call" size={20} color="#64748b" />}
                />
              )}
            />

            <Controller
              control={control}
              name="address"
              rules={{ required: "Adresa este obligatorie" }}
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Adresa"
                  value={value}
                  onChangeText={onChange}
                  placeholder="Str. Exemplu nr. 123, bl. A, ap. 1"
                  error={errors.address?.message}
                  icon={<Ionicons name="location" size={20} color="#64748b" />}
                />
              )}
            />

            <Controller
              control={control}
              name="city"
              rules={{ required: "Orașul este obligatoriu" }}
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Oraș"
                  value={value}
                  onChangeText={onChange}
                  placeholder="București"
                  error={errors.city?.message}
                  icon={<Ionicons name="business" size={20} color="#64748b" />}
                />
              )}
            />

            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Observații (opțional)"
                  value={value}
                  onChangeText={onChange}
                  placeholder="Etaj, interfon, instrucțiuni speciale..."
                  multiline
                  numberOfLines={3}
                />
              )}
            />
          </View>

          {/* Payment Info */}
          <Card className="mt-6">
            <View className="flex-row items-center">
              <Ionicons name="cash-outline" size={24} color="#d4af37" />
              <View className="ml-3 flex-1">
                <Text className="text-dark-700 font-semibold">Plata la livrare</Text>
                <Text className="text-dark-500 text-sm">
                  Vei plăti cash când primești comanda
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View className="px-6 py-4 border-t border-dark-300 bg-white">
        <Button
          size="lg"
          onPress={handleSubmit(onSubmit)}
          loading={orderMutation.isPending}
          className="w-full"
        >
          Plasează comanda • {formatPrice(total, "RON")}
        </Button>
      </View>
    </SafeAreaView>
  );
}
