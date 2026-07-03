import "react-native-url-polyfill/auto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Web-compatible storage adapter using localStorage
const WebStorageAdapter = {
  getItem: (key: string) => {
    if (typeof window !== "undefined") {
      return Promise.resolve(localStorage.getItem(key));
    }
    return Promise.resolve(null);
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(key);
    }
    return Promise.resolve();
  },
};

// Native storage adapter using SecureStore.
//
// SecureStore caps each stored value at ~2048 bytes. A Supabase session blob
// (access JWT + refresh token + the full user object) routinely exceeds that,
// so a single-value write silently fails to persist — which surfaces later as
// the user being logged out the next time the token refreshes. To avoid that we
// transparently split large values across numbered chunk keys (`${key}.0`, `.1`,
// …) and reassemble them on read. Small values are stored as a single value as
// before. A sentinel key (`${key}.__chunks`) records the chunk count so reads
// know whether a value is chunked.
const CHUNK_SIZE = 2000; // chars; stays under the 2048-byte cap for ASCII session data
const chunkCountKey = (key: string) => `${key}.__chunks`;

// Remove every representation of `key` (plain value + any chunks) so a new write
// never leaves stale leftovers behind (e.g. when a value shrinks).
async function clearNative(key: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(chunkCountKey(key));
  if (countRaw != null) {
    const count = parseInt(countRaw, 10);
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(chunkCountKey(key));
  }
  await SecureStore.deleteItemAsync(key);
}

const NativeStorageAdapter = {
  getItem: async (key: string) => {
    const countRaw = await SecureStore.getItemAsync(chunkCountKey(key));
    if (countRaw == null) {
      // Not chunked — read the plain value (also covers pre-migration sessions).
      return SecureStore.getItemAsync(key);
    }
    const count = parseInt(countRaw, 10);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null; // partial/corrupt write — force a clean re-auth
      parts.push(part);
    }
    return parts.join("");
  },
  setItem: async (key: string, value: string) => {
    await clearNative(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(chunkCountKey(key), String(count));
  },
  removeItem: (key: string) => {
    return clearNative(key);
  },
};

// Use appropriate storage based on platform
const storageAdapter = Platform.OS === "web" ? WebStorageAdapter : NativeStorageAdapter;

// Fail fast if Supabase credentials are absent. Previously we fell back to
// "placeholder.supabase.co" / "placeholder-key", which silently shipped in a
// TestFlight build when the EAS environment variables were not configured —
// causing every network request to fail with "Network request failed" in
// production with no obvious cause. Throwing here surfaces the misconfiguration
// immediately at startup rather than hiding it behind a runtime network error.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "For local dev, ensure .env exists. " +
      "For EAS builds, ensure EAS environment variables are set (eas env:list production).",
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
