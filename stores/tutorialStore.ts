import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@tapzi_tutorial_progress";

interface TutorialState {
  // Persisted state
  completedLessons: string[];

  // Active walkthrough state (not persisted)
  currentLessonId: string | null;
  currentStepIndex: number;
  isOverlayVisible: boolean;

  // Actions
  startLesson: (lessonId: string) => void;
  nextStep: () => void;
  previousStep: () => void;
  completeLesson: (lessonId: string) => Promise<void>;
  skipLesson: () => void;
  dismissOverlay: () => void;
  resetAll: () => Promise<void>;

  // Queries
  isLessonCompleted: (lessonId: string) => boolean;
  getLessonProgress: (chapterLessons: string[]) => number;
  getOverallProgress: (totalLessons: number) => number;

  // Hydration
  hydrate: () => Promise<void>;
}

async function persistCompletedLessons(completedLessons: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(completedLessons));
  } catch {
    // Silently ignore write errors
  }
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  // Initial state
  completedLessons: [],
  currentLessonId: null,
  currentStepIndex: 0,
  isOverlayVisible: false,

  // Actions
  startLesson: (lessonId: string) => {
    set({
      currentLessonId: lessonId,
      currentStepIndex: 0,
      isOverlayVisible: true,
    });
  },

  nextStep: () => {
    set((state) => ({ currentStepIndex: state.currentStepIndex + 1 }));
  },

  previousStep: () => {
    set((state) => ({
      currentStepIndex: Math.max(0, state.currentStepIndex - 1),
    }));
  },

  completeLesson: async (lessonId: string) => {
    const { completedLessons } = get();
    const alreadyCompleted = completedLessons.includes(lessonId);
    const updated = alreadyCompleted
      ? completedLessons
      : [...completedLessons, lessonId];

    set({
      completedLessons: updated,
      isOverlayVisible: false,
      currentLessonId: null,
      currentStepIndex: 0,
    });

    if (!alreadyCompleted) {
      await persistCompletedLessons(updated);
    }
  },

  skipLesson: () => {
    set({
      isOverlayVisible: false,
      currentLessonId: null,
      currentStepIndex: 0,
    });
  },

  dismissOverlay: () => {
    set({
      isOverlayVisible: false,
      currentLessonId: null,
      currentStepIndex: 0,
    });
  },

  resetAll: async () => {
    set({
      completedLessons: [],
      currentLessonId: null,
      currentStepIndex: 0,
      isOverlayVisible: false,
    });
    await persistCompletedLessons([]);
  },

  // Queries
  isLessonCompleted: (lessonId: string) => {
    return get().completedLessons.includes(lessonId);
  },

  getLessonProgress: (chapterLessons: string[]) => {
    if (chapterLessons.length === 0) return 0;
    const { completedLessons } = get();
    const completedCount = chapterLessons.filter((id) =>
      completedLessons.includes(id)
    ).length;
    return Math.round((completedCount / chapterLessons.length) * 100);
  },

  getOverallProgress: (totalLessons: number) => {
    if (totalLessons === 0) return 0;
    const { completedLessons } = get();
    return Math.round((completedLessons.length / totalLessons) * 100);
  },

  // Hydration
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: string[] = JSON.parse(raw);
        set({ completedLessons: parsed });
      }
    } catch {
      // Silently ignore read errors — start with empty state
    }
  },
}));
