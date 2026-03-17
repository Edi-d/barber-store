# Phase 3: Stories - Context

**Created:** 2026-03-17
**Phase:** Stories creation, viewer, expiry, seen/unseen rings

## Decisions

### Video compression requires dev build -- use expo-image-picker quality setting as fallback
- `react-native-compressor` does NOT work in Expo Go (requires native modules)
- `expo-image-and-video-compressor` also requires dev build
- For Expo Go compatibility: rely on expo-image-picker's `quality` parameter (0.7) and `videoMaxDuration: 30` to keep file sizes manageable
- TUS resumable upload handles unreliable connections regardless of file size
- When dev builds land (Phase 1 INFRA-02), compression can be added as enhancement

### Dual-app story flow
- **tapzi-barber** = story CREATOR (barbers post photo/video stories) -- BARBER-05
- **barber-store** = story VIEWER (clients consume stories) -- STORY-01 through STORY-07
- Both share same Supabase DB, same `stories` table, same Storage bucket
- tapzi-barber already has: `CreateStory` component, `StoryViewer`, `StoryCircles`, `useCreateStory` hook, `useStoryViewer` hook -- all image-only, need video support added

### TUS resumable upload for video stories
- Use `tus-js-client` library directly (not Uppy -- too heavy for mobile)
- Endpoint: `https://{projectId}.storage.supabase.co/storage/v1/upload/resumable`
- 6MB chunks, automatic retry with delays [0, 3000, 5000, 10000, 20000]
- Standard upload OK for images (small files), TUS only needed for video

### Stories expiry via pg_cron SQL function (not Edge Function)
- Simpler approach: pg_cron runs a SQL DELETE directly, no Edge Function needed
- Delete expired stories rows + call storage.delete for the files
- Hourly schedule: `'0 * * * *'`

### Stories viewer architecture
- barber-store builds a NEW full-screen viewer (not port from tapzi-barber)
- tapzi-barber's StoryViewer is image-only, uses setTimeout (not ideal), no video, no swipe between creators
- barber-store viewer: Reanimated + Gesture Handler for progress bar, tap zones, hold-to-pause, swipe between creators
- Use expo-av Video component for video story playback (already in barber-store deps)

## Claude's Discretion

### Story duration constant
- Photo stories: 5 seconds display time (matches tapzi-barber)
- Video stories: play full duration (up to 30s)

### Seen state implementation
- Query approach: LEFT JOIN story_views on fetch to determine seen/unseen per author group
- Cache seen state in React Query -- invalidate on story view insert
- No Realtime subscription for seen state (not worth the complexity)

### Progress bar animation
- Reanimated `withTiming` with `Easing.linear` for smooth progress
- Cancel and restart animation on tap next/prev
- Pause animation on long press using `cancelAnimation` + resume with remaining duration

### Storage path convention
- `stories/{user_id}/{timestamp}.{ext}` -- matches existing tapzi-barber convention

## Deferred Ideas

- Story highlights (STORY-V2-01) -- out of scope
- Story likes/reactions (STORY-V2-02) -- out of scope
- Story replies DM-style (STORY-V2-03) -- out of scope
- Text overlays, stickers, drawing (STORY-V2-04) -- out of scope
- Comments on stories -- explicitly out of scope per REQUIREMENTS.md
