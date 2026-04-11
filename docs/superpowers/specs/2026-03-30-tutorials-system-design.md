# Tutorials System Design

## Overview

Transform the existing "Tutoriale aplicatie" menu item into a full tutorial system with:
- **Text lessons** explaining app features (video-ready placeholders for future)
- **Interactive walkthroughs** that guide users step-by-step through the app with spotlight overlays
- Static data (no DB migrations), progress persisted via AsyncStorage + Zustand

## Content Structure

### Chapter 0: Bine ai venit pe Tapzi
| # | Lesson | Type | Est. |
|---|--------|------|------|
| 1 | Ce este Tapzi? | text | 45s |
| 2 | Navigarea in aplicatie | interactive | 4 steps |
| 3 | Profilul tau | interactive | 3 steps |

### Chapter 1: Programari (Discover + Booking)
| # | Lesson | Type | Est. |
|---|--------|------|------|
| 1 | Descopera saloane pe harta | text | 60s |
| 2 | Foloseste filtrele si cautarea | interactive | 5 steps |
| 3 | Exploreaza un salon | text | 90s |
| 4 | Alege frizerul potrivit | interactive | 3 steps |
| 5 | Selecteaza serviciile | interactive | 4 steps |
| 6 | Alege data si ora | interactive | 4 steps |
| 7 | Confirma programarea | interactive | 3 steps |
| 8 | Gestioneaza programarile | text | 60s |

### Chapter 2: Shop
| # | Lesson | Type | Est. |
|---|--------|------|------|
| 1 | Rasfoieste catalogul | text | 60s |
| 2 | Cauta si filtreaza produse | interactive | 4 steps |
| 3 | Detaliile unui produs | interactive | 3 steps |
| 4 | Cosul de cumparaturi | interactive | 4 steps |
| 5 | Finalizeaza comanda | interactive | 5 steps |
| 6 | Urmareste comenzile | text | 45s |

### Chapter 3: Feed Social
| # | Lesson | Type | Est. |
|---|--------|------|------|
| 1 | Feed-ul tau | text | 60s |
| 2 | Like, comenteaza si reactioneaza | interactive | 4 steps |
| 3 | Stories — cum functioneaza | interactive | 3 steps |
| 4 | Urmareste un live | interactive | 4 steps |
| 5 | Foloseste filtrele si sortarea | interactive | 3 steps |

**Total: 4 chapters, 22 lessons, ~12 min content**

## Interactive Walkthrough System

### Architecture

Custom overlay built with existing deps (Reanimated 4 + react-native-svg + Gesture Handler).

#### Components:

1. **TutorialProvider** — Context wrapper at app root
   - Holds registry of measurable refs via `registerRef(key, ref)`
   - Provides `measureElement(key)` using `measureInWindow()` (New Arch safe)
   - Wraps children, renders TutorialOverlay on top

2. **TutorialOverlay** — Full-screen SVG overlay
   - `<Svg>` fills screen with semi-transparent rect
   - `<Mask>` with rounded rect cutout at target element bounds
   - Spotlight bounds animated via Reanimated 4 shared values (x, y, w, h)
   - Morphing animation between steps: spring damping 18, stiffness 200
   - Padding around target: 8px
   - Tap on dim area = no-op (prevents accidental dismissal)

3. **TutorialTooltip** — Glassmorphic card
   - Position: auto (above or below spotlight based on available space)
   - Background: BlurView (intensity 60) + rgba(255,255,255,0.85) on iOS, solid white on Android
   - Border: 1px rgba(255,255,255,0.6)
   - Border radius: Bubble.radii (25/12/25/25)
   - Shadow: Shadows.md
   - Content:
     - Step title (EuclidCircularA-SemiBold, 16px, #1E293B)
     - Step description (EuclidCircularA-Regular, 14px, #64748B)
     - Bottom row: progress dots (left) + buttons (right)
   - Progress dots: filled = completed, outlined = current, empty = upcoming
   - Buttons: "Sari peste" (skip, text only) + "Urmatorul" (next, primary pill)
   - Last step button: "Gata!" (complete, primary pill with checkmark)

4. **useTutorial hook** — Public API
   ```typescript
   interface UseTutorialReturn {
     isActive: boolean;
     currentStep: number;
     totalSteps: number;
     start: (lessonId: string) => void;
     next: () => void;
     skip: () => void;
     complete: () => void;
     hasCompleted: (lessonId: string) => boolean;
     progress: number; // 0-100, overall
     chapterProgress: (chapterId: string) => number;
   }
   ```

5. **tutorialStore** (Zustand + AsyncStorage persist)
   ```typescript
   interface TutorialState {
     completedLessons: string[];       // persisted
     currentLessonId: string | null;
     currentStepIndex: number;
     isOverlayVisible: boolean;
     // Actions
     startLesson: (lessonId: string) => void;
     completeStep: () => void;
     completeLesson: (lessonId: string) => void;
     skipLesson: () => void;
     resetAll: () => void;
   }
   ```

### Walkthrough Flow

1. User taps interactive lesson in tutorial chapter page
2. `useTutorial().start(lessonId)` called
3. Store sets `currentLessonId`, `currentStepIndex = 0`, `isOverlayVisible = true`
4. TutorialProvider reads step definition → navigates to `targetScreen` if needed
5. After navigation settles (500ms delay), measures `targetRef` element
6. Overlay appears with FadeIn (300ms), spotlight morphs to element bounds
7. Tooltip appears with FadeInDown spring
8. User taps "Urmatorul" → `next()` → step index increments → spotlight morphs to next element
9. If next step is on different screen → navigate first, then measure + show
10. On last step → "Gata!" button → `complete()` → lesson marked done → overlay dismisses
11. "Sari peste" at any point → `skip()` → overlay dismisses, lesson NOT marked complete

## Tutorial Pages (UI)

### Main Tutorials Page (`app/tutorials.tsx`)

Replaces `/courses` route from profile menu.

**Layout:**
- Header: back button + "Tutoriale" title
- Hero progress card (gradient bg, overall progress bar, "Continua" CTA)
- "Continua" section (horizontal FeaturedCards, only if in-progress chapters exist)
- Chapter list (vertical ChapterCards)

**Hero Progress Card:**
- Background: LinearGradient (primary colors)
- White text: "Progresul tau"
- Progress bar: white track, emerald fill, percentage text
- Subtitle: "X din 22 lectii completate"
- CTA button: "Continua de unde ai ramas" → navigates to first incomplete lesson

**ChapterCard:**
- Reuses CourseListCard pattern from courses.tsx
- Left: Icon in colored circle (64x64)
  - Ch0: rocket (purple #8B5CF6)
  - Ch1: map (primary #0A66C2)
  - Ch2: bag (indigo #6366F1)
  - Ch3: chatbubbles (green #16A34A)
- Center: Title, lesson count + est. time, progress bar
- Right: chevron-forward
- Tap → `/tutorial/[chapterId]`

### Chapter Detail Page (`app/tutorial/[id].tsx`)

Reuses `course/[id].tsx` layout pattern.

**Layout:**
- Header with chapter icon (large, centered) on colored background
- Chapter title + description
- Progress card (if started)
- Lesson list:
  - Each lesson: number indicator + title + type badge + status
  - Type badge: "Citeste" (blue book icon) for text, "Interactiv" (orange hand icon) for interactive
  - Status: green checkmark (done), gray circle (not done)
  - Tap text lesson → `/tutorial-lesson/[lessonId]`
  - Tap interactive lesson → launches walkthrough overlay

### Text Lesson Page (`app/tutorial-lesson/[id].tsx`)

Reuses `lesson/[id].tsx` layout without video player.

**Layout:**
- Header with back + chapter name + completion badge
- Lesson title (20px bold)
- Content area: formatted text with sections, bullet points, tips
- Bottom bar: "Marcheaza ca finalizat" + "Lectia urmatoare"

## Data Layer

### Static Data File (`data/tutorials.ts`)

All tutorial content defined as TypeScript constants:

```typescript
interface TutorialStep {
  targetScreen: string;        // route to navigate to
  targetRefKey: string;        // ref key registered in TutorialProvider
  title: string;               // tooltip title
  description: string;         // tooltip description
  position: 'top' | 'bottom'; // tooltip preferred position
}

interface TutorialLesson {
  id: string;
  title: string;
  type: 'text' | 'interactive';
  durationSec: number;
  content?: string;            // markdown-like text for text lessons
  steps?: TutorialStep[];      // walkthrough steps for interactive lessons
}

interface TutorialChapter {
  id: string;
  title: string;
  description: string;
  icon: string;                // Ionicons name
  iconColor: string;
  iconBgColor: string;
  lessons: TutorialLesson[];
}
```

### Ref Registration

Screens with interactive tutorial targets register refs:

```typescript
// In any screen component:
const { registerRef } = useTutorialContext();
const filterRef = useRef(null);

useEffect(() => {
  registerRef('discover-filter-available', filterRef);
}, []);

// JSX:
<Pressable ref={filterRef} ...>
```

## File Changes

### New Files (12)

| File | Purpose |
|------|---------|
| `data/tutorials.ts` | 4 chapters, 22 lessons, all step definitions |
| `stores/tutorialStore.ts` | Zustand store with AsyncStorage persist |
| `hooks/useTutorial.ts` | Public hook API |
| `components/tutorial/TutorialProvider.tsx` | Context + ref registry + overlay rendering |
| `components/tutorial/TutorialOverlay.tsx` | SVG spotlight overlay with animations |
| `components/tutorial/TutorialTooltip.tsx` | Glassmorphic tooltip card |
| `components/tutorial/TutorialProgress.tsx` | Hero progress card for tutorials page |
| `components/tutorial/ChapterCard.tsx` | Chapter list card |
| `components/tutorial/LessonCard.tsx` | Lesson list item with type badge |
| `app/tutorials.tsx` | Main tutorials listing page |
| `app/tutorial/[id].tsx` | Chapter detail page |
| `app/tutorial-lesson/[id].tsx` | Text lesson page |

### Modified Files (3)

| File | Change |
|------|--------|
| `app/(tabs)/profile.tsx` | Menu route: `/courses` → `/tutorials` |
| `app/_layout.tsx` | Add routes: `tutorials`, `tutorial/[id]`, `tutorial-lesson/[id]` |
| `app/_layout.tsx` | Wrap root with TutorialProvider |

### NOT Modified

- Existing courses system (courses.tsx, course/[id].tsx, lesson/[id].tsx) — stays intact
- Database schema — no migrations
- No existing components modified
