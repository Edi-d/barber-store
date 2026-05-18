import { create } from 'zustand';
import type { LevelConfig } from '@/constants/loyalty';

export type LoyaltyLevel = LevelConfig;

export interface PointsEarnedPayload {
  id: string;
  points: number;
  source: 'appointment' | 'order' | 'voucher' | 'bonus' | 'adjustment' | string;
  balanceAfter?: number;
}

export interface TierUpPayload {
  id: string;
  from: LoyaltyLevel;
  to: LoyaltyLevel;
}

interface LoyaltyQueueState {
  toastQueue: PointsEarnedPayload[];
  levelUpQueue: TierUpPayload[];
  seenIds: Set<string>;
  enqueueToast: (payload: PointsEarnedPayload) => void;
  enqueueLevelUp: (payload: TierUpPayload) => void;
  dequeueToast: () => void;
  dequeueLevelUp: () => void;
  currentToast: () => PointsEarnedPayload | null;
  currentLevelUp: () => TierUpPayload | null;
}

export const useLoyaltyQueueStore = create<LoyaltyQueueState>((set, get) => ({
  toastQueue: [],
  levelUpQueue: [],
  seenIds: new Set<string>(),

  enqueueToast: (payload) =>
    set((s) => {
      if (s.seenIds.has(payload.id)) return s;
      const seenIds = new Set(s.seenIds);
      seenIds.add(payload.id);
      return { toastQueue: [...s.toastQueue, payload], seenIds };
    }),

  enqueueLevelUp: (payload) =>
    set((s) => {
      if (s.seenIds.has(payload.id)) return s;
      const seenIds = new Set(s.seenIds);
      seenIds.add(payload.id);
      return { levelUpQueue: [...s.levelUpQueue, payload], seenIds };
    }),

  dequeueToast: () => set((s) => ({ toastQueue: s.toastQueue.slice(1) })),

  dequeueLevelUp: () => set((s) => ({ levelUpQueue: s.levelUpQueue.slice(1) })),

  currentToast: () => get().toastQueue[0] ?? null,

  currentLevelUp: () => get().levelUpQueue[0] ?? null,
}));
