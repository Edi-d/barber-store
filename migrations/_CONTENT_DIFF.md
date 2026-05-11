# Migration Content Diff: Tapzi-barber vs barber-store
Generated: 2026-05-11
Method: `comm -12` + `diff` byte-by-byte + MD5 checksum verification

---

## Overview

| Metric | Value |
|---|---|
| Files in Tapzi-barber/migrations | 152 |
| Files in barber-store/migrations | 69 |
| Files with identical names (compared) | 23 |
| IDENTICAL (byte-for-byte) | 22 |
| TRIVIAL (whitespace/comment only) | 0 |
| SUBSTANTIVE (meaningful diff) | 1 |

---

## Common Files — Full Status Table

| # | Filename | Status | Notes |
|---|---|---|---|
| 1 | `001_initial_schema.sql` | IDENTICAL | MD5 verified |
| 2 | `002_storage_buckets.sql` | IDENTICAL | MD5 verified |
| 3 | `003_seed_data.sql` | IDENTICAL | MD5 verified |
| 4 | `004_appointments.sql` | IDENTICAL | MD5 verified |
| 5 | `006_barber_availability.sql` | IDENTICAL | MD5 verified |
| 6 | `007_follows.sql` | IDENTICAL | MD5 verified |
| 7 | `008_discover_schema.sql` | IDENTICAL | MD5 verified |
| 8 | `010_unified_salon_system.sql` | IDENTICAL | MD5 verified |
| 9 | `011_fix_trigger_and_fallback.sql` | IDENTICAL | MD5 verified |
| 10 | `012_profile_update_policy.sql` | IDENTICAL | MD5 verified |
| 11 | `013_comments_rls.sql` | IDENTICAL | MD5 verified |
| 12 | `014_salon_type.sql` | IDENTICAL | MD5 verified |
| 13 | `015_denormalize_counts.sql` | IDENTICAL | MD5 verified |
| 14 | `016_comment_threading.sql` | IDENTICAL | MD5 verified |
| 15 | `017_security_fixes.sql` | IDENTICAL | MD5 verified |
| 16 | `018_employee_analytics.sql` | IDENTICAL | MD5 verified |
| 17 | `019_services_coafor.sql` | IDENTICAL | MD5 verified |
| 18 | `021_product_analytics.sql` | IDENTICAL | MD5 verified |
| 19 | `022_salon_media.sql` | IDENTICAL | MD5 verified |
| 20 | `023_salon_types_array.sql` | IDENTICAL | MD5 verified |
| 21 | `024_reviews_enhanced.sql` | IDENTICAL | MD5 verified |
| 22 | `cleanup_test_accounts.sql` | IDENTICAL | MD5 verified |
| 23 | `seed_all_data.sql` | **SUBSTANTIVE** | See detail below |

---

## Substantive Difference: `seed_all_data.sql`

**Tapzi-barber version:** 494 lines | Last commit: `223e6c7` @ 2026-03-14
**barber-store version:** 482 lines | Last commit: `d484026` @ 2026-04-12

**Diff (abridged):**

```diff
- -- 10. LIVE STREAMS (6)
+ -- 10. LIVE STREAMS — no seed data

- INSERT INTO lives (id, host_id, title, cover_url, is_public, status, viewers_count, started_at) VALUES
- ('cc111111-...', ..., 'Join me, paint the arts', ..., 'live', 41600, NOW() - INTERVAL '5 minutes'),
- ('cc222222-...', ..., 'Live Session, Let''s learn together', ..., 'live', 21200, ...),
- ('cc333333-...', ..., 'Fade Masterclass - Live Demo', ..., 'live', 15800, ...),
- ('cc444444-...', ..., 'Beard Styling Session', ..., 'live', 8900, ...),
- ('cc555555-...', ..., 'Q&A - Cum sa-ti deschizi un salon', ..., 'live', 5400, ...),
- ('cc666666-...', ..., 'Classic Cuts Workshop', ..., 'live', 3200, ...)
- ON CONFLICT (id) DO UPDATE SET ...;
+ -- Lives are created on-demand by real users. No seed entries.
```

**Summary:** Tapzi-barber seeds 6 fake live streams into the `lives` table. barber-store removes them entirely and comments that lives are created on-demand by real users.

**Canonical/newer version:** barber-store — confirmed by commit date (2026-04-12 vs 2026-03-14) and by the deliberate removal rationale in the comment. The barber-store version reflects the decision to not mock live stream data, consistent with its later `feat(lives)` commits.

**Confidence:** High

**Change classification:** Incremental polish / intentional cleanup — not a breaking schema change. The `lives` table structure is unaffected; only seed data rows differ.

---

## Files Unique to Tapzi-barber (not in barber-store) — 129 files

These are migrations that exist ONLY in Tapzi-barber and have no counterpart in barber-store by filename. They were NOT compared (out of scope for this task).

Notable named ranges:
- `005_live_seed_data.sql` — early lives seed file
- `008_profiles_rls_and_trigger.sql`, `009_onboarding_salons.sql`
- `020_reports_insights.sql`, `025_appointment_booking_fix.sql`
- `026_social_completion.sql` through `043_social_fixes.sql`
- `044_comment_reactions.sql` through `055_loyalty_rewards.sql`
- Various consumables/loyalty migrations (046–055)

---

## Files Unique to barber-store (not in Tapzi-barber) — 46 files

These exist ONLY in barber-store:
- `009.sql`, `025_review_photos.sql`
- `035_realtime_publication.sql`, `036_stories_storage_and_cleanup.sql`, `037_stories_storage_path.sql`
- `051_notifications_realtime.sql`, `052_comments_social_realtime.sql`
- `054_profiles_rls_and_trigger.sql`, `055_onboarding_salons.sql`, `056_salon_services.sql`
- `057_reports_insights.sql` through `067_realtime_comment_reactions.sql`
- `062_support_tickets.sql`, `066_hashtag_triggers.sql`

barber-store's unique migrations are shifted to higher numbers vs Tapzi-barber, suggesting the two repos diverged and renumbered independently.

---

## Special Focus Files — Critical Migrations

All requested critical files are IDENTICAL between repos:

| File | Status | Notes |
|---|---|---|
| `001_initial_schema.sql` | IDENTICAL | Core schema — both repos share exact same foundation |
| `002_storage_buckets.sql` | IDENTICAL | Storage policies — no divergence |
| `003_seed_data.sql` | IDENTICAL | Base seed — no divergence |
| `008_discover_schema.sql` | IDENTICAL | Discover feature schema — no divergence |
| `010_unified_salon_system.sql` | IDENTICAL | Unified salon — no divergence |
| `017_security_fixes.sql` | IDENTICAL | Security patches — no divergence |

No files with `_fix_` or `_security_` in the name differ between repos.

---

## Summary Conclusion

The two repos share a **byte-for-byte identical schema foundation** across all 23 overlapping migration files, with a single cosmetic seed-data difference in `seed_all_data.sql`. The divergence between the repos is entirely in their **non-overlapping files** (129 unique to Tapzi-barber, 46 unique to barber-store), which suggests they branched from the same origin point at migration ~024 and evolved independently with different feature sets and renumbering schemes.
