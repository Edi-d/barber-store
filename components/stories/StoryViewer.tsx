import { useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  Image,
  Modal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  Directions,
} from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { router } from "expo-router";
import { Video, ResizeMode } from "expo-av";

import { StoryMedia } from "./StoryMedia";
import { StoryProgressBar } from "./StoryProgressBar";
import { useStoryViewer } from "@/hooks/useStoryViewer";
import { useAuthStore } from "@/stores/authStore";
import { useTutorialContext } from "@/components/tutorial/TutorialProvider";

// -- Types -------------------------------------------------------------------

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

type StoryViewerProps = {
  visible: boolean;
  groups: StoryGroup[];
  initialGroupIndex: number;
  onClose: () => void;
  onStoryViewed?: (storyId: string) => void;
};

// -- Time ago (Romanian) -----------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "acum";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `acum ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `acum ${hours} ${hours === 1 ? "ora" : "ore"}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `acum ${days} ${days === 1 ? "zi" : "zile"}`;
  const weeks = Math.floor(days / 7);
  return `acum ${weeks} sapt.`;
}

// -- Component ---------------------------------------------------------------

export function StoryViewer({
  visible,
  groups,
  initialGroupIndex,
  onClose,
  onStoryViewed,
}: StoryViewerProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const viewedRef = useRef<Set<string>>(new Set());
  const currentUserId = useAuthStore((s) => s.profile?.id);

  const { registerRef, unregisterRef } = useTutorialContext();
  const muteButtonRef = useRef<View>(null);

  const {
    creatorIndex,
    storyIndex,
    isPaused,
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
  } = useStoryViewer(groups, onClose);

  // Open at initial group when viewer becomes visible
  useEffect(() => {
    if (visible) {
      viewedRef.current.clear();
      openAt(initialGroupIndex);
    }
  }, [visible, initialGroupIndex, openAt]);

  // Mark story as viewed
  useEffect(() => {
    if (visible && currentStory && onStoryViewed) {
      if (!viewedRef.current.has(currentStory.id)) {
        viewedRef.current.add(currentStory.id);
        onStoryViewed(currentStory.id);
      }
    }
  }, [visible, currentStory?.id, onStoryViewed]);

  // Prefetch next story
  useEffect(() => {
    if (!nextStory) return;
    if (nextStory.type === "image" && nextStory.mediaUrl) {
      Image.prefetch(nextStory.mediaUrl).catch(() => {});
    }
    // For videos: the hidden Video component below handles preloading
  }, [nextStory?.id]);

  // Register mute button ref for tutorial spotlight
  useEffect(() => {
    registerRef("feed-stories-mute", muteButtonRef);
    return () => unregisterRef("feed-stories-mute");
  }, [registerRef, unregisterRef]);

  // -- Gestures (media area only) -------------------------------------------

  const tap = Gesture.Tap().onEnd((event) => {
    "worklet";
    if (event.x < screenWidth / 3) {
      runOnJS(goToPrevStory)();
    } else {
      runOnJS(goToNextStory)();
    }
  });

  const longPress = Gesture.LongPress()
    .minDuration(200)
    .onStart(() => {
      "worklet";
      runOnJS(pause)();
    })
    .onEnd(() => {
      "worklet";
      runOnJS(resume)();
    });

  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      "worklet";
      runOnJS(resume)();
      runOnJS(goToNextCreator)();
    });

  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      "worklet";
      runOnJS(resume)();
      runOnJS(goToPrevCreator)();
    });

  const composed = Gesture.Race(
    flingLeft,
    flingRight,
    Gesture.Exclusive(longPress, tap)
  );

  // -- Render -----------------------------------------------------------------

  if (!visible || groups.length === 0) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      transparent={false}
    >
      {/* Root container — fills screen */}
      <View style={styles.container}>

        {/* GESTURE ZONE: covers only the media area, below the overlay */}
        <GestureDetector gesture={composed}>
          <View style={StyleSheet.absoluteFill}>
            {/* Story media */}
            {currentStory && (
              <StoryMedia
                key={currentStory.id}
                type={currentStory.type}
                uri={currentStory.mediaUrl}
                isPaused={isPaused}
                isMuted={isMuted}
                onMediaReady={onMediaReady}
                onVideoEnd={onVideoEnd}
                onVideoDurationKnown={onVideoDurationKnown}
                onBufferingChange={onBufferingChange}
                onVideoError={goToNextStory}
              />
            )}
          </View>
        </GestureDetector>

        {/* Hidden preload Video for next video story — shouldPlay=false keeps it idle */}
        {nextStory?.type === "video" && nextStory.mediaUrl ? (
          <Video
            key={`preload-${nextStory.id}`}
            source={{ uri: nextStory.mediaUrl }}
            shouldPlay={false}
            isMuted
            style={styles.hiddenPreload}
          />
        ) : null}

        {/* TOP OVERLAY — outside GestureDetector so taps don't trigger story navigation */}
        <View
          style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          {/* Progress bar */}
          {currentGroup && (
            <StoryProgressBar
              totalSegments={currentGroup.stories.length}
              currentIndex={storyIndex}
              progress={progress}
            />
          )}

          {/* Author header row */}
          <View style={styles.headerRow}>
            <Pressable
              className="flex-row items-center gap-2 flex-1"
              onPress={() => {
                if (!currentGroup?.authorId) return;
                onClose();
                if (currentGroup.authorId === currentUserId) {
                  router.push("/(tabs)/profile");
                } else {
                  router.push(`/profile/${currentGroup.authorId}` as any);
                }
              }}
            >
              {currentGroup?.avatarUrl ? (
                <Image
                  source={{ uri: currentGroup.avatarUrl }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>
                    {(currentGroup?.authorName ?? "?")[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.authorName} numberOfLines={1}>
                {currentGroup?.authorName}
              </Text>
              {currentStory && (
                <Text style={styles.timeAgoText}>
                  {timeAgo(currentStory.createdAt)}
                </Text>
              )}
            </Pressable>

            {/* Right-side action buttons — mute (videos only) + close */}
            <View style={styles.actionButtons}>
              {currentStory?.type === "video" && (
                <Pressable
                  ref={muteButtonRef}
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={styles.iconBtn}
                  onPress={toggleMute}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                >
                  <Feather
                    name={isMuted ? "volume-x" : "volume-2"}
                    size={20}
                    color="#fff"
                  />
                </Pressable>
              )}

              <Pressable
                className="w-9 h-9 rounded-full items-center justify-center"
                style={styles.iconBtn}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
              >
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// -- Styles ------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  // Top overlay — sits above gesture zone via absolute positioning
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  // Header row
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  // Avatar
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
  },
  avatarFallback: {
    backgroundColor: "#D4A574",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  // Author name / timestamp
  authorName: {
    fontWeight: "600",
    fontSize: 14,
    color: "#fff",
    maxWidth: 160,
  },
  timeAgoText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },

  // Right-side buttons row
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconBtn: {
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  // Invisible preload video
  hiddenPreload: {
    width: 0,
    height: 0,
    position: "absolute",
    opacity: 0,
  },
});
