import { create } from "zustand";

interface UIState {
  tabBarHidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
  createMenuOpen: boolean;
  setCreateMenuOpen: (open: boolean) => void;
  // Marketplace cart badge (tab icon counter)
  marketplaceCartCount: number;
  setMarketplaceCartCount: (n: number) => void;
  // Marketplace cart modal visibility
  marketplaceCartOpen: boolean;
  setMarketplaceCartOpen: (b: boolean) => void;
  // Checkout idempotency key — generated once per checkout session,
  // cleared on successful order creation to prevent duplicate submissions.
  marketplaceIdempotencyKey: string | null;
  setMarketplaceIdempotencyKey: (key: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  tabBarHidden: false,
  setTabBarHidden: (hidden) => set({ tabBarHidden: hidden }),
  createMenuOpen: false,
  setCreateMenuOpen: (open) => set({ createMenuOpen: open }),
  marketplaceCartCount: 0,
  setMarketplaceCartCount: (n) => set({ marketplaceCartCount: n }),
  marketplaceCartOpen: false,
  setMarketplaceCartOpen: (b) => set({ marketplaceCartOpen: b }),
  marketplaceIdempotencyKey: null,
  setMarketplaceIdempotencyKey: (key) => set({ marketplaceIdempotencyKey: key }),
}));
