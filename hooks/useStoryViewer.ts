import {
  useSharedValue,
  withTiming,
  cancelAnimation,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type StoryItem = {
  id: string;
  mediaUrl: string;
  type: "image" | "video";
  durationMs: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
  isSeen: boolean;
};

type StoryGroup = {
  authorId: string;
  authorName: string;
  avatarUrl: string | null;
  hasUnseen: boolean;
  stories: StoryItem[];
};

const PHOTO_DURATION = 5000;
const MUTE_STORAGE_KEY = "@stories_muted";

export function useStoryViewer(groups: StoryGroup[], onClose: () => void) {
  const [creatorIndex, setCreatorIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const progress = useSharedValue(0);
  const remainingDuration = useRef(PHOTO_DURATION);
  // Actual video duration reported by the player — takes precedence over DB value
  const videoDurationMs = useRef<number | null>(null);
  // Guards so startProgress is only called once per story
  const progressStarted = useRef(false);

  // Ref-based readiness flags — readable from any callback without stale closure risk
  const mediaReadyRef = useRef(false);
  const durationKnownRef = useRef(false);

  const currentGroup = groups[creatorIndex];
  const currentStory = currentGroup?.stories[storyIndex];

  // Derived: next story for preloading
  const nextStory: StoryItem | null = (() => {
    if (!currentGroup) return null;
    if (storyIndex < currentGroup.stories.length - 1) {
      return currentGroup.stories[storyIndex + 1];
    }
    if (creatorIndex < groups.length - 1) {
      return groups[creatorIndex + 1]?.stories[0] ?? null;
    }
    return null;
  })();

  // Load persisted mute preference on mount
  useEffect(() => {
    AsyncStorage.getItem(MUTE_STORAGE_KEY).then((val) => {
      if (val !== null) {
        setIsMuted(val === "true");
      }
    });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      AsyncStorage.setItem(MUTE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const getDuration = useCallback(() => {
    if (!currentStory) return PHOTO_DURATION;
    // Prefer actual measured duration from the video player
    if (currentStory.type === "video" && videoDurationMs.current) {
      return videoDurationMs.current;
    }
    // Fall back to database value
    if (currentStory.type === "video" && currentStory.durationMs) {
      return currentStory.durationMs;
    }
    return PHOTO_DURATION;
  }, [currentStory]);

  // Forward-declare so callbacks can reference each other
  const goToNextStoryRef = useRef<() => void>(() => {});

  const startProgress = useCallback(() => {
    if (progressStarted.current) return;
    progressStarted.current = true;

    const duration = getDuration();
    remainingDuration.current = duration;
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(goToNextStoryRef.current)();
      }
    );
  }, [getDuration, progress]);

  // Checks both readiness refs and starts progress if all conditions are met.
  // Safe to call from either callback — whichever fires second wins.
  const isPausedRef = useRef(false);
  const isBufferingRef = useRef(false);

  const tryStartProgress = useCallback(() => {
    if (
      mediaReadyRef.current &&
      durationKnownRef.current &&
      !isPausedRef.current &&
      !isBufferingRef.current
    ) {
      startProgress();
    }
  }, [startProgress]);

  const pause = useCallback(() => {
    cancelAnimation(progress);
    remainingDuration.current = getDuration() * (1 - progress.value);
    isPausedRef.current = true;
    setIsPaused(true);
  }, [getDuration, progress]);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    // Only resume animation when not buffering
    if (isBufferingRef.current) return;
    progress.value = withTiming(
      1,
      { duration: remainingDuration.current, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(goToNextStoryRef.current)();
      }
    );
  }, [progress]);

  // Two-lock system: pause animation when either isPaused OR isBuffering is true
  const pauseAnimation = useCallback(() => {
    cancelAnimation(progress);
    remainingDuration.current = getDuration() * (1 - progress.value);
  }, [getDuration, progress]);

  const resumeAnimation = useCallback(() => {
    progress.value = withTiming(
      1,
      { duration: remainingDuration.current, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(goToNextStoryRef.current)();
      }
    );
  }, [progress]);

  // React to buffering changes — pauses/resumes progress bar
  const onBufferingChange = useCallback(
    (buffering: boolean) => {
      isBufferingRef.current = buffering;
      setIsBuffering(buffering);
      if (buffering) {
        pauseAnimation();
      } else if (!isPausedRef.current) {
        resumeAnimation();
      }
    },
    [pauseAnimation, resumeAnimation]
  );

  const resetNavState = useCallback(() => {
    cancelAnimation(progress);
    mediaReadyRef.current = false;
    durationKnownRef.current = false;
    setMediaReady(false);
    setIsBuffering(false);
    isBufferingRef.current = false;
    videoDurationMs.current = null;
    progressStarted.current = false;
  }, [progress]);

  const goToNextStory = useCallback(() => {
    resetNavState();

    if (!currentGroup) {
      onClose();
      return;
    }

    if (storyIndex < currentGroup.stories.length - 1) {
      progress.value = 0;
      setStoryIndex((i) => i + 1);
    } else if (creatorIndex < groups.length - 1) {
      progress.value = 0;
      setStoryIndex(0);
      setCreatorIndex((i) => i + 1);
    } else {
      onClose();
    }
  }, [storyIndex, creatorIndex, currentGroup, groups.length, onClose, progress, resetNavState]);

  // Keep ref in sync
  goToNextStoryRef.current = goToNextStory;

  const goToPrevStory = useCallback(() => {
    resetNavState();

    if (storyIndex > 0) {
      progress.value = 0;
      setStoryIndex((i) => i - 1);
    } else if (creatorIndex > 0) {
      progress.value = 0;
      setCreatorIndex((i) => {
        const prevGroup = groups[i - 1];
        setStoryIndex(prevGroup ? prevGroup.stories.length - 1 : 0);
        return i - 1;
      });
    } else {
      // Restart current story
      progress.value = 0;
    }
  }, [storyIndex, creatorIndex, groups, progress, resetNavState]);

  const goToNextCreator = useCallback(() => {
    resetNavState();

    if (creatorIndex < groups.length - 1) {
      progress.value = 0;
      setStoryIndex(0);
      setCreatorIndex((i) => i + 1);
    } else {
      onClose();
    }
  }, [creatorIndex, groups.length, onClose, progress, resetNavState]);

  const goToPrevCreator = useCallback(() => {
    resetNavState();

    if (creatorIndex > 0) {
      progress.value = 0;
      setStoryIndex(0);
      setCreatorIndex((i) => i - 1);
    }
  }, [creatorIndex, progress, resetNavState]);

  const onMediaReady = useCallback(() => {
    mediaReadyRef.current = true;
    setMediaReady(true);

    if (currentStory?.type === "image") {
      // Images have no duration to wait for — mark duration known and start immediately
      durationKnownRef.current = true;
      tryStartProgress();
    } else {
      // Videos: startProgress deferred until onVideoDurationKnown also fires
      tryStartProgress();
    }
  }, [tryStartProgress, currentStory]);

  // Called by StoryMedia once actual video duration is known
  const onVideoDurationKnown = useCallback(
    (ms: number) => {
      videoDurationMs.current = ms;
      durationKnownRef.current = true;
      // Safe: reads refs, no stale closure on mediaReady state
      tryStartProgress();
    },
    [tryStartProgress]
  );

  const onVideoEnd = useCallback(() => {
    goToNextStory();
  }, [goToNextStory]);

  const openAt = useCallback(
    (groupIndex: number) => {
      setCreatorIndex(groupIndex);
      setStoryIndex(0);
      setIsPaused(false);
      isPausedRef.current = false;
      setIsBuffering(false);
      isBufferingRef.current = false;
      setMediaReady(false);
      mediaReadyRef.current = false;
      durationKnownRef.current = false;
      progress.value = 0;
      remainingDuration.current = PHOTO_DURATION;
      videoDurationMs.current = null;
      progressStarted.current = false;
    },
    [progress]
  );

  return {
    creatorIndex,
    storyIndex,
    isPaused,
    isBuffering,
    mediaReady,
    isMuted,
    progress,
    currentGroup,
    currentStory,
    nextStory,
    goToNextStory,
    goToPrevStory,
    goToNextCreator,
    goToPrevCreator,
    pause,
    resume,
    onMediaReady,
    onVideoDurationKnown,
    onBufferingChange,
    onVideoEnd,
    toggleMute,
    openAt,
  };
}
