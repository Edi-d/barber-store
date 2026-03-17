---
phase: 03-stories
plan: 01
subsystem: database
tags: [postgres, pg_cron, supabase-storage, stories, expiry]

# Dependency graph
requires:
  - phase: 01-infrastructure
    provides: Supabase Pro (pg_cron requires Pro plan)
provides:
  - storage_path column on stories table for reliable cleanup
  - pg_cron hourly job that auto-deletes expired stories and storage files
affects: [03-stories, 04-live-streaming]

# Tech tracking
tech-stack:
  added: [pg_cron]
  patterns: [storage_path column for decoupled storage cleanup, SECURITY DEFINER for storage.objects access]

key-files:
  created:
    - migrations/035_stories_storage_path.sql
    - migrations/036_stories_expiry_cron.sql
  modified: []

key-decisions:
  - "storage_path stores relative bucket path, not full URL -- avoids brittle URL parsing in cleanup"
  - "SECURITY DEFINER on cleanup function to access storage.objects across RLS boundaries"
  - "NULL storage_path rows skip storage delete but still get row-deleted -- safe for legacy data"

patterns-established:
  - "Storage cleanup via dedicated column: store relative path at insert time, use it in cleanup functions"
  - "pg_cron for time-based data lifecycle management"

requirements-completed: [STORY-05]

# Metrics
duration: 4min
completed: 2026-03-17
---

# Phase 3 Plan 1: Stories Schema Extension and Expiry Cleanup Summary

**storage_path column on stories table with pg_cron hourly cleanup job that deletes expired stories and their storage files**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-17T19:15:16Z
- **Completed:** 2026-03-17T19:19:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added storage_path TEXT column to stories table with backfill from existing media_url
- Created cleanup_expired_stories() SECURITY DEFINER function that removes storage objects then story rows
- Scheduled pg_cron job running hourly at minute 0 to auto-expire stories

## Task Commits

Each task was committed atomically:

1. **Task 1: Add storage_path column to stories table** - `a11d005` (feat)
2. **Task 2: Create pg_cron expiry cleanup function and schedule** - `cb0ce3b` (feat)

## Files Created/Modified
- `migrations/035_stories_storage_path.sql` - Adds storage_path TEXT column with backfill from media_url
- `migrations/036_stories_expiry_cron.sql` - pg_cron cleanup function and hourly schedule

## Decisions Made
- storage_path stores relative bucket path (e.g., `{user_id}/{timestamp}.jpg`) rather than full URL -- cleanup function does not need to parse URLs
- SECURITY DEFINER used on cleanup function so it can delete from storage.objects across RLS boundaries
- NULL storage_path rows gracefully skip storage delete but still get row-deleted -- safe for any legacy data without the column populated

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

**Migrations must be run against Supabase.** Run both migration files (035, 036) via Supabase Dashboard SQL editor or `supabase db push`. pg_cron requires Supabase Pro plan (confirmed available from Phase 1).

## Next Phase Readiness
- storage_path column ready for plan 03-02 (story creation will set it explicitly on insert)
- pg_cron job will automatically clean up stories once they start being created
- Stories table now has all columns needed: id, author_id, media_url, type, expires_at, created_at, duration_ms, thumbnail_url, storage_path

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 03-stories*
*Completed: 2026-03-17*
