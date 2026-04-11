/**
 * useTutorial.ts
 *
 * Public hook API for the tutorial system. Wraps tutorialStore with navigation
 * orchestration and derived progress calculations.
 *
 * Usage:
 *   const { start, next, skip, isActive, currentStep, overallProgress } = useTutorial();
 */

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useTutorialStore } from '@/stores/tutorialStore';
import { TUTORIALS, getLessonById } from '@/data/tutorials';
import type { TutorialStep, TutorialChapter, TutorialLesson } from '@/data/tutorials';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseTutorialReturn {
  // Active walkthrough state
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  currentLessonId: string | null;

  // Progress
  overallProgress: number;        // 0–100
  completedCount: number;
  totalLessons: number;

  // Walkthrough actions
  start: (lessonId: string) => void;
  next: () => void;
  skip: () => void;
  complete: () => void;

  // Queries
  hasCompleted: (lessonId: string) => boolean;
  chapterProgress: (chapterId: string) => number;
  getNextLesson: () => { lesson: TutorialLesson; chapter: TutorialChapter } | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTutorial(): UseTutorialReturn {
  const store = useTutorialStore();
  const router = useRouter();

  // Derived step data from static tutorial definitions
  const currentLesson = store.currentLessonId
    ? getLessonById(store.currentLessonId)
    : null;

  const currentStep = currentLesson?.steps?.[store.currentStepIndex] ?? null;
  const totalSteps = currentLesson?.steps?.length ?? 0;

  // Pre-computed total across all chapters (static, no store dependency)
  const totalLessons = TUTORIALS.reduce(
    (acc, chapter) => acc + chapter.lessons.length,
    0,
  );

  const overallProgress = store.getOverallProgress(totalLessons);

  // -------------------------------------------------------------------------
  // Walkthrough actions
  // -------------------------------------------------------------------------

  /**
   * Start an interactive lesson. Navigates to the first step's target screen
   * before the overlay appears.
   */
  const start = useCallback(
    (lessonId: string) => {
      const lesson = getLessonById(lessonId);
      if (!lesson || lesson.type !== 'interactive' || !lesson.steps?.length) return;

      const firstStep = lesson.steps[0];

      if (firstStep.targetScreen) {
        // Navigate first so the target screen mounts and can register its refs
        // before the overlay measurement fires. startLesson is called after a
        // delay matching the 500 ms measurement settle in TutorialProvider.
        router.push(firstStep.targetScreen as any);
        setTimeout(() => store.startLesson(lessonId), 250);
      } else {
        store.startLesson(lessonId);
      }
    },
    // router is stable; store.startLesson identity is stable (Zustand action)
    [router, store.startLesson],
  );

  /**
   * Advance to the next step. Handles cross-screen navigation by navigating
   * first and delaying the store increment so the target screen has time to
   * mount and register its refs before the overlay repositions.
   */
  const next = useCallback(() => {
    if (!currentLesson?.steps) return;

    const nextIndex = store.currentStepIndex + 1;

    if (nextIndex >= currentLesson.steps.length) {
      // Last step — mark lesson complete and dismiss overlay
      if (store.currentLessonId) {
        store.completeLesson(store.currentLessonId);
      }
      return;
    }

    const nextStep = currentLesson.steps[nextIndex];
    const prevStep = currentLesson.steps[store.currentStepIndex];

    if (nextStep.targetScreen !== prevStep.targetScreen) {
      // Navigate first, then advance the step index after screen settles
      router.push(nextStep.targetScreen as any);
      setTimeout(() => store.nextStep(), 250);
    } else {
      store.nextStep();
    }
  }, [
    currentLesson,
    store.currentStepIndex,
    store.currentLessonId,
    store.completeLesson,
    store.nextStep,
    router,
  ]);

  /**
   * Dismiss the overlay without marking the lesson as complete.
   */
  const skip = useCallback(() => {
    store.skipLesson();
  }, [store.skipLesson]);

  /**
   * Explicitly complete the active lesson (e.g. from "Gata!" on the last step).
   */
  const complete = useCallback(() => {
    if (store.currentLessonId) {
      store.completeLesson(store.currentLessonId);
    }
  }, [store.currentLessonId, store.completeLesson]);

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * Returns whether a specific lesson has been completed.
   */
  const hasCompleted = useCallback(
    (lessonId: string) => store.isLessonCompleted(lessonId),
    // Re-derive when the completed list changes
    [store.completedLessons, store.isLessonCompleted],
  );

  /**
   * Returns completion percentage (0–100) for all lessons in a given chapter.
   */
  const chapterProgress = useCallback(
    (chapterId: string): number => {
      const chapter = TUTORIALS.find((ch) => ch.id === chapterId);
      if (!chapter) return 0;
      const lessonIds = chapter.lessons.map((l) => l.id);
      return store.getLessonProgress(lessonIds);
    },
    [store.completedLessons, store.getLessonProgress],
  );

  /**
   * Returns the first incomplete lesson across all chapters in order,
   * or null when all lessons are completed.
   */
  const getNextLesson = useCallback(():
    | { lesson: TutorialLesson; chapter: TutorialChapter }
    | null => {
    for (const chapter of TUTORIALS) {
      for (const lesson of chapter.lessons) {
        if (!store.isLessonCompleted(lesson.id)) {
          return { lesson, chapter };
        }
      }
    }
    return null;
  }, [store.completedLessons, store.isLessonCompleted]);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    // Active walkthrough state
    isActive: store.isOverlayVisible,
    currentStep,
    currentStepIndex: store.currentStepIndex,
    totalSteps,
    currentLessonId: store.currentLessonId,

    // Progress
    overallProgress,
    completedCount: store.completedLessons.length,
    totalLessons,

    // Walkthrough actions
    start,
    next,
    skip,
    complete,

    // Queries
    hasCompleted,
    chapterProgress,
    getNextLesson,
  };
}
