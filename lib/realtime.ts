import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Global channel registry — tracks all open Supabase Realtime channels by name.
 * Prevents duplicate subscriptions (e.g. React StrictMode double-mount).
 * All realtime hooks should use getOrCreateChannel/removeChannel instead of
 * calling supabase.channel() directly.
 */
const channels = new Map<string, RealtimeChannel>();

/**
 * Returns an existing channel if one with that name is already open,
 * otherwise creates a new one via supabase.channel(name).
 * Callers chain .on(...) and call .subscribe() themselves.
 */
export function getOrCreateChannel(name: string): RealtimeChannel {
  const existing = channels.get(name);
  if (existing) {
    return existing;
  }

  const channel = supabase.channel(name);
  channels.set(name, channel);

  if (__DEV__) {
    console.log(`[Realtime] Channel created: ${name}`);
  }

  return channel;
}

/**
 * Removes a single channel by name — unsubscribes from Supabase and deletes
 * from the registry. No-op if the name is not found.
 */
export function removeChannel(name: string): void {
  const channel = channels.get(name);
  if (!channel) return;

  supabase.removeChannel(channel);
  channels.delete(name);

  if (__DEV__) {
    console.log(`[Realtime] Channel removed: ${name}`);
  }
}

/**
 * Removes every channel tracked by the registry from Supabase and clears
 * the registry. Does NOT call supabase.removeAllChannels() — that would
 * also tear down the internal auth state change channel managed by the
 * Supabase client itself.
 */
export function cleanupAllChannels(): void {
  const count = channels.size;

  channels.forEach((channel, name) => {
    supabase.removeChannel(channel);
    channels.delete(name);
  });

  if (__DEV__) {
    console.log(`[Realtime] All channels cleaned up (${count} removed)`);
  }
}

/**
 * Returns the number of channels currently tracked in the registry.
 * Useful for debugging and testing.
 */
export function getChannelCount(): number {
  return channels.size;
}
