# Migration Merge Notes

## Merge Details

- **Date:** 2026-05-11
- **Source:** `/Users/edi/Desktop/Tapzi-barber/migrations/`
- **Source latest commit:** `3642c6e` — Add story video playback, post video upload, marketplace overhaul, and calendar wizard
- **Files in source before merge:** 152
- **Files in barber-store before merge:** 69
- **Files copied:** 128 SQL/XML files
- **Skipped (directory, not a file):** `euclid-circular-a`
- **Files NOT copied (same-name conflicts):** 0 — no filename collisions existed; cp -n was used throughout
- **barber-store migrations count after merge:** 197

---

## Renumbering Conflicts (same purpose, different number prefix)

These files coexist in barber-store/migrations with the same logical suffix but different sequence numbers. Both files are retained for history. No content was modified.

| Suffix | Files present |
|---|---|
| `lives_table.sql` | `032_lives_table.sql` (Tapzi), `033_lives_table.sql` (barber-store) |
| `multi_service_appointments.sql` | `038_multi_service_appointments.sql` (barber-store), `042_multi_service_appointments.sql` (Tapzi) |
| `add_verified_column.sql` | `034_add_verified_column.sql` (Tapzi), `039_add_verified_column.sql` (barber-store) |
| `advanced_consumable_predictions.sql` | `048_advanced_consumable_predictions.sql` (Tapzi), `051_advanced_consumable_predictions.sql` (Tapzi dup), `061_advanced_consumable_predictions.sql` (barber-store) |
| `appointment_booking_fix.sql` | `025_*` (Tapzi), barber-store variant |
| `comment_likes.sql` | `037_*` (Tapzi), barber-store variant |
| `comment_reactions.sql` | `044_*` (Tapzi), barber-store variant |
| `complete_social_setup.sql` | `045_*` (Tapzi), barber-store variant |
| `consumables.sql` | `046_*` (Tapzi), barber-store variant |
| `fix_consumables_schema.sql` | `046a_*` (Tapzi), barber-store variant |
| `dive_extra_appointments.sql` | `029_*` (Tapzi), barber-store variant |
| `dive_software_salon_seed.sql` | `028_*` (Tapzi), barber-store variant |
| `fix_salon_members_rls_recursion.sql` | `030_*` (Tapzi), barber-store variant |
| `fix_seed_display_names.sql` | `031_*` (Tapzi), barber-store variant |
| `fix_trigger_and_fallback.sql` | `010_*` (Tapzi), barber-store variant |
| `full_text_search.sql` | `035_*` (Tapzi), barber-store variant |
| `hashtags.sql` | `038_*` (Tapzi), barber-store variant |
| `improved_consumable_predictions.sql` | `047_*` (Tapzi), barber-store variant |
| `notify_followers_on_live.sql` | `039_*` (Tapzi), barber-store variant |
| `onboarding_salons.sql` | `009_*` (Tapzi), barber-store variant |
| `per_barber_analytics.sql` | `041_*` (Tapzi), barber-store variant |
| `profiles_rls_and_trigger.sql` | `008_*` (Tapzi), barber-store variant |
| `remove_seed_lives.sql` | `040_*` (Tapzi), barber-store variant |
| `reports_insights.sql` | `020_*` (Tapzi), barber-store variant |
| `salon_services.sql` | `011_*` (Tapzi), barber-store variant |
| `social_completion.sql` | `026_*` (Tapzi), barber-store variant |
| `social_fixes.sql` | `043_*` (Tapzi), barber-store variant |
| `social_seed_data.sql` | `027_*` (Tapzi), barber-store variant |
| `stories_video_support.sql` | `033_*` (Tapzi), barber-store variant |
| `trending_topics.sql` | `036_*` (Tapzi), barber-store variant |

There are also two Tapzi files sharing the same number prefix (both `054_`):
- `054_loyalty_core.sql`
- `054_loyalty_gamification.sql`

Both were copied as-is.

---

## Special / Non-numbered Files Copied

- `ExportPartners.xml` — partner export data file
- `_diag_plan_quotas.sql` — diagnostic query
- `_diagnostic_salon_clients_count.sql` — diagnostic query

---

## Files NOT Copied

None. There were zero same-name collisions between source and destination prior to the merge.

---

## Action Required by Owner

1. **Resolve renumbering conflicts** — For each suffix listed above, compare the Tapzi-numbered and barber-store-numbered variants. Determine if they are identical in intent, a diverged fix, or a duplicate. Remove or consolidate as appropriate.

2. **Validate sequence gaps** — The merged directory now has intentional number gaps (e.g., skips between barber-store-only numbers). Confirm your migration runner tolerates non-contiguous numbering or rename files to fill gaps.

3. **Do NOT apply Tapzi migrations blindly** — Several Tapzi files (especially early numbered ones 005–045) may conflict with already-applied barber-store migrations of the same logical purpose. Run a diff between each renumbering conflict pair before applying.

4. **`ExportPartners.xml`** — Verify this is intentional to keep in the migrations folder or move to a dedicated data/exports directory.

5. **Duplicate `048_` and `054_` prefixes within Tapzi itself** — `048_advanced_consumable_predictions.sql` and `048_consumable_auto_deduction.sql` share prefix `048`. Same for the two `054_` files. These were in Tapzi before the merge; review which was applied in Tapzi's history.
