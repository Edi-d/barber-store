import { create } from "zustand";

interface UIState {
  tabBarHidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
  createMenuOpen: boolean;
  setCreateMenuOpen: (open: boolean) => void;
  quickActionMode: "client" | "barber";
  setQuickActionMode: (mode: "client" | "barber") => void;
}

export const useUIStore = create<UIState>((set) => ({
  tabBarHidden: false,
  setTabBarHidden: (hidden) => set({ tabBarHidden: hidden }),
  createMenuOpen: false,
  setCreateMenuOpen: (open) => set({ createMenuOpen: open }),
  quickActionMode: "client",
  setQuickActionMode: (mode) => set({ quickActionMode: mode }),
}));
