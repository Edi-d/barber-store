import { create } from "zustand";
import * as Location from "expo-location";

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  hasPermission: boolean | null;
  isLoading: boolean;
  errorMsg: string | null;
  requestLocation: () => Promise<void>;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  latitude: null,
  longitude: null,
  hasPermission: null,
  isLoading: false,
  errorMsg: null,

  requestLocation: async () => {
    set({ isLoading: true, errorMsg: null });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        set({ hasPermission: false, isLoading: false, errorMsg: "Permisiune de locație refuzată" });
        return;
      }
      set({ hasPermission: true });

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      set({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, errorMsg: "Nu am putut obține locația" });
    }
  },
}));
