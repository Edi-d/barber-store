import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { CartItemWithProduct, Product } from "@/types/database";

interface CartState {
  items: CartItemWithProduct[];
  isLoading: boolean;
  
  // Computed
  totalItems: () => number;
  totalPrice: () => number;
  
  // Actions
  fetchCart: () => Promise<void>;
  addItem: (product: Product, qty?: number) => Promise<void>;
  updateQty: (productId: string, qty: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  isLoading: false,

  totalItems: () => {
    return get().items.reduce((sum, item) => sum + item.qty, 0);
  },

  totalPrice: () => {
    return get().items.reduce(
      (sum, item) => sum + item.product.price_cents * item.qty,
      0
    );
  },

  fetchCart: async () => {
    set({ isLoading: true });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("cart_items")
        .select(`
          *,
          product:products(*)
        `)
        .eq("user_id", user.id);

      if (error) throw error;
      set({ items: data as CartItemWithProduct[] });
    } catch (error) {
      console.error("Fetch cart error:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  addItem: async (product: Product, qty: number = 1) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if item already in cart
      const existingItem = get().items.find(
        (item) => item.product_id === product.id
      );

      if (existingItem) {
        await get().updateQty(product.id, existingItem.qty + qty);
      } else {
        const { error } = await supabase.from("cart_items").insert({
          user_id: user.id,
          product_id: product.id,
          qty,
        });
        if (error) throw error;

        // Optimistic update
        set((state) => ({
          items: [...state.items, { user_id: user.id, product_id: product.id, qty, product, created_at: new Date().toISOString() }],
        }));
      }
    } catch (error) {
      console.error("Add to cart error:", error);
    }
  },

  updateQty: async (productId: string, qty: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (qty <= 0) {
        await get().removeItem(productId);
        return;
      }

      const { error } = await supabase
        .from("cart_items")
        .update({ qty })
        .eq("user_id", user.id)
        .eq("product_id", productId);

      if (error) throw error;

      // Optimistic update
      set((state) => ({
        items: state.items.map((item) =>
          item.product_id === productId ? { ...item, qty } : item
        ),
      }));
    } catch (error) {
      console.error("Update qty error:", error);
    }
  },

  removeItem: async (productId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", productId);

      if (error) throw error;

      // Optimistic update
      set((state) => ({
        items: state.items.filter((item) => item.product_id !== productId),
      }));
    } catch (error) {
      console.error("Remove item error:", error);
    }
  },

  clearCart: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;
      set({ items: [] });
    } catch (error) {
      console.error("Clear cart error:", error);
    }
  },
}));
