# Roadmap: Tapzi — Social Media Features

## Overview

This milestone connects real infrastructure to the existing UI shells in both barber-store (client app) and tapzi-barber (barber app). The work proceeds in strict dependency order: first stand up the accounts and build pipeline that gate everything else, then wire Supabase Realtime to the existing feed, then build stories (no native modules required), and finally integrate LiveKit live streaming (requires dev build). By the end, clients can follow their barbers in real time — watching live cuts, tapping through stories, and seeing a feed that updates without refreshing.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Infrastructure Setup** - Activate Supabase Pro, LiveKit Cloud, and EAS dev build pipeline before any feature work starts
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
- [x] 01-01-PLAN.md — Supabase Pro upgrade and Realtime validation
- [x] 01-02-PLAN.md — LiveKit Cloud account setup and credential storage
- [x] 01-03-PLAN.md — EAS dev build configuration for both apps (EAS build skipped; packages/plugins installed)

### Phase 2: Realtime Feed
**Goal**: Clients see a live feed — new posts, like counts, and comment counts update automatically so the home screen feels alive without any manual refresh
**Depends on**: Phase 1
**Requirements**: RT-01, RT-02, RT-03, RT-04
**Success Criteria** (what must be TRUE):
  1. When any user likes a post, the like count updates on every viewer's screen within 2 seconds without a manual refresh
  2. When a new post is published, a "N new posts — tap to see" banner appears on the feed screen
  3. After signing out, no Realtime subscription activity appears in Supabase logs for the signed-out session
  4. A global subscription registry in `lib/realtime.ts` manages all channels, and `signOut()` calls cleanup on every open channel
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Realtime infrastructure: channel registry, signOut cleanup, publication migration
- [x] 02-02-PLAN.md — Feed realtime hooks: useRealtimeFeed, useRealtimeLikes, useRealtimeComments wired to React Query cache
- [x] 02-03-PLAN.md — New posts banner: animated "N new posts" banner UI on feed screen

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
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — Database schema extension (storage_path column) and pg_cron expiry cleanup job
- [x] 03-02-PLAN.md — Story creation on tapzi-barber: photo + video with TUS resumable upload
- [x] 03-03-PLAN.md — Full-screen stories viewer on barber-store with Reanimated progress bar, gestures, video
- [ ] 03-04-PLAN.md — Stories row wired to real data with seen/unseen ring state and viewer integration

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
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — LiveKit token Edge Function + lib/livekit.ts helper + registerGlobals + DB type alignment
- [x] 04-02-PLAN.md — Barber broadcast screen in tapzi-barber with camera preview, mute, flip, end
- [x] 04-03-PLAN.md — Client viewer screen with full-screen video, chat overlay, viewer count badge
- [ ] 04-04-PLAN.md — Live discovery wiring: LiveSection + useRealtimeLives hook on home screen

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Setup | 3/3 | Complete | 2026-03-17 |
| 2. Realtime Feed | 1/3 | In progress | - |
| 3. Stories | 3/4 | In Progress |  |
| 4. Live Streaming | 3/4 | In Progress|  |
