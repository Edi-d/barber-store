# Video Playback in Feed — Implementation Plan

**Date:** 2026-03-30
**Scope:** Client-only consumer app (users watch, never upload)
**Target file:** `components/feed/FeedCard.tsx` (596 lines)
**Feed host:** `app/(tabs)/feed.tsx` — FlatList with `renderItem`

---

## 1. Which Video Library to Use

**Decision: `expo-av` (`Video` component), NOT `expo-video`**

Rationale:

- `expo-video` is **not installed**. The package.json lists `expo-av ~16.0.8` and that is what is present in `node_modules`. Adding `expo-video` would require `npx expo install expo-video`, a new native build, and potential conflicts with the existing `expo-av` Audio usage elsewhere in the app.
- `expo-av`'s `Video` component (class-based, ref-driven) exposes `setStatusAsync`, `loadAsync`, and `unloadAsync` — everything needed for programmatic play/pause/mute.
- `expo-av` has been stable on Expo SDK 54 / React Native 0.81. Using the library already in the dependency graph avoids install risk before a native rebuild.
- If the team upgrades to `expo-video` later, the `VideoPlayer` component in the new file is isolated enough to swap without touching FeedCard's logic.

**Import pattern:**
```ts
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
```

---

## 2. Auto-Play on Scroll — Visibility Detection

The feed uses a plain `FlatList` with no current `viewabilityConfig`. The approach is:

### 2a. FlatList viewability config (in `feed.tsx`)

Add a `viewabilityConfig` and `onViewableItemsChanged` callback to the FlatList. FlatList accepts `viewabilityConfigCallbackPairs` which allows multiple configs simultaneously without the re-render stability constraint.

```
viewabilityConfig:
  itemVisiblePercentThreshold: 60   // item must be 60% on screen to be "visible"
  minimumViewTime: 300              // must stay visible 300ms (prevents flicker on fast scroll)
```

`onViewableItemsChanged` receives the list of currently visible items. Extract the `item.id` of the first visible video-type item. Store this as `activeVideoId` in a `useRef` (not state — no re-render needed, just passed down as a prop).

### 2b. Passing active state down

Add a prop to `FeedCard`:

```ts
isActiveVideo?: boolean   // true when this card holds the currently visible video
```

`FeedCard` uses this prop to imperatively call `videoRef.current?.setStatusAsync({ shouldPlay: isActiveVideo })` inside a `useEffect`.

### 2c. Why not a Zustand store for active video ID

A global store would cause every mounted FeedCard to re-render whenever any card becomes active. A ref in the feed + a prop keeps re-renders surgical: only the card transitioning in/out of active state re-renders.

---

## 3. Mute/Unmute UX

### Default state
All videos start **muted**. This follows the platform norm (TikTok, Instagram Reels, Twitter) and avoids unexpected audio blast when scrolling.

### Toggle mechanic
A persistent mute button is overlaid on the video in the bottom-right corner of the media area. It is always visible while the video is playing (not hidden on tap-to-pause).

- Tap mute icon → unmute (audio on)
- Tap again → mute
- Scrolling away from the card resets to muted on next appearance

### Global mute memory
Store the mute preference in a `useRef` at the feed level (same scope as `activeVideoId`). When a new card becomes active, it inherits the current mute preference. This matches Instagram's behavior: if you unmuted one video, the next one starts unmuted too.

Pass this as two props to FeedCard:
```ts
isMuted: boolean
onMuteToggle: () => void
```

### Icon
Use `Ionicons` (already imported): `volume-mute` / `volume-medium`. Background: a semi-transparent dark pill, consistent with the existing `BlurView` card aesthetic.

---

## 4. Thumbnail-First Approach

### Sequence

1. Card renders with `<Image>` showing `thumb_url` (same as today's image path, already working).
2. When `isActiveVideo` becomes `true`, the `VideoPlayer` sub-component mounts and calls `loadAsync`.
3. While loading (`isLoaded === false` in `AVPlaybackStatus`), the thumbnail stays visible underneath via `position: absolute`.
4. Once `isLoaded === true` AND `positionMillis > 0` (first frame decoded), the thumbnail fades out (Reanimated `withTiming` opacity 1 → 0, 200ms).
5. The Video component sits below the thumbnail in the z-stack. The fade-out reveals it cleanly with no black flash.

### Why not load eagerly
Loading video eagerly for all cards wastes bandwidth and memory. A 4K phone with 20 feed items would simultaneously hold up to 20 video decoders. Load only on demand.

### Fallback
If `media_url` is null or loading fails (network error, unsupported codec), keep showing `thumb_url` as a static image. The `onError` callback on the Video component handles this by setting a local `hasError` state that forces thumbnail visibility back to 1.

---

## 5. Performance Considerations

### Only one video plays at a time

The `activeVideoId` ref ensures FlatList's `onViewableItemsChanged` callback only ever promotes one item. When a card receives `isActiveVideo: false`, its `useEffect` immediately calls:
```ts
videoRef.current?.setStatusAsync({ shouldPlay: false })
```

### Unload off-screen videos

FlatList recycles cells. When a video card scrolls far enough off screen to be unmounted by the virtualizer, `componentWillUnmount` / the component's cleanup `useEffect` calls `videoRef.current?.unloadAsync()`. This releases the native decoder and memory.

A safe threshold: unload when the item is more than ~3 pages away from viewport. FlatList handles this naturally via `windowSize` prop. Set `windowSize={5}` (default is 21) on the FlatList to keep only 2.5 screens of cells mounted above and below.

### Avoid re-renders from status callbacks

`onPlaybackStatusUpdate` fires 4 times/second during playback. Do NOT store playback status in React state. Use a ref for position tracking if needed. Only update state for discrete events: `didJustFinish`, `isLoaded`, `isBuffering`.

### Loop behavior

Videos loop silently. On `AVPlaybackStatus.didJustFinish`, call `setStatusAsync({ shouldPlay: true, positionMillis: 0 })`. No visible restart gap if the video is already buffered.

### Memory pressure

On iOS, `AVPlayer` instances consume significant memory. Cap concurrent `Video` component instances by ensuring `windowSize={5}` on the FlatList. On Android, expo-av uses ExoPlayer, which is more forgiving but benefits from the same cap.

---

## 6. Changes Needed to FeedCard.tsx

### New props

```ts
interface FeedCardProps {
  // ... existing props unchanged ...
  isActiveVideo?: boolean   // controls play/pause
  isMuted?: boolean         // current global mute state
  onMuteToggle?: () => void // bubble mute toggle up to feed
}
```

### Media area refactor (lines 303–323)

The current block renders a single `<Image>` for all content types. Replace with a conditional:

- `item.type === 'video'` → render `<VideoPlayer>` (new sub-component, see section 7)
- everything else → render existing `<Image>` with double-tap handler unchanged

The `TapGestureHandler` double-tap wraps both branches identically, so the like gesture continues working on video cards.

### No changes to

- Like animation system (all shared values, particle burst, double-tap)
- Author row, caption, stats row, actions row
- StyleSheet (keep as-is — video area reuses `postImageWrap` and `postImage` styles)
- Import list only gains `{ Video, ResizeMode, AVPlaybackStatus }` from `expo-av`

---

## 7. New Components

### `components/feed/VideoPlayer.tsx`

A focused, self-contained component. FeedCard imports and renders it.

**Responsibilities:**
- Mounts/unmounts the `expo-av Video` component
- Manages thumbnail visibility (opacity animated value)
- Handles load, buffer, error, and loop states
- Renders the mute toggle button overlay
- Renders a buffering spinner (small `ActivityIndicator` centered, visible while `isBuffering`)

**Props:**
```ts
interface VideoPlayerProps {
  mediaUrl: string
  thumbUrl: string | null
  isActive: boolean         // play when true, pause when false
  isMuted: boolean
  onMuteToggle: () => void
  style?: ViewStyle
}
```

**Internal state (keep minimal):**
```ts
const isLoaded = useRef(false)         // avoid state-triggered re-renders
const [showThumbnail, setShowThumbnail] = useState(true)
const [hasError, setHasError] = useState(false)
const [isBuffering, setIsBuffering] = useState(false)
const thumbOpacity = useSharedValue(1) // Reanimated for smooth fade
```

**Play/pause effect:**
```ts
useEffect(() => {
  if (!videoRef.current || !isLoaded.current) return
  videoRef.current.setStatusAsync({
    shouldPlay: isActive,
    isMuted,
  })
}, [isActive, isMuted])
```

**Load effect:**
```ts
useEffect(() => {
  if (isActive) {
    videoRef.current?.loadAsync({ uri: mediaUrl }, { shouldPlay: true, isMuted }, false)
  }
  return () => {
    videoRef.current?.unloadAsync()
    isLoaded.current = false
    setShowThumbnail(true)
    thumbOpacity.value = 1
  }
}, [isActive])   // only re-run when active state changes
```

**Playback status handler:**
```ts
const handleStatus = useCallback((status: AVPlaybackStatus) => {
  if (!status.isLoaded) {
    if (status.error) setHasError(true)
    return
  }
  if (!isLoaded.current && status.isLoaded) {
    isLoaded.current = true
  }
  setIsBuffering(status.isBuffering)
  // Fade out thumbnail once first frame decoded
  if (showThumbnail && status.positionMillis > 0) {
    thumbOpacity.value = withTiming(0, { duration: 200 })
    setShowThumbnail(false)
  }
  // Loop
  if (status.didJustFinish) {
    videoRef.current?.setStatusAsync({ shouldPlay: true, positionMillis: 0 })
  }
}, [showThumbnail])
```

### No other new files needed

The mute state and active video ID tracking live in `feed.tsx` as refs. No new hook, no new store. The `VideoPlayer` component is the only new file.

---

## 8. Changes to `feed.tsx`

1. Add `viewabilityConfigCallbackPairs` ref to FlatList (stable ref, not inline — FlatList requires this to be stable across renders).
2. Add `activeVideoId` ref (`useRef<string | null>(null)`).
3. Add `isMuted` state (`useState(true)` — starts muted).
4. Add `handleMuteToggle` callback that flips `isMuted` state.
5. Set `windowSize={5}` on FlatList.
6. Pass `isActiveVideo`, `isMuted`, `onMuteToggle` into each `FeedCard` in `renderItem`.

The `onViewableItemsChanged` callback is defined with `useCallback` and wrapped in a stable ref to satisfy FlatList's requirement that viewability callbacks not change identity between renders.

---

## 9. What This Plan Does Not Include

- **Progress bar / scrubbing** — out of scope for feed videos; appropriate for a full-screen player view
- **Picture-in-picture** — iOS 16+ feature, separate scope
- **Download / save video** — client-only consumption pattern, no save to camera roll
- **Captions/subtitles** — no `textTracks` support in expo-av on RN
- **Fullscreen tap** — double-tap is reserved for like; single-tap on video could be wired to fullscreen later but is not planned here

---

## 10. Implementation Order

1. Create `components/feed/VideoPlayer.tsx` (self-contained, testable in isolation)
2. Modify `FeedCard.tsx` — add three props, replace media area conditional, wire VideoPlayer
3. Modify `feed.tsx` — add viewability infrastructure, pass new props into renderItem
4. Smoke test: one video card plays, pauses on scroll, mute toggle works, loops correctly
5. Stress test: fast scroll through 20 video cards, verify no multiple simultaneous audio sources
