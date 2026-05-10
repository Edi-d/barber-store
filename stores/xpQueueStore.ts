/**
 * xpQueueStore — Zustand queue for shop XP earned toasts and level-up modals.
 *
 * Deduplicates by payload.id (orderId) to prevent double-firing on
 * simultaneous realtime + explicit earnXP() calls.
 *
 * Usage:
 *   const enqueueToast = useXpQueueStore((s) => s.enqueueToast);
 *   const { queue, dequeue, head } = useXpQueueStore();
 *
 * Mount <XpQueueRoot /> in app/_layout.tsx to render the toasts/modals.
 */

import { create } from 'zustand';

export interface XpToastPayload {
  /** orderId — used as dedup key */
  id: string;
  /** XP earned from this order */
  xp: number;
  /** Human-readable earn source, e.g. 'Comanda finalizata' */
  source: string;
  leveled_up: boolean;
  newLevel?: number;
}

interface XpQueueState {
  queue: XpToastPayload[];
  enqueueToast: (payload: XpToastPayload) => void;
  dequeue: () => void;
  head: () => XpToastPayload | null;
}

export const useXpQueueStore = create<XpQueueState>((set, get) => ({
  queue: [],

  enqueueToast: (payload) =>
    set((s) => ({
      // Deduplicate by id — prevents double-firing on realtime + explicit call
      queue: s.queue.some((p) => p.id === payload.id)
        ? s.queue
        : [...s.queue, payload],
    })),

  dequeue: () => set((s) => ({ queue: s.queue.slice(1) })),

  head: () => get().queue[0] ?? null,
}));
