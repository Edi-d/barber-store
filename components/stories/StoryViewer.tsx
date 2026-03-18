import { useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  Image,
  Dimensions,
  Modal,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  Directions,
} from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { StoryMedia } from "./StoryMedia";
import { StoryProgressBar } from "./StoryProgressBar";
import { useStoryViewer } from "@/hooks/useStoryViewer";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
  const viewedRef = useRef<Set<string>>(new Set());

  const {
    creatorIndex,
    storyIndex,
    isPaused,
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

  // -- Gestures ---------------------------------------------------------------

  const tap = Gesture.Tap().onEnd((event) => {
    "worklet";
    if (event.x < SCREEN_WIDTH / 3) {
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
      // resume() in case a long-press was active when the fling won the Race
      // (long-press onEnd is never called when cancelled by a competing gesture)
      runOnJS(resume)();
      runOnJS(goToNextCreator)();
    });

  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      "worklet";
      // Same guard: ensure playback resumes if long-press was interrupted
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
      <GestureDetector gesture={composed}>
        <View style={styles.container}>
          {/* Story media */}
          {currentStory && (
            <StoryMedia
              key={currentStory.id}
              type={currentStory.type}
              uri={currentStory.mediaUrl}
              isPaused={isPaused}
              onMediaReady={onMediaReady}
              onVideoEnd={onVideoEnd}
            />
          )}

          {/* Top overlay */}
          <View
            style={[
              styles.topOverlay,
              { paddingTop: insets.top + 8 },
            ]}
          >
            {/* Progress bar */}
            {currentGroup && (
              <StoryProgressBar
                totalSegments={currentGroup.stories.length}
                currentIndex={storyIndex}
                progress={progress}
              />
            )}

            {/* Author header */}
            <View style={styles.headerRow}>
              <View style={styles.authorInfo}>
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
              </View>

              <Pressable
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      </GestureDetector>
    </Modal>
  );
}

// -- Styles ------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  // Top overlay
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
  authorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
});
