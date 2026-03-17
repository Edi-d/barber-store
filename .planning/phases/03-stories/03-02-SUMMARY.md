---
phase: 03-stories
plan: 02
subsystem: social
tags: [tus-upload, expo-image-picker, expo-av, video, stories, supabase-storage]

# Dependency graph
requires:
  - phase: 03-stories/01
    provides: "stories table with storage_path, type, duration_ms columns; stories storage bucket"
provides:
  - "pickMedia function for images+videos from gallery"
  - "uploadVideoResumable TUS function with progress and resume"
  - "useCreateStory hook supporting image and video MediaAsset"
  - "CreateStory UI with video preview, VIDEO badge, and upload progress bar"
affects: [03-stories/03, 03-stories/04, 04-live-streaming]

# Tech tracking
tech-stack:
  added: [tus-js-client@4.3.1, expo-av]
  patterns: [TUS resumable upload for large video files, MediaAsset pattern for typed media objects]

key-files:
  modified:
    - /Users/edi/Desktop/tapzi-barber/lib/storage.ts
    - /Users/edi/Desktop/tapzi-barber/hooks/use-stories.ts
    - /Users/edi/Desktop/tapzi-barber/components/social/CreateStory.tsx
    - /Users/edi/Desktop/tapzi-barber/app/(tabs)/social.tsx

key-decisions:
  - "TUS endpoint uses supabase.co domain (not storage.supabase.co) matching Supabase v2 API"
  - "6MB chunk size as Supabase minimum for resumable uploads"
  - "expo-av Video component for video preview in CreateStory"
  - "quality: 0.7 compression as Expo Go fallback for STORY-07"

patterns-established:
  - "MediaAsset type: { uri, type, duration } for typed media passing between picker and uploader"
  - "TUS upload pattern: fetch blob, create Upload with Supabase headers, resume if interrupted"

requirements-completed: [STORY-01, STORY-02, STORY-07, BARBER-05]

# Metrics
duration: 7min
completed: 2026-03-17
---

# Phase 3 Plan 2: Story Creation Summary

**Photo and video story creation with TUS resumable upload, progress indicator, and video preview using expo-av**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-17T19:23:55Z
- **Completed:** 2026-03-17T19:30:35Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Barbers can pick photos or videos (up to 30s) from gallery and publish as stories
- Video uploads use TUS resumable protocol with 6MB chunks, automatic retry, and resume support
- Upload progress bar shown during video upload with percentage indicator
- Stories table rows include type, storage_path, and duration_ms for video stories

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pickMedia and TUS upload to storage.ts** - `d1333c2` (feat)
2. **Task 2: Extend useCreateStory for video and update CreateStory UI** - `1802377` (feat)

## Files Created/Modified
- `lib/storage.ts` - Added pickMedia (images+videos) and uploadVideoResumable (TUS protocol)
- `hooks/use-stories.ts` - Rewritten useCreateStory to accept MediaAsset, video TUS upload with progress
- `components/social/CreateStory.tsx` - Video preview with expo-av, VIDEO badge, upload progress bar
- `app/(tabs)/social.tsx` - Updated caller for new MediaAsset interface and uploadProgress prop

## Decisions Made
- Used `supabase.co` domain for TUS endpoint (not `storage.supabase.co`) matching Supabase v2 API
- 6MB chunk size as Supabase minimum for resumable uploads
- expo-av Video component for video preview (shouldPlay, isLooping, isMuted) in CreateStory
- quality: 0.7 in pickMedia as Expo Go compression fallback (STORY-07 user decision)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated social.tsx caller for new interface**
- **Found during:** Task 2
- **Issue:** Plan specified updating CreateStory and useCreateStory but social.tsx caller still used old interface (string imageUri instead of MediaAsset)
- **Fix:** Updated handleCreateStory to accept asset object, destructured uploadProgress from useCreateStory, passed uploadProgress prop to CreateStory
- **Files modified:** app/(tabs)/social.tsx
- **Committed in:** 1802377 (Task 2 commit)

**2. [Rule 3 - Blocking] Installed expo-av for video preview**
- **Found during:** Task 2
- **Issue:** expo-av was not installed in tapzi-barber (plan assumed it was)
- **Fix:** Ran `npx expo install expo-av`
- **Files modified:** package.json, package-lock.json
- **Committed in:** 1802377 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Story creation flow complete for both photo and video
- Ready for Plan 03-03 (story viewer/playback) and Plan 03-04 (story expiry/cleanup)
- uploadVideoResumable available for any future video upload needs

## Self-Check: PASSED

- [x] lib/storage.ts exists with pickMedia and uploadVideoResumable
- [x] hooks/use-stories.ts exists with MediaAsset-based useCreateStory
- [x] components/social/CreateStory.tsx exists with video support
- [x] app/(tabs)/social.tsx updated for new interface
- [x] Commit d1333c2 verified
- [x] Commit 1802377 verified

---
*Phase: 03-stories*
*Completed: 2026-03-17*
