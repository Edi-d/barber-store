import {
  useSharedValue,
  withTiming,
  cancelAnimation,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useCallback, useRef, useState } from "react";

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

export function useStoryViewer(groups: StoryGroup[], onClose: () => void) {
  const [creatorIndex, setCreatorIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);

  const progress = useSharedValue(0);
  const remainingDuration = useRef(PHOTO_DURATION);

  const currentGroup = groups[creatorIndex];
  const currentStory = currentGroup?.stories[storyIndex];

  const getDuration = useCallback(() => {
    if (!currentStory) return PHOTO_DURATION;
    if (currentStory.type === "video" && currentStory.durationMs) {
      return currentStory.durationMs;
    }
    return PHOTO_DURATION;
  }, [currentStory]);

  // Forward-declare so callbacks can reference each other
  const goToNextStoryRef = useRef<() => void>(() => {});

  const startProgress = useCallback(() => {
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

  const pause = useCallback(() => {
    cancelAnimation(progress);
    remainingDuration.current = getDuration() * (1 - progress.value);
    setIsPaused(true);
  }, [getDuration, progress]);

  const resume = useCallback(() => {
    setIsPaused(false);
    progress.value = withTiming(
      1,
      { duration: remainingDuration.current, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(goToNextStoryRef.current)();
      }
    );
  }, [progress]);

  const goToNextStory = useCallback(() => {
    cancelAnimation(progress);
    setMediaReady(false);

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
  }, [storyIndex, creatorIndex, currentGroup, groups.length, onClose, progress]);

  // Keep ref in sync
  goToNextStoryRef.current = goToNextStory;

  const goToPrevStory = useCallback(() => {
    cancelAnimation(progress);
    setMediaReady(false);

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
      setMediaReady(false);
    }
  }, [storyIndex, creatorIndex, groups, progress]);

  const goToNextCreator = useCallback(() => {
    cancelAnimation(progress);
    setMediaReady(false);
    if (creatorIndex < groups.length - 1) {
      progress.value = 0;
      setStoryIndex(0);
      setCreatorIndex((i) => i + 1);
    } else {
      onClose();
    }
  }, [creatorIndex, groups.length, onClose, progress]);

  const goToPrevCreator = useCallback(() => {
    cancelAnimation(progress);
    setMediaReady(false);
    if (creatorIndex > 0) {
      progress.value = 0;
      setStoryIndex(0);
      setCreatorIndex((i) => i - 1);
    }
  }, [creatorIndex, progress]);

  const onMediaReady = useCallback(() => {
    setMediaReady(true);
    if (!isPaused) startProgress();
  }, [startProgress, isPaused]);

  const onVideoEnd = useCallback(() => {
    goToNextStory();
  }, [goToNextStory]);

  const openAt = useCallback(
    (groupIndex: number) => {
      setCreatorIndex(groupIndex);
      setStoryIndex(0);
      setIsPaused(false);
      setMediaReady(false);
      progress.value = 0;
      remainingDuration.current = PHOTO_DURATION;
    },
    [progress]
  );

  return {
    creatorIndex,
    storyIndex,
    isPaused,
    mediaReady,
    progress,
    currentGroup,
    currentStory,
    goToNextStory,
    goToPrevStory,
    goToNextCreator,
    goToPrevCreator,
    pause,
    resume,
    onMediaReady,
    onVideoEnd,
    openAt,
  };
}
