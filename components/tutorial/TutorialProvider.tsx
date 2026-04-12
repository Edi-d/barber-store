import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useState,
  useEffect,
} from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTutorialStore } from '@/stores/tutorialStore';
import { getLessonById } from '@/data/tutorials';
import TutorialOverlay from './TutorialOverlay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TargetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TutorialContextValue {
  registerRef: (key: string, ref: React.RefObject<View>) => void;
  unregisterRef: (key: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TutorialContext = createContext<TutorialContextValue>({
  registerRef: () => {},
  unregisterRef: () => {},
});

export const useTutorialContext = () => useContext(TutorialContext);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * TutorialProvider
 *
 * Must wrap the application root (inside GestureHandlerRootView /
 * QueryClientProvider but outside nothing navigation-specific).
 *
 * Responsibilities:
 *  - Owns the mutable Map<string, React.RefObject<View>> ref registry.
 *  - Exposes registerRef / unregisterRef via context so any screen can
 *    register its measurable elements without causing re-renders on the tree.
 *  - Watches tutorialStore for overlay visibility + step changes.
 *  - Measures the target element via measureInWindow (New Architecture safe)
 *    after a 300 ms settle delay, with one retry on zero-dimension results.
 *  - Renders TutorialOverlay absolutely above everything when active.
 */
export function TutorialProvider({ children }: { children: React.ReactNode }) {
  // Use a ref (not state) for the registry — mutations must never trigger
  // a Provider re-render and cascade down the whole tree.
  const refs = useRef(new Map<string, React.RefObject<View>>());

  const [targetBounds, setTargetBounds] = useState<TargetBounds | null>(null);

  const router = useRouter();

  const { currentLessonId, currentStepIndex, isOverlayVisible } =
    useTutorialStore();

  // ------------------------------------------------------------------
  // Registry helpers
  // ------------------------------------------------------------------

  const registerRef = useCallback(
    (key: string, ref: React.RefObject<View>) => {
      refs.current.set(key, ref);
    },
    [],
  );

  const unregisterRef = useCallback((key: string) => {
    refs.current.delete(key);
  }, []);

  // ------------------------------------------------------------------
  // Measurement — re-runs whenever the visible step changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!isOverlayVisible || !currentLessonId) {
      setTargetBounds(null);
      return;
    }

    const lesson = getLessonById(currentLessonId);
    const step = lesson?.steps?.[currentStepIndex];

    if (!step) {
      // Step definition missing — clear any stale bounds so the overlay
      // doesn't display a cutout for a phantom element.
      setTargetBounds(null);
      return;
    }

    const attemptMeasure = (retriesLeft: number) => {
      const ref = refs.current.get(step.targetRefKey);

      if (!ref?.current) {
        if (retriesLeft > 0) {
          setTimeout(() => attemptMeasure(retriesLeft - 1), 150);
        } else {
          setTargetBounds(null);
        }
        return;
      }

      ref.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargetBounds({ x, y, width, height });
        } else if (retriesLeft > 0) {
          setTimeout(() => attemptMeasure(retriesLeft - 1), 150);
        } else {
          setTargetBounds(null);
        }
      });
    };

    // Check if ref exists immediately (same-screen step).
    // Even for same-screen steps we wait a short beat: screens sometimes need
    // to scroll or animate before the target view is at its final position
    // (e.g. shop.tsx auto-scrolls the FlatList to reveal the sort button).
    // For cross-screen steps the ref won't exist yet, so we wait longer.
    const ref = refs.current.get(step.targetRefKey);
    if (ref?.current) {
      const measureTimeout = setTimeout(() => attemptMeasure(2), 400);
      return () => clearTimeout(measureTimeout);
    } else {
      // Cross-screen — wait for screen to mount and register refs
      const measureTimeout = setTimeout(() => attemptMeasure(3), 250);
      return () => clearTimeout(measureTimeout);
    }
  }, [isOverlayVisible, currentLessonId, currentStepIndex]);

  // ------------------------------------------------------------------
  // Derive current step data for overlay props
  // ------------------------------------------------------------------

  const lesson = currentLessonId ? getLessonById(currentLessonId) : null;
  const currentStep = lesson?.steps?.[currentStepIndex] ?? null;
  const totalSteps = lesson?.steps?.length ?? 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  // ------------------------------------------------------------------
  // Overlay callbacks — call store actions directly via getState() to
  // avoid stale closures without adding store values to the dep array.
  // ------------------------------------------------------------------

  const handleNext = useCallback(() => {
    if (!currentLessonId) return;

    if (isLastStep) {
      // completeLesson is async but the return value is intentionally
      // discarded here — the store updates synchronously for UI purposes
      // and the async tail only persists to AsyncStorage.
      void useTutorialStore.getState().completeLesson(currentLessonId);
      return;
    }

    // Check whether the next step lives on a different screen and navigate
    // before advancing the index so the target ref has time to mount.
    const lesson = getLessonById(currentLessonId);
    const steps = lesson?.steps;
    if (steps) {
      const nextIndex = currentStepIndex + 1;
      const currentScreen = steps[currentStepIndex]?.targetScreen;
      const nextScreen = steps[nextIndex]?.targetScreen;

      if (nextScreen && nextScreen !== currentScreen) {
        router.push(nextScreen as any);
        // Delay the store increment so the new screen can mount and register
        // its refs before TutorialProvider re-measures.
        setTimeout(() => useTutorialStore.getState().nextStep(), 250);
        return;
      }
    }

    useTutorialStore.getState().nextStep();
  }, [currentLessonId, currentStepIndex, isLastStep, router]);

  const handleSkip = useCallback(() => {
    useTutorialStore.getState().skipLesson();
  }, []);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <TutorialContext.Provider value={{ registerRef, unregisterRef }}>
      {children}
      <TutorialOverlay
        visible={isOverlayVisible}
        targetBounds={targetBounds}
        step={currentStep}
        stepIndex={currentStepIndex}
        totalSteps={totalSteps}
        onNext={handleNext}
        onSkip={handleSkip}
      />
    </TutorialContext.Provider>
  );
}
