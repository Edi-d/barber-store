# Roadmap: Tapzi — Social Media Features

## Overview

This milestone connects real infrastructure to the existing UI shells in both barber-store (client app) and tapzi-barber (barber app). The work proceeds in strict dependency order: first stand up the accounts and build pipeline that gate everything else, then wire Supabase Realtime to the existing feed, then build stories (no native modules required), and finally integrate LiveKit live streaming (requires dev build). By the end, clients can follow their barbers in real time — watching live cuts, tapping through stories, and seeing a feed that updates without refreshing.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Infrastructure Setup** - Activate Supabase Pro, LiveKit Cloud, and EAS dev build pipeline before any feature work starts
- [ ] **Phase 2: Realtime Feed** - Wire Supabase Realtime to the existing feed so likes, comments, and new posts appear instantly without refresh
- [ ] **Phase 3: Stories** - Build the full stories pillar — creation, viewer with progress bar, 24h expiry, seen/unseen rings — on both apps
- [ ] **Phase 4: Live Streaming** - Integrate LiveKit so barbers can broadcast and clients can watch with live chat and real viewer counts

## Phase Details

### Phase 1: Infrastructure Setup
**Goal**: All external accounts, credentials, and build tooling are in place so feature development can proceed without being blocked on setup
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. Supabase Realtime is active — a test subscription on any table fires events without errors
  2. LiveKit Cloud dashboard shows an active project with API key and secret available
  3. Both barber-store and tapzi-barber have a working EAS dev build profile (`eas.json` with `developmentClient: true`)
  4. A dev build installs and runs on a physical device for both apps
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Supabase Pro upgrade and Realtime validation
- [ ] 01-02-PLAN.md — LiveKit Cloud account setup and credential storage
- [ ] 01-03-PLAN.md — EAS dev build configuration for both apps

### Phase 2: Realtime Feed
**Goal**: Clients see a live feed — new posts, like counts, and comment counts update automatically so the home screen feels alive without any manual refresh
**Depends on**: Phase 1
**Requirements**: RT-01, RT-02, RT-03, RT-04
**Success Criteria** (what must be TRUE):
  1. When any user likes a post, the like count updates on every viewer's screen within 2 seconds without a manual refresh
  2. When a new post is published, a "N new posts — tap to see" banner appears on the feed screen
  3. After signing out, no Realtime subscription activity appears in Supabase logs for the signed-out session
  4. A global subscription registry in `lib/realtime.ts` manages all channels, and `signOut()` calls cleanup on every open channel
**Plans**: TBD

Plans:
- [ ] 02-01: Realtime infrastructure — `lib/realtime.ts` channel factory and subscription registry with logout cleanup
- [ ] 02-02: Feed realtime hooks — `useRealtimeFeed`, `useRealtimeLikes`, `useRealtimeComments` wired to React Query cache
- [ ] 02-03: New posts banner — "N new posts" banner UI on feed screen

### Phase 3: Stories
**Goal**: Barbers can post photo and video stories that clients can tap through with a progress bar, expire after 24 hours, and show an unseen ring on the avatar
**Depends on**: Phase 2
**Requirements**: STORY-01, STORY-02, STORY-03, STORY-04, STORY-05, STORY-06, STORY-07, BARBER-05
**Success Criteria** (what must be TRUE):
  1. A barber can post a photo story from tapzi-barber and it appears in the stories row on barber-store within seconds
  2. A client can tap a story, watch it with a segmented progress bar, tap forward/back through stories, and hold to pause — all within a smooth full-screen viewer
  3. Stories posted more than 24 hours ago do not appear in the stories row and are removed from storage by the hourly cron job
  4. An avatar with an unseen story shows a colored ring; after the client views it the ring disappears
  5. A 30-second video story uploads successfully on a mobile connection without hanging (TUS resumable upload + compression active)
**Plans**: TBD

Plans:
- [ ] 03-01: Database and storage setup — `stories` table, Storage bucket, RLS policies, `expire-stories` Edge Function + pg_cron
- [ ] 03-02: Story creation flows — photo and video capture on tapzi-barber (BARBER-05) with TUS upload and compression
- [ ] 03-03: Stories viewer — full-screen Reanimated progress bar viewer on barber-store with tap, swipe, hold-to-pause
- [ ] 03-04: Stories row and seen state — wire `StoriesRow.tsx` to real data, seen/unseen ring via `story_views` table

### Phase 4: Live Streaming
**Goal**: Barbers can go live with video and audio from tapzi-barber, and clients can watch the stream in real time with live chat and a viewer count that updates as people join and leave
**Depends on**: Phase 3
**Requirements**: LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05, LIVE-06, LIVE-07, BARBER-01, BARBER-02, BARBER-03, BARBER-04
**Success Criteria** (what must be TRUE):
  1. A barber taps "Go Live" in tapzi-barber, grants camera/mic permissions, and their video stream becomes visible to viewers within 5 seconds
  2. A client taps an active live card on the home screen and sees real video — not a placeholder — inside the full-screen viewer
  3. The viewer count badge updates in real time as clients join and leave (Supabase Presence)
  4. A client can type a message in the live chat overlay and it appears for all other viewers immediately (Supabase Broadcast)
  5. The LiveSection on home shows only currently active live streams from the database, not hardcoded placeholder data
**Plans**: TBD

Plans:
- [ ] 04-01: LiveKit token generation — `token-livekit` Supabase Edge Function + `lib/livekit.ts` connection helper
- [ ] 04-02: Barber broadcast screen — go-live setup + live broadcast screen with camera preview, mute, flip, end (BARBER-01, BARBER-02, BARBER-03)
- [ ] 04-03: Client viewer screen — `app/live/[id].tsx` full-screen viewer with VideoView, chat overlay, viewer count badge
- [ ] 04-04: Live discovery wiring — LiveSection and live card data sourced from real DB rows + `useRealtimeLives` hook

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Setup | 1/3 | In Progress|  |
| 2. Realtime Feed | 0/3 | Not started | - |
| 3. Stories | 0/4 | Not started | - |
| 4. Live Streaming | 0/4 | Not started | - |
