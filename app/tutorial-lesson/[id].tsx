import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTutorialStore } from "@/stores/tutorialStore";
import {
  getLessonById,
  getChapterForLesson,
  type TutorialChapter,
  type TutorialLesson,
} from "@/data/tutorials";
import { Colors, FontFamily, Shadows } from "@/constants/theme";
import { formatDuration } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Content renderer — premium reading experience
// ---------------------------------------------------------------------------

function renderContent(
  content: string,
  chapterColor: string
): React.ReactNode[] {
  const blocks = content.split("\n\n").filter((b) => b.trim().length > 0);

  return blocks.map((block, blockIndex) => {
    const trimmed = block.trim();

    // ── Section heading: "## Title"
    if (trimmed.startsWith("## ")) {
      return (
        <View key={blockIndex} style={styles.sectionHeaderRow}>
          <View
            style={[styles.sectionAccentBar, { backgroundColor: chapterColor }]}
          />
          <Text style={styles.sectionHeader}>{trimmed.slice(3)}</Text>
        </View>
      );
    }

    // ── Tip card: starts with 💡
    if (trimmed.startsWith("💡 ")) {
      return (
        <View key={blockIndex} style={styles.tipCard}>
          <View
            style={[styles.tipAccentBorder, { backgroundColor: Colors.primary }]}
          />
          <View style={styles.tipInner}>
            <Ionicons
              name="bulb"
              size={20}
              color={Colors.primary}
              style={styles.tipIcon}
            />
            <Text style={styles.tipText}>{trimmed.slice(3)}</Text>
          </View>
        </View>
      );
    }

    // ── Numbered steps block: all lines match "N. text"
    const lines = trimmed.split("\n");
    const numberedPattern = /^\d+\.\s+/;
    const isNumberedBlock =
      lines.length > 0 && lines.every((l) => numberedPattern.test(l.trimStart()));
    if (isNumberedBlock) {
      return (
        <View key={blockIndex} style={styles.numberedBlock}>
          {lines.map((line, lineIndex) => {
            const match = line.trimStart().match(/^(\d+)\.\s+(.*)/);
            if (!match) return null;
            const [, num, text] = match;
            return (
              <View key={lineIndex} style={styles.numberedItem}>
                <View
                  style={[
                    styles.numberedCircle,
                    { backgroundColor: chapterColor },
                  ]}
                >
                  <Text style={styles.numberedCircleText}>{num}</Text>
                </View>
                <Text style={styles.numberedText}>{text}</Text>
              </View>
            );
          })}
        </View>
      );
    }

    // ── Bullet list block: all lines start with "- "
    const isBulletBlock =
      lines.length > 0 && lines.every((l) => l.trimStart().startsWith("- "));
    if (isBulletBlock) {
      return (
        <View key={blockIndex} style={styles.bulletBlock}>
          {lines.map((line, lineIndex) => (
            <View key={lineIndex} style={styles.bulletItem}>
              <View style={[styles.bulletDot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.bulletText}>{line.trimStart().slice(2)}</Text>
            </View>
          ))}
        </View>
      );
    }

    // ── Regular paragraph
    return (
      <Text key={blockIndex} style={styles.paragraph}>
        {trimmed}
      </Text>
    );
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TutorialLessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { isLessonCompleted, completeLesson } = useTutorialStore();

  const lesson: TutorialLesson | undefined = id ? getLessonById(id) : undefined;
  const chapter: TutorialChapter | undefined = id
    ? getChapterForLesson(id)
    : undefined;

  // Find next lesson in chapter
  const nextLesson: TutorialLesson | undefined = (() => {
    if (!chapter || !lesson) return undefined;
    const index = chapter.lessons.findIndex((l) => l.id === lesson.id);
    if (index === -1 || index === chapter.lessons.length - 1) return undefined;
    return chapter.lessons[index + 1];
  })();

  // Find lesson index for step indicator
  const lessonIndex: number = (() => {
    if (!chapter || !lesson) return 0;
    return chapter.lessons.findIndex((l) => l.id === lesson.id);
  })();

  const isCompleted = id ? isLessonCompleted(id) : false;

  const handleNextLesson = () => {
    if (!nextLesson) return;
    if (nextLesson.type === "text") {
      router.replace(`/tutorial-lesson/${nextLesson.id}`);
    } else {
      router.back();
    }
  };

  // ── Not found guard
  if (!lesson || !chapter) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={[styles.backButton, Shadows.md]}
          >
            <Ionicons name="chevron-back" size={22} color="#191919" />
          </Pressable>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.notFoundCenter}>
          <Ionicons name="alert-circle-outline" size={48} color="#CBD5E1" />
          <Text style={styles.notFoundText}>Lectia nu a fost gasita.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const chapterColor = chapter.iconColor ?? Colors.primary;
  const chapterBgColor = chapter.iconBgColor ?? "rgba(10,102,194,0.08)";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={[styles.backButton, Shadows.md]}
        >
          <Ionicons name="chevron-back" size={22} color="#191919" />
        </Pressable>

        <Text numberOfLines={1} style={styles.headerTitle}>
          {chapter.title}
        </Text>

        {isCompleted ? (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
            <Text style={styles.completedBadgeText}>Completat</Text>
          </View>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Lesson Hero ── */}
        <View style={styles.hero}>
          {/* Chapter pill */}
          <View style={[styles.chapterPill, { backgroundColor: chapterBgColor }]}>
            <Ionicons
              name={chapter.icon as any}
              size={14}
              color={chapterColor}
            />
            <Text style={[styles.chapterPillText, { color: chapterColor }]}>
              {chapter.title}
            </Text>
          </View>

          {/* Lesson title */}
          <Text style={styles.lessonTitle}>{lesson.title}</Text>

          {/* Meta row */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="book-outline" size={14} color="#94A3B8" />
              <Text style={styles.metaText}>Text</Text>
            </View>
            <View style={styles.metaSeparator} />
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color="#94A3B8" />
              <Text style={styles.metaText}>{formatDuration(lesson.durationSec)}</Text>
            </View>
            <View style={styles.metaSeparator} />
            <View style={styles.metaItem}>
              <Ionicons name="layers-outline" size={15} color="#94A3B8" />
              <Text style={styles.metaText}>
                {lessonIndex + 1} din {chapter.lessons.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.heroDivider} />

        {/* ── Body content ── */}
        <View style={styles.body}>
          {lesson.content ? (
            renderContent(lesson.content, chapterColor)
          ) : (
            <View style={styles.emptyContent}>
              <Ionicons name="document-text-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyContentText}>
                Continutul lectiei va fi disponibil in curand.
              </Text>
            </View>
          )}
        </View>

        {/* Bottom breathing room */}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Bottom action bar ── */}
      <View
        style={[
          styles.actionBar,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        {/* Completed state */}
        {isCompleted && (
          <View style={styles.completedRow}>
            <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
            <Text style={styles.completedRowText}>Completat</Text>
          </View>
        )}

        {/* Mark as complete — only when not completed */}
        {!isCompleted && (
          <Pressable
            onPress={() => id && completeLesson(id)}
            className="active:opacity-70"
          >
            <View style={styles.markCompleteBtn}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.markCompleteText}>
                Marcheaza ca finalizat
              </Text>
            </View>
          </Pressable>
        )}

        {/* Next lesson */}
        {nextLesson && (
          <Pressable
            onPress={handleNextLesson}
            className="active:opacity-80"
          >
            <View style={styles.nextLessonBtn}>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              <Text style={styles.nextLessonText}>
                Lectia urmatoare
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 36,
    height: 36,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: "#1E293B",
    textAlign: "center",
    marginHorizontal: 12,
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  completedBadgeText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    color: "#16A34A",
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },

  // ── Hero
  hero: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  chapterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  chapterPillText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
  },
  lessonTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
    color: "#1E293B",
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: "#64748B",
  },
  metaSeparator: {
    width: 1,
    height: 12,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 10,
  },
  heroDivider: {
    height: 1,
    backgroundColor: "#E8E8E8",
    marginHorizontal: 24,
  },

  // ── Body
  body: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },

  // ── Paragraph
  paragraph: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 26,
    color: "#334155",
    marginBottom: 16,
  },

  // ── Section headers
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 12,
    gap: 10,
  },
  sectionAccentBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  sectionHeader: {
    fontFamily: FontFamily.bold,
    fontSize: 20,
    lineHeight: 28,
    color: "#1E293B",
    flex: 1,
  },

  // ── Bullet list
  bulletBlock: {
    marginBottom: 16,
  },
  bulletItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginLeft: 16,
    marginBottom: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    marginRight: 10,
  },
  bulletText: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: "#334155",
    flex: 1,
  },

  // ── Tip card
  tipCard: {
    flexDirection: "row",
    backgroundColor: "rgba(10,102,194,0.05)",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  tipAccentBorder: {
    width: 3,
  },
  tipInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
  },
  tipIcon: {
    marginTop: 1,
  },
  tipText: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 22,
    color: "#1E293B",
    flex: 1,
  },

  // ── Numbered steps
  numberedBlock: {
    marginBottom: 16,
    gap: 12,
  },
  numberedItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  numberedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  numberedCircleText: {
    fontFamily: FontFamily.bold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  numberedText: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: "#334155",
    flex: 1,
  },

  // ── Empty / not found
  emptyContent: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyContentText: {
    marginTop: 12,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: "#94A3B8",
    textAlign: "center",
  },
  notFoundCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  notFoundText: {
    marginTop: 12,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
  },

  // ── Bottom action bar
  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
    gap: 10,
  },

  // Completed row
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  completedRowText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: "#16A34A",
  },

  // Mark complete button
  markCompleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
    backgroundColor: "#FFFFFF",
  },
  markCompleteText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.primary,
  },

  // Next lesson button
  nextLessonBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
  },
  nextLessonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: "#FFFFFF",
  },
});
