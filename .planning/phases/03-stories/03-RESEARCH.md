# Phase 3: Stories - Research

**Researched:** 2026-03-17
**Domain:** Stories system (creation, viewing, expiry, seen/unseen) across dual Expo React Native apps + Supabase backend
**Confidence:** HIGH

## Summary

Phase 3 builds a complete Instagram-style stories system across two apps: barbers create stories in tapzi-barber (BARBER-05), clients view them in barber-store (STORY-01 through STORY-07). The database schema already exists (migration 027 creates `stories` + `story_views` tables, migration 034 adds video support columns and Storage bucket). tapzi-barber already has working image-only story creation components (`CreateStory`, `StoryViewer`, `StoryCircles`, `useCreateStory`, `useStoryViewer`).

The critical constraint is **Expo Go compatibility** -- the user tests via Expo Go, which means native video compression libraries (`react-native-compressor`, `expo-image-and-video-compressor`) cannot be used. Video compression must rely on `expo-image-picker`'s built-in quality parameter. TUS resumable upload via `tus-js-client` handles unreliable mobile connections for larger video files. Stories expiry uses `pg_cron` with a direct SQL function (no Edge Function needed). The viewer on barber-store uses Reanimated + Gesture Handler for smooth progress bars and swipe-between-creators navigation.

**Primary recommendation:** Build incrementally -- database/storage first (03-01), then creation flows on tapzi-barber (03-02), then viewer on barber-store (03-03), finally wire StoriesRow to real data (03-04). Keep video compression as a future enhancement when dev builds are available.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Video compression requires dev build -- use expo-image-picker quality setting as fallback for Expo Go
- Dual-app story flow: tapzi-barber = creator, barber-store = viewer
- TUS resumable upload for video stories via tus-js-client
- Stories expiry via pg_cron SQL function (not Edge Function)
- Stories viewer: new build on barber-store using Reanimated + Gesture Handler

### Claude's Discretion
- Story duration: photo 5s, video plays full duration (up to 30s)
- Seen state via LEFT JOIN on fetch, cached in React Query
- Progress bar: Reanimated withTiming + cancelAnimation for pause
- Storage path: `stories/{user_id}/{timestamp}.{ext}`

### Deferred Ideas (OUT OF SCOPE)
- Story highlights (STORY-V2-01)
- Story likes/reactions (STORY-V2-02)
- Story replies DM-style (STORY-V2-03)
- Text overlays, stickers, drawing (STORY-V2-04)
- Comments on stories
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STORY-01 | Barberii pot posta photo stories care apar in stories row | tapzi-barber already has `useCreateStory` hook + `CreateStory` component; barber-store needs StoriesRow wired to real data |
| STORY-02 | Barberii pot posta video stories (max 30s) cu upload resumabil (TUS) | tus-js-client for resumable upload; expo-image-picker with mediaTypes `['videos']` and `videoMaxDuration: 30` |
| STORY-03 | Clientii pot vizualiza stories cu progress bar, tap next/back, hold to pause | Reanimated progress bar + Gesture Handler tap/long-press; expo-av Video for video playback |
| STORY-04 | Stories se grupeaza per creator cu swipe intre creators | Gesture.Fling() horizontal or FlatList with pagingEnabled for creator-level swiping |
| STORY-05 | Stories expira automat dupa 24h (query filter + pg_cron cleanup + storage cleanup) | pg_cron hourly SQL function; query already filters by `expires_at > now()` |
| STORY-06 | Ring colorat pe avatar indica story nevazut vs vazut via story_views table | LEFT JOIN story_views in stories query; conditional ring color in StoriesRow |
| STORY-07 | Video stories sunt comprimate inainte de upload | expo-image-picker quality:0.7 for Expo Go; react-native-compressor for future dev builds |
| BARBER-05 | Story creation -- barberul poate posta photo/video stories din tapzi-barber | Extend existing `CreateStory` + `useCreateStory` to support video; add TUS upload path |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-image-picker | ~17.0.10 | Photo/video selection from gallery | Already installed in both apps; supports mediaTypes array for video |
| expo-av | ~16.0.8 | Video playback in story viewer | Already installed in barber-store; Expo Go compatible |
| tus-js-client | ^4.x | TUS resumable upload protocol | Official recommendation from Supabase docs for files >6MB |
| react-native-reanimated | ~4.1.1 | Progress bar animation, viewer transitions | Already installed; 120fps animations on UI thread |
| react-native-gesture-handler | ~2.28.0 | Tap, long-press, swipe gestures in viewer | Already installed; required for story navigation |
| @supabase/supabase-js | ^2.95.3 | DB queries, standard uploads, auth tokens | Already installed; provides session tokens for TUS auth |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | ^5.90.20 | Stories data fetching + caching | Already in barber-store; cache seen state, prefetch stories |
| expo-haptics | ~15.0.8 | Tactile feedback on story interactions | Already installed; use on story circle tap |

### New Dependencies to Install
| Library | App | Purpose |
|---------|-----|---------|
| tus-js-client | tapzi-barber | TUS resumable video upload to Supabase Storage |

**Note:** `tus-js-client` is only needed in tapzi-barber (creator app). barber-store only views stories, never uploads.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tus-js-client | Standard Supabase upload | Standard upload fails on flaky mobile connections for >6MB videos |
| expo-av Video | expo-video | expo-video (~3.0.16) is in tapzi-barber but NOT in barber-store; expo-av already installed and works in Expo Go |
| pg_cron SQL function | Edge Function via pg_cron | Edge Function adds deployment complexity; SQL DELETE is simpler and faster for this use case |
| New viewer on barber-store | Port tapzi-barber StoryViewer | tapzi-barber viewer is image-only, uses setTimeout, no video, no creator swiping -- rewrite is cleaner |

**Installation:**
```bash
# tapzi-barber only
cd ~/Desktop/tapzi-barber && npm install tus-js-client
```

No new dependencies needed for barber-store.

## Architecture Patterns

### Recommended Project Structure

**barber-store (client viewer):**
```
components/
  stories/
    StoryViewer.tsx        # Full-screen viewer with progress + gestures
    StoryProgressBar.tsx   # Reanimated segmented progress bar
    StoryMedia.tsx         # Image or Video rendering per story
hooks/
  useStories.ts            # Fetch grouped stories with seen state
  useStoryViewer.ts        # Viewer state machine (current index, pause, etc.)
lib/
  stories.ts               # Stories query helpers
```

**tapzi-barber (barber creator):**
```
components/social/
  CreateStory.tsx           # EXISTING -- extend for video
  StoryViewer.tsx           # EXISTING -- already functional for image
  StoryCircles.tsx          # EXISTING -- already functional
hooks/
  use-stories.ts            # EXISTING -- extend useCreateStory for video + TUS
lib/
  storage.ts                # EXISTING -- add TUS upload function
```

**Supabase:**
```
migrations/
  035_stories_expiry_cron.sql   # pg_cron job + cleanup SQL function
```

### Pattern 1: Stories Data Query with Seen State
**What:** Single query fetches active stories grouped by author with seen/unseen status per viewer
**When to use:** StoriesRow data fetching on barber-store

```typescript
// lib/stories.ts
export async function fetchStoriesWithSeenState(viewerId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id, author_id, media_url, type, duration_ms, thumbnail_url, created_at, expires_at,
      author:profiles!author_id(id, display_name, username, avatar_url),
      views:story_views!left(viewer_id)
    `)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  // Group by author, determine seen status
  const authorMap = new Map();
  for (const story of data) {
    const authorId = story.author?.id ?? story.author_id;
    const isSeen = story.views?.some(v => v.viewer_id === viewerId) ?? false;

    if (!authorMap.has(authorId)) {
      authorMap.set(authorId, {
        authorId,
        authorName: story.author?.display_name ?? story.author?.username ?? 'Unknown',
        avatarUrl: story.author?.avatar_url,
        hasUnseen: !isSeen,
        stories: [],
      });
    }

    const group = authorMap.get(authorId);
    group.stories.push({
      id: story.id,
      mediaUrl: story.media_url,
      type: story.type,
      durationMs: story.duration_ms,
      thumbnailUrl: story.thumbnail_url,
      createdAt: story.created_at,
      isSeen,
    });

    if (!isSeen) group.hasUnseen = true;
  }

  // Sort: unseen first, then by most recent story
  return Array.from(authorMap.values())
    .sort((a, b) => (a.hasUnseen === b.hasUnseen ? 0 : a.hasUnseen ? -1 : 1));
}
```

### Pattern 2: TUS Resumable Upload for Video
**What:** Upload video files using TUS protocol for reliability on mobile
**When to use:** Video story creation on tapzi-barber

```typescript
// lib/storage.ts (tapzi-barber) -- add this function
import { Upload } from 'tus-js-client';

export function uploadVideoResumable(
  fileUri: string,
  bucket: string,
  path: string,
  accessToken: string,
  onProgress?: (percentage: number) => void,
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const response = await fetch(fileUri);
    const blob = await response.blob();

    const projectId = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0];

    const upload = new Upload(blob, {
      endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024, // 6MB required by Supabase
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: 'video/mp4',
        cacheControl: '3600',
      },
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve(data.publicUrl);
      },
    });

    // Check for previous uploads to resume
    const previousUploads = await upload.findPreviousUploads();
    if (previousUploads.length) {
      upload.resumeFromPreviousUpload(previousUploads[0]);
    }

    upload.start();
  });
}
```

### Pattern 3: Reanimated Story Progress Bar with Pause
**What:** Smooth progress bar that advances linearly and can be paused/resumed
**When to use:** Story viewer on barber-store

```typescript
// components/stories/StoryProgressBar.tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

function useStoryProgress(duration: number, onComplete: () => void) {
  const progress = useSharedValue(0);
  const isPaused = useSharedValue(false);
  const remainingDuration = useSharedValue(duration);

  const start = () => {
    progress.value = withTiming(1, {
      duration: remainingDuration.value,
      easing: Easing.linear,
    }, (finished) => {
      if (finished) runOnJS(onComplete)();
    });
  };

  const pause = () => {
    isPaused.value = true;
    remainingDuration.value = duration * (1 - progress.value);
    cancelAnimation(progress);
  };

  const resume = () => {
    isPaused.value = false;
    progress.value = withTiming(1, {
      duration: remainingDuration.value,
      easing: Easing.linear,
    }, (finished) => {
      if (finished) runOnJS(onComplete)();
    });
  };

  const reset = (newDuration: number) => {
    cancelAnimation(progress);
    progress.value = 0;
    remainingDuration.value = newDuration;
  };

  return { progress, start, pause, resume, reset };
}
```

### Pattern 4: pg_cron Expiry Cleanup
**What:** Hourly cron job that deletes expired stories and their storage files
**When to use:** Migration 035

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_story RECORD;
BEGIN
  -- Delete expired stories (CASCADE deletes story_views too)
  -- Storage files: delete via storage.objects
  FOR expired_story IN
    SELECT id, author_id, media_url
    FROM stories
    WHERE expires_at <= NOW()
  LOOP
    -- Extract storage path from public URL
    -- Format: .../storage/v1/object/public/stories/{path}
    DELETE FROM storage.objects
    WHERE bucket_id = 'stories'
      AND name = SUBSTRING(expired_story.media_url FROM '.*/stories/(.*)$');
  END LOOP;

  -- Delete the story rows
  DELETE FROM stories WHERE expires_at <= NOW();
END;
$$;

-- Schedule hourly cleanup
SELECT cron.schedule(
  'cleanup-expired-stories',
  '0 * * * *',
  'SELECT cleanup_expired_stories();'
);
```

### Anti-Patterns to Avoid
- **setTimeout for story timing:** Use Reanimated `withTiming` callback instead -- setTimeout drifts and does not integrate with animation cancellation
- **Fetching all story media upfront:** Only load current story + prefetch next one; loading all stories at once wastes bandwidth
- **Standard upload for video:** Files >6MB will fail on spotty mobile connections; always use TUS for video
- **Edge Function for expiry when SQL suffices:** pg_cron can run SQL directly; Edge Function adds deployment overhead for a simple DELETE

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resumable upload | Custom chunking logic | tus-js-client | TUS protocol handles resume, retry, chunk management, fingerprinting |
| Video playback | Custom video component | expo-av `<Video>` | Hardware-accelerated, handles buffering, supports all formats |
| Progress animation | setTimeout + state updates | Reanimated withTiming | Runs on UI thread at 120fps, supports cancel/resume natively |
| Gesture detection | onTouchStart/onTouchEnd | Gesture Handler | Handles gesture state machine, simultaneous gestures, proper hit testing |
| Scheduled cleanup | Manual admin action | pg_cron | Runs automatically, no human intervention, logs execution |
| Seen/unseen state | Separate API call per story | Single query with LEFT JOIN | One roundtrip instead of N; PostgREST supports embedded relations |

## Common Pitfalls

### Pitfall 1: expo-image-picker iOS Permission Dialog on Video
**What goes wrong:** On iOS with `allowsEditing: false` and Passthrough preset, iOS shows a permission dialog AFTER the user selects a video (to access original file)
**Why it happens:** iOS requires explicit media library permission to access the original (uncompressed) file
**How to avoid:** Call `requestMediaLibraryPermissionsAsync()` BEFORE opening the picker
**Warning signs:** Users see two permission dialogs in sequence

### Pitfall 2: TUS Upload Auth Token Expiry
**What goes wrong:** Long video uploads (30s video on slow connection) can outlast the auth token
**Why it happens:** Supabase access tokens expire (default 1 hour, but refresh matters)
**How to avoid:** Get a fresh session token right before starting the upload; TUS URL is valid for 24h but auth header matters per chunk
**Warning signs:** Upload starts fine but fails partway with 401

### Pitfall 3: iOS Returns MOV Instead of MP4
**What goes wrong:** expo-image-picker returns `.mov` files on iOS even when videos are stored as MP4
**Why it happens:** iOS natively uses QuickTime format; the picker returns the native format
**How to avoid:** Accept both `video/mp4` and `video/quicktime` in Storage bucket config (already done in migration 034); set contentType based on actual file extension
**Warning signs:** Upload succeeds but playback fails if MIME type is wrong

### Pitfall 4: Stories Query Returns Stale Data After Viewing
**What goes wrong:** After viewing a story, the ring still shows "unseen" because React Query cache is stale
**Why it happens:** story_views INSERT does not trigger cache invalidation
**How to avoid:** Optimistically update the cache after marking a story viewed (same pattern as likes)
**Warning signs:** User has to pull-to-refresh to see ring change

### Pitfall 5: Story Progress Bar Drift with Multiple Stories
**What goes wrong:** Progress bar for story N plays while story N+1 image is loading
**Why it happens:** Timer starts before media is ready
**How to avoid:** Only start progress animation after `onLoad` (image) or `onReadyForDisplay` (video) fires
**Warning signs:** Progress bar reaches end before media is visible

### Pitfall 6: Storage Cleanup Misses Files
**What goes wrong:** pg_cron deletes story rows but storage files remain as orphans
**Why it happens:** media_url contains the full public URL, not the storage path; string extraction fails
**How to avoid:** Store the storage path in a separate column OR extract path reliably from URL pattern
**Warning signs:** Storage usage grows indefinitely despite story deletion

## Code Examples

### Expo Image Picker for Video Stories (tapzi-barber)
```typescript
// Extend existing pickImage in lib/storage.ts
import * as ImagePicker from 'expo-image-picker';

export async function pickMedia(options?: {
  mediaTypes?: ImagePicker.MediaType[];
  aspect?: [number, number];
  videoMaxDuration?: number;
}): Promise<ImagePicker.ImagePickerAsset | null> {
  // Request permissions first to avoid double-dialog on iOS
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: options?.mediaTypes ?? ['images', 'videos'],
    allowsEditing: false, // Keep false for Passthrough
    quality: 0.7, // Reduces image size
    videoMaxDuration: options?.videoMaxDuration ?? 30,
    // videoExportPreset is deprecated on iOS 14+, rely on quality param
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}
```

### Story Viewer Gesture Setup (barber-store)
```typescript
// Tap left = prev, tap right = next, long press = pause
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');

const tap = Gesture.Tap()
  .onEnd((event) => {
    if (event.x < SCREEN_W / 3) {
      runOnJS(goToPrevStory)();
    } else {
      runOnJS(goToNextStory)();
    }
  });

const longPress = Gesture.LongPress()
  .minDuration(200)
  .onStart(() => {
    runOnJS(pauseStory)();
  })
  .onEnd(() => {
    runOnJS(resumeStory)();
  });

const composed = Gesture.Exclusive(longPress, tap);

// In JSX:
// <GestureDetector gesture={composed}>
//   <Animated.View style={StyleSheet.absoluteFill} />
// </GestureDetector>
```

### Mark Story as Viewed (barber-store)
```typescript
// hooks/useStories.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useMarkStoryViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storyId, viewerId }: { storyId: string; viewerId: string }) => {
      await supabase
        .from('story_views')
        .upsert(
          { story_id: storyId, viewer_id: viewerId },
          { onConflict: 'story_id,viewer_id' }
        );
    },
    onSuccess: () => {
      // Optimistically update stories cache
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
}
```

### Video Playback in Story Viewer (barber-store)
```typescript
// components/stories/StoryMedia.tsx
import { Video, ResizeMode } from 'expo-av';
import { Image } from 'react-native';

type Props = {
  type: 'image' | 'video';
  uri: string;
  isPaused: boolean;
  onLoad: () => void;
  onVideoEnd?: () => void;
};

export function StoryMedia({ type, uri, isPaused, onLoad, onVideoEnd }: Props) {
  if (type === 'video') {
    return (
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay={!isPaused}
        isLooping={false}
        onReadyForDisplay={onLoad}
        onPlaybackStatusUpdate={(status) => {
          if (status.isLoaded && status.didJustFinish) {
            onVideoEnd?.();
          }
        }}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      onLoad={onLoad}
    />
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ImagePicker.MediaTypeOptions enum | mediaTypes array `['images', 'videos']` | Expo SDK 52+ | Old enum deprecated; use string array |
| videoExportPreset on iOS | Deprecated since iOS 14 | 2024 | Rely on quality param + Passthrough default |
| setTimeout for story timing | Reanimated withTiming callback | Reanimated 3+ | More precise, cancellable, runs on UI thread |
| Standard upload for all files | TUS for >6MB, standard for small | Supabase 2023 | Reliability on mobile connections |
| Edge Function for cron tasks | pg_cron direct SQL | Supabase Cron module 2024 | Simpler, no deployment needed |

**Deprecated/outdated:**
- `ImagePicker.MediaTypeOptions.Videos` -- use `['videos']` string array instead
- `videoExportPreset` on iOS -- deprecated since iOS 14, use default Passthrough
- `react-native-compressor` in Expo Go -- requires dev build, not compatible

## Open Questions

1. **Storage path extraction for cleanup**
   - What we know: media_url stores the full public URL (e.g., `https://xxx.supabase.co/storage/v1/object/public/stories/userId/timestamp.jpg`)
   - What's unclear: Whether to store the relative path separately or parse it from URL
   - Recommendation: Add a `storage_path` column to stories table to avoid brittle URL parsing in the cleanup function

2. **Video thumbnail generation**
   - What we know: migration 034 adds `thumbnail_url` column
   - What's unclear: How to generate thumbnails from video -- no Expo Go-compatible solution exists
   - Recommendation: For v1, use the first frame approach: either skip thumbnails (show generic video icon in stories row) or generate server-side via Edge Function

3. **Creator swiping UX on barber-store**
   - What we know: STORY-04 requires swipe between creators
   - What's unclear: Whether to use a horizontal FlatList with pagingEnabled or Gesture.Fling()
   - Recommendation: Use FlatList with `pagingEnabled` and `horizontal` for creator-level navigation (simpler, well-tested on RN), with Gesture Handler only for within-creator interactions

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (no automated test framework detected in project) |
| Config file | none |
| Quick run command | Manual: verify in Expo Go |
| Full suite command | Manual: run through all story scenarios |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STORY-01 | Photo story appears in stories row | smoke | Manual: post from tapzi-barber, check barber-store | N/A |
| STORY-02 | Video story uploads with TUS | smoke | Manual: pick 30s video, verify upload completes | N/A |
| STORY-03 | Viewer with progress, tap, hold | smoke | Manual: tap through stories, hold to pause | N/A |
| STORY-04 | Swipe between creators | smoke | Manual: swipe left/right in viewer | N/A |
| STORY-05 | 24h expiry works | integration | `SELECT * FROM stories WHERE expires_at <= NOW();` after cron run | N/A |
| STORY-06 | Seen/unseen ring | smoke | Manual: view story, verify ring changes | N/A |
| STORY-07 | Video compressed before upload | smoke | Manual: check uploaded file size vs original | N/A |
| BARBER-05 | Create story from tapzi-barber | smoke | Manual: open CreateStory, pick photo/video, publish | N/A |

### Sampling Rate
- **Per task commit:** Manual smoke test of the specific feature
- **Per wave merge:** Run through all story scenarios end-to-end
- **Phase gate:** Full cross-app test (create on tapzi-barber, view on barber-store, verify expiry)

### Wave 0 Gaps
- No automated test infrastructure exists in this project
- All testing is manual via Expo Go on physical devices
- SQL migration testing can be done by running migrations against Supabase and verifying with SQL queries

## Sources

### Primary (HIGH confidence)
- Supabase Resumable Uploads docs: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Supabase Cron docs: https://supabase.com/docs/guides/cron
- Expo ImagePicker docs: https://docs.expo.dev/versions/latest/sdk/imagepicker/
- Existing codebase: migrations/027_social_completion.sql (stories + story_views tables)
- Existing codebase: migrations/034_stories_video_support.sql (video columns + Storage bucket)
- Existing codebase: tapzi-barber components/social/ (CreateStory, StoryViewer, StoryCircles)
- Existing codebase: tapzi-barber hooks/use-stories.ts (useCreateStory, useStoryViewer)

### Secondary (MEDIUM confidence)
- Supabase blog on RN file upload: https://supabase.com/blog/react-native-storage
- React Native Gesture Handler docs: https://docs.swmansion.com/react-native-gesture-handler/
- React Native Reanimated docs: https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/handling-gestures/
- GitHub example: https://github.com/saimon24/react-native-resumable-upload-supabase

### Tertiary (LOW confidence)
- react-native-compressor Expo Go incompatibility: based on GitHub issue #262 and npm docs
- expo-image-and-video-compressor dev build requirement: inferred from npm docs, not explicitly confirmed for SDK 54
- Video thumbnail generation options: no verified approach found for Expo Go

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed or well-documented
- Architecture: HIGH - patterns based on existing codebase conventions + official docs
- Database/Storage: HIGH - schema already exists in migrations
- TUS Upload: HIGH - official Supabase documentation with clear examples
- Video compression: MEDIUM - Expo Go limitation confirmed, fallback approach is pragmatic but not ideal
- Pitfalls: HIGH - based on documented issues (expo-image-picker iOS MOV, permission dialogs)
- Story viewer: MEDIUM - Reanimated/GestureHandler patterns are well-established but specific implementation needs iteration

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable domain, libraries are mature)
