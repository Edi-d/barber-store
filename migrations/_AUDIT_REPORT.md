# Migration Drift Audit Report

**Generated:** 2026-05-11  
**Source of truth (canonical):** `/Users/edi/Desktop/Tapzi-barber/migrations/` — 140 numbered SQL files + 4 non-numbered  
**Target (ours):** `/Users/edi/Desktop/barber-store/migrations/` — 69 numbered SQL files + 2 non-numbered  

---

## Section 1 — All Files in Tapzi-barber/migrations

| # | Tapzi Filename | Lines | Purpose (first 3 lines) | Exact name in barber-store? |
|---|---------------|-------|------------------------|-----------------------------|
| 1 | 001_initial_schema.sql | 220 | BarberApp - Initial Schema | YES |
| 2 | 002_storage_buckets.sql | 91 | BarberApp - Storage Buckets | YES |
| 3 | 003_seed_data.sql | 273 | BarberApp - Seed Data | YES |
| 4 | 004_appointments.sql | 227 | BarberApp - Appointments System | YES |
| 5 | 005_live_seed_data.sql | 13 | BarberApp - Live Stream Seed Data | NO |
| 6 | 006_barber_availability.sql | 89 | BarberApp - Barber Availability & Location | YES |
| 7 | 007_follows.sql | 45 | BarberApp - Follow System | YES |
| 8 | 008_discover_schema.sql | 385 | BarberApp - Discover / Salon Discovery Schema | YES |
| 9 | 008_profiles_rls_and_trigger.sql | 73 | BarberApp - Profiles RLS & Auto-Create Trigger | NO (renumbered as 054) |
| 10 | 009_onboarding_salons.sql | 158 | BarberApp - Onboarding, Salons & Invites | NO (renumbered as 055) |
| 11 | 010_fix_trigger_and_fallback.sql | 64 | Fix: Re-create trigger + add INSERT policy | NO |
| 12 | 010_unified_salon_system.sql | 500 | Migration 010: Unified Salon System | YES |
| 13 | 011_fix_trigger_and_fallback.sql | 64 | Fix: Re-create trigger + add INSERT policy | YES |
| 14 | 011_salon_services.sql | 135 | BarberApp - Link Services & Barbers to Salons | NO (renumbered as 056) |
| 15 | 012_profile_update_policy.sql | 31 | Add UPDATE policy on profiles | YES |
| 16 | 013_comments_rls.sql | 51 | Enable RLS on comments, likes, and content tables | YES |
| 17 | 014_salon_type.sql | 9 | Add salon_type column to salons table | YES |
| 18 | 015_denormalize_counts.sql | 96 | Migration 015: Denormalize likes_count and comments_count | YES |
| 19 | 016_comment_threading.sql | 32 | Migration 016: Add comment threading and edit tracking | YES |
| 20 | 017_security_fixes.sql | 203 | Migration 017: Critical Security Fixes | YES |
| 21 | 018_employee_analytics.sql | 104 | Migration 018: Employee Analytics Support | YES |
| 22 | 019_services_coafor.sql | 151 | Migration 019: Extend services system for coafor | YES |
| 23 | 020_reports_insights.sql | 781 | Migration 020: Reports & Insights System | NO (renumbered as 057) |
| 24 | 021_product_analytics.sql | 1270 | Migration 021: Product Sales Analytics & Recommendation | YES |
| 25 | 022_salon_media.sql | 134 | Migration 022: Salon Media Storage & RLS | YES |
| 26 | 023_salon_types_array.sql | 19 | Migration 023: salon_type → salon_types (array) | YES |
| 27 | 024_reviews_enhanced.sql | 139 | Migration 024: Enhanced Reviews System | YES |
| 28 | 025_appointment_booking_fix.sql | 104 | Migration 025: Fix appointment booking for salon owners | NO (renumbered as 026) |
| 29 | 026_social_completion.sql | 369 | Migration 026: Social System Completion | NO (renumbered as 027) |
| 30 | 027_social_seed_data.sql | 254 | Migration 027: Social Seed Data | NO (renumbered as 028) |
| 31 | 028_dive_software_salon_seed.sql | 601 | Migration 028: Dive Software Salon — Seed Data | NO (renumbered as 029) |
| 32 | 029_dive_extra_appointments.sql | 456 | Migration 029: Extra Appointments for Dive Software | NO (renumbered as 030) |
| 33 | 030_fix_salon_members_rls_recursion.sql | 29 | Migration 030: Fix infinite recursion in salon_members RLS | NO (renumbered as 031) |
| 34 | 031_fix_seed_display_names.sql | 44 | Migration 031: Fix seed user display names and avatars | NO (renumbered as 032) |
| 35 | 032_lives_table.sql | 27 | Migration 032: Lives Table — Add LiveKit columns | NO (renumbered as 033, CONTENT DIFFERS) |
| 36 | 033_stories_video_support.sql | 25 | Migration 033: Stories Video Support | NO (renumbered as 034) |
| 37 | 034_add_verified_column.sql | 9 | Migration 034: Add Verified Column to Profiles | NO (renumbered as 039) |
| 38 | 035_full_text_search.sql | 44 | Add full-text search with tsvector columns and GIN indexes | NO (renumbered as 040) |
| 39 | 036_trending_topics.sql | 27 | Dynamic trending topics for the social search modal | NO (renumbered as 041) |
| 40 | 037_comment_likes.sql | 13 | Comment likes table | NO (renumbered as 042) |
| 41 | 038_hashtags.sql | 26 | Hashtags system | NO (renumbered as 043) |
| 42 | 039_notify_followers_on_live.sql | 40 | Migration 039: Notify Followers When User Goes Live | NO (renumbered as 044) |
| 43 | 040_remove_seed_lives.sql | 15 | Migration 040: Remove seed live streams | NO (renumbered as 045) |
| 44 | 041_per_barber_analytics.sql | 529 | Migration 041: Per-Barber Analytics | NO (renumbered as 046) |
| 45 | 042_multi_service_appointments.sql | 76 | Migration 042: Multi-Service Appointments (junction table) | NO (renumbered as 038, CONTENT DIFFERS) |
| 46 | 043_social_fixes.sql | 20 | Social fixes: add missing columns & buckets | NO (renumbered as 048) |
| 47 | 044_comment_reactions.sql | 28 | Comment reactions (emoji-based, replaces simple like) | NO (renumbered as 049) |
| 48 | 045_complete_social_setup.sql | 847 | Migration 045: Complete Social Setup (Idempotent) | NO (renumbered as 050) |
| 49 | 046_consumables.sql | 145 | Migration 046: Consumables (Consumabile) | NO (renumbered as 058) |
| 50 | 046a_fix_consumables_schema.sql | 28 | Migration 046a: Fix salon_consumables schema | NO (renumbered as 059) |
| 51 | 047_improved_consumable_predictions.sql | 139 | Migration 047: Improved client-based consumption predictions | NO (renumbered as 060) |
| 52 | 048_advanced_consumable_predictions.sql | 428 | Migration 048: Advanced consumable predictions with statistical forecasting | NO (renumbered as 061, CONTENT DIFFERS) |
| 53 | 048_consumable_auto_deduction.sql | 326 | Migration 048: Consumable Auto-Deduction | NO |
| 54 | 049_atomic_restock_rpc.sql | 127 | Migration 049: Atomic stock RPCs | NO |
| 55 | 050_consumable_data_integrity.sql | 82 | Migration 050: Consumable Data Integrity | NO |
| 56 | 051_advanced_consumable_predictions.sql | 449 | Migration 051: Advanced consumable predictions with EWMA + trend | NO |
| 57 | 052_waste_tracking.sql | 228 | Migration 052: Waste / Loss Tracking | NO |
| 58 | 053_per_barber_consumption.sql | 156 | Migration 053: Per-Barber Consumption Analytics | NO |
| 59 | 054_loyalty_core.sql | 275 | Migration 054: Loyalty Core System | NO |
| 60 | 054_loyalty_gamification.sql | 1336 | Migration 054: Loyalty & Gamification System | NO |
| 61 | 055_loyalty_rewards.sql | 604 | Migration 055: Enhanced Rewards & Redemptions | NO |
| 62 | 056_loyalty_achievements.sql | 454 | Migration 056: Achievements & Challenges | NO |
| 63 | 057_loyalty_referrals.sql | 660 | Migration 057: Referral System | NO |
| 64 | 058_loyalty_streaks_multipliers.sql | 417 | Migration 058: Streaks & Multipliers V2 | NO |
| 65 | 059_loyalty_rpc_core.sql | 1250 | Migration 059: Loyalty Core RPC Functions | NO |
| 66 | 060_loyalty_analytics.sql | 681 | Migration 060: Loyalty Analytics & Personalization | NO |
| 67 | 060_personalization_engine.sql | 1064 | Migration 060: Personalization Engine V1 | NO |
| 68 | 061_loyalty_seasonal_events.sql | 502 | Migration 061: Loyalty Seasonal Events | NO |
| 69 | 062_loyalty_seed_data.sql | 348 | Migration 062: Loyalty System — Seed Data | NO |
| 70 | 063_fix_loyalty_dashboard_vtier.sql | 253 | Migration 063: Fix get_loyalty_dashboard v_tier record not assigned | NO |
| 71 | 065_analytics_dashboard.sql | 515 | Migration 065: Analytics Dashboard RPCs | NO |
| 72 | 066_client_intelligence.sql | 446 | 066 — Client Intelligence RPC functions | NO |
| 73 | 067_financial_analytics.sql | 565 | 067 — Financial Analytics: tables + RPC functions | NO |
| 74 | 068_data_integrity_fixes.sql | 631 | Migration 068: Data Integrity & Security Fixes | NO |
| 75 | 069_post_features.sql | 18 | 069: Add rich post features (tags, location, mood, privacy) | NO |
| 76 | 069_shop_gamification_xp.sql | 686 | Migration 069: Shop Gamification / XP System | NO |
| 77 | 070_xp_reward_from_catalog.sql | 185 | Migration 070: XP Reward from Static JSON Catalog | NO |
| 78 | 071_business_signup_subscriptions.sql | 281 | Tapzi Barber — Business Signup Flow & Subscriptions | NO |
| 79 | 072_seed_plans_and_trial_rpc.sql | 83 | Tapzi Barber — Plans Seed + Trial Activation RPC | NO |
| 80 | 072b_start_salon_trial_rpc.sql | 108 | Tapzi Barber — start_salon_trial RPC | NO |
| 81 | 073_subscription_realtime_and_view.sql | 88 | Migration 073: Enable realtime on subscriptions + view + RPC | NO |
| 82 | 074_salon_setup_dismiss.sql | 122 | Migration 074: Salon setup checklist dismiss | NO |
| 83 | 075_salon_setup_progress_rpc.sql | 149 | Migration 075: Salon setup progress RPC | NO |
| 84 | 076_barber_service_assignments.sql | 69 | Tapzi Barber — Service <-> Staff Assignments (new table) | NO |
| 85 | 077_salon_setup_team_skip.sql | 253 | Tapzi Barber — "Invite team later" skip flag | NO |
| 86 | 078_stripe_integration.sql | 264 | Tapzi Barber — Stripe Integration (incremental) | NO |
| 87 | 079_stripe_seat_price.sql | 16 | Tapzi Barber — Add seat price ID for SALON extra staff | NO |
| 88 | 080_billing_summary_fix.sql | 108 | Tapzi Barber — Fix get_salon_billing_summary heuristic | NO |
| 89 | 081_metered_billing_core.sql | 222 | Metered billing core: usage ledger, rollups, SKU catalog | NO |
| 90 | 082_metered_billing_rpcs.sql | 538 | Migration 082: Metered Billing RPCs (reserve/confirm pattern) | NO |
| 91 | 083_delivery_webhooks.sql | 113 | Tapzi Barber — SMS / Email delivery webhooks | NO |
| 92 | 084_stripe_usage_reporting.sql | 92 | Migration 084 — Stripe usage reporting ledger + aggregation | NO |
| 93 | 085_plan_metered_quotas.sql | 122 | Tapzi Barber — 085: Plan metered quotas + features refresh | NO |
| 94 | 087_appointment_reminders.sql | 362 | Migration 087 — Appointment Reminders (SMS + Email, 2h default) | NO |
| 95 | 089_credit_packs.sql | 328 | Migration 089: Credit Packs (prepaid SMS/email credits) | NO |
| 96 | 090_reserve_usage_v2.sql | 416 | Migration 090: 3-tier consumption (included → pack → overage) | NO |
| 97 | 091_sms_marketing_schema.sql | 393 | Migration 091: SMS Marketing Schema | NO |
| 98 | 092_sms_marketing_rpcs.sql | 725 | Migration 092: SMS Marketing bulk usage RPCs | NO |
| 99 | 093_sms_campaign_worker_rpcs.sql | 153 | Migration 093: Helper RPCs for process-campaign-batches | NO |
| 100 | 094_remove_stop_constraint.sql | 19 | Migration 094: Remove STOP keyword enforcement from sms_campaigns | NO |
| 101 | 095_cost_summary_filter.sql | 98 | Migration 095: Fix get_campaign_cost_summary | NO |
| 102 | 096_estimate_usage_cost_cast_fix.sql | 153 | Migration 096: Fix estimate_usage_cost cast bug | NO |
| 103 | 097_pool_enum_cast_fix.sql | 318 | Migration 097: Fix all pool text/enum cast bugs | NO |
| 104 | 098_bulk_pool_enum_cast.sql | 365 | Migration 098: Fix v_pool text/enum cast in bulk functions | NO |
| 105 | 099_add_encoding_column.sql | 10 | Migration 099: Add sms_campaigns.encoding column | NO |
| 106 | 100_add_recipient_filter_and_error.sql | 27 | Migration 100: Add missing columns for create-sms-campaign | NO |
| 107 | 101_relax_encoding_check.sql | 13 | Migration 101: Relax encoding CHECK for lowercase variants | NO |
| 108 | 102_add_queued_at.sql | 5 | Migration 102: Add sms_campaigns.queued_at | NO |
| 109 | 103_user_notification_preferences.sql | 21 | Migration 103 — Add push/email toggles to user_notification_prefs | NO |
| 110 | 104_notifications_push.sql | 138 | Extend notification_log for push delivery | NO |
| 111 | 105_notifications_triggers.sql | 553 | Push dispatch trigger + bookings lifecycle notifications | NO |
| 112 | 106_notifications_triggers_extended.sql | 549 | Extended notification sources: live, follows, reviews, loyalty | NO |
| 113 | 107_platform_xp_foundation.sql | 214 | Migration 107: Platform XP Foundation (DIVE universal loyalty) | NO |
| 114 | 108_salon_marketplace_wallet.sql | 218 | Migration 108: Salon Marketplace Credit Wallet | NO |
| 115 | 109_marketplace_catalog.sql | 413 | Migration 109: Marketplace Catalog (Professional + Consumer) | NO |
| 116 | 110_feature_flags.sql | 177 | Migration 110: Feature Flags (rollout gating) | NO |
| 117 | 111_platform_xp_rpcs.sql | 975 | Migration 111: Platform XP RPC Layer (DIVE runtime) | NO |
| 118 | 112_xp_notification_triggers.sql | 533 | Platform XP / DIVE push notification triggers | NO |
| 119 | 113_marketplace_b2b_foundations.sql | 411 | Migration 113: Marketplace B2B Foundations | NO |
| 120 | 114_marketplace_b2b_rpcs.sql | 514 | Migration 114: Marketplace B2B RPCs | NO |
| 121 | 115_appointments_salon_client_link.sql | 192 | Migration 115: Link appointments to salon_clients (CRM identity fix) | NO |
| 122 | 116_fix_salon_clients_unique_for_upsert.sql | 46 | Migration 116: Fix ON CONFLICT for create_appointment_with_client | NO |
| 123 | 117_rpc_auto_set_sms_consent.sql | 109 | Migration 117: Auto-set SMS marketing consent for new clients | NO |
| 124 | 118_barber_breaks.sql | 133 | Migration 118: barber_breaks table | NO |
| 125 | 119_barber_breaks_rpcs.sql | 353 | Migration 119: barber_breaks RPCs (create / update / delete) | NO |
| 126 | 120_appointments_break_collision_trigger.sql | 77 | Migration 120: appointments BEFORE INSERT/UPDATE collision trigger | NO |
| 127 | 121_barber_breaks_consistency.sql | 110 | Migration 121: barber_breaks consistency rails + active view | NO |
| 128 | 122_barber_breaks_custom_color.sql | 225 | Migration 122: Custom color override for barber_breaks | NO |
| 129 | 123_calendar_realtime_publication.sql | 33 | Migration 123: Enable Supabase realtime for appointments + breaks | NO |
| 130 | 124_rpc_update_appointment.sql | 191 | Migration 124: Atomic appointment edit RPC | NO |
| 131 | 125_review_photos_in_rpc.sql | 92 | Migration 125: Include photo_urls in get_reviews_with_user RPC | NO |
| 132 | 126_auto_link_client_app_bookings.sql | 270 | Migration 126: Auto-link client-app bookings to salon_clients | NO |
| 133 | 127_fix_booking_notifications.sql | 263 | Migration 127: Fix lying booking notifications + owner alert | NO |
| 134 | 128_billing_multi_entity.sql | 133 | 128_billing_multi_entity.sql | NO |
| 135 | 129_seed_categories_from_barber_store.sql | 254 | 129_seed_categories_from_barber_store.sql | NO |
| 136 | 130_category_images.sql | 30 | 130_category_images.sql | NO |
| 137 | 131_salons_verified_column.sql | 22 | Migration 131: Add verified flag to salons (admin-set only) | NO |
| 138 | 132_avg_price_denorm_and_happy_hours_owner_rls.sql | 175 | Migration 132: avg_price denormalization + happy hours owner RLS | NO |
| 139 | 133_marketplace_product_images.sql | 107 | Migration 133: Multi-image support for marketplace products | NO |
| 140 | 134_marketplace_product_variants.sql | 69 | Migration 134: Marketplace product variants | NO |
| 141 | 135_marketplace_product_bundles.sql | 106 | Migration 135: Marketplace product bundles | NO |
| 142 | 136_marketplace_product_sale_window.sql | 64 | Migration 136: Sale price + scheduling window for marketplace | NO |
| 143 | 137_marketplace_orders_workflow.sql | 145 | Migration 137: Marketplace orders workflow (state machine) | NO |
| 144 | 138_marketplace_order_returns.sql | 106 | Migration 138: Marketplace order returns / refund requests | NO |
| 145 | 139_voucher_marketplace_scope.sql | 39 | Migration 139: Loyalty voucher marketplace scope | NO |
| 146 | 140_marketplace_storage_bucket.sql | 53 | Migration 140: Storage bucket for marketplace product images | NO |
| 147 | _diag_plan_quotas.sql | 160 | Diagnostic: plan quotas for salon (non-migration) | NO |
| 148 | _diagnostic_salon_clients_count.sql | 127 | DIAGNOSTIC: diag_salon_clients_count (non-migration) | NO |
| 149 | cleanup_test_accounts.sql | 46 | CLEANUP: Delete ALL test data | YES |
| 150 | seed_all_data.sql | 494 | SEED DATA COMPLET - Barber Store | YES (CONTENT DIFFERS) |

---

## Section 2 — barber-store Files NOT in Tapzi by Exact Filename

| barber-store Filename | Lines | Likely Tapzi Equivalent | Notes |
|----------------------|-------|------------------------|-------|
| 009.sql | 157 | 009_onboarding_salons.sql | Same content (onboarding/salons), no suffix in filename |
| 025_review_photos.sql | 29 | None | barber-store-only feature (review photo_url) |
| 026_appointment_booking_fix.sql | 104 | 025_appointment_booking_fix.sql | Renumbered +1; IDENTICAL content |
| 027_social_completion.sql | 369 | 026_social_completion.sql | Renumbered +1; IDENTICAL content |
| 028_social_seed_data.sql | 254 | 027_social_seed_data.sql | Renumbered +1; IDENTICAL content |
| 029_dive_software_salon_seed.sql | 601 | 028_dive_software_salon_seed.sql | Renumbered +1; IDENTICAL content |
| 030_dive_extra_appointments.sql | 456 | 029_dive_extra_appointments.sql | Renumbered +1; IDENTICAL content |
| 031_fix_salon_members_rls_recursion.sql | 29 | 030_fix_salon_members_rls_recursion.sql | Renumbered +1; IDENTICAL content |
| 032_fix_seed_display_names.sql | 44 | 031_fix_seed_display_names.sql | Renumbered +1; IDENTICAL content |
| 033_lives_table.sql | 35 | 032_lives_table.sql | Renumbered +1; CONTENT DIFFERS (BS = original CREATE; Tapzi = LiveKit ADD COLUMN) |
| 034_stories_video_support.sql | 25 | 033_stories_video_support.sql | Renumbered +1; IDENTICAL content |
| 035_realtime_publication.sql | 18 | 123_calendar_realtime_publication.sql | Different scope/number; check if subset |
| 036_stories_storage_and_cleanup.sql | 71 | None | barber-store-only (merged cron+storage_path) |
| 037_stories_storage_path.sql | 8 | None | barber-store-only (MERGED NO-OP note) |
| 038_multi_service_appointments.sql | 50 | 042_multi_service_appointments.sql | Renumbered; CONTENT DIFFERS (BS=simpler v1, Tapzi=junction table v2) |
| 039_add_verified_column.sql | 9 | 034_add_verified_column.sql | Renumbered; IDENTICAL content |
| 040_full_text_search.sql | 44 | 035_full_text_search.sql | Renumbered; IDENTICAL content |
| 041_trending_topics.sql | 27 | 036_trending_topics.sql | Renumbered; IDENTICAL content |
| 042_comment_likes.sql | 13 | 037_comment_likes.sql | Renumbered; IDENTICAL content |
| 043_hashtags.sql | 26 | 038_hashtags.sql | Renumbered; IDENTICAL content |
| 044_notify_followers_on_live.sql | 40 | 039_notify_followers_on_live.sql | Renumbered; IDENTICAL content |
| 045_remove_seed_lives.sql | 15 | 040_remove_seed_lives.sql | Renumbered; IDENTICAL content |
| 046_per_barber_analytics.sql | 529 | 041_per_barber_analytics.sql | Renumbered; IDENTICAL content |
| 047_multi_service_junction_table.sql | 76 | 042_multi_service_appointments.sql | barber-store split the junction table into 047; Tapzi folded it into 042 |
| 048_social_fixes.sql | 20 | 043_social_fixes.sql | Renumbered; IDENTICAL content |
| 049_comment_reactions.sql | 28 | 044_comment_reactions.sql | Renumbered; IDENTICAL content |
| 050_complete_social_setup.sql | 847 | 045_complete_social_setup.sql | Renumbered; IDENTICAL content |
| 051_notifications_realtime.sql | 11 | None | barber-store-only (realtime publication for notifications) |
| 052_comments_social_realtime.sql | 24 | None | barber-store-only (realtime for comment_likes + reactions) |
| 054_profiles_rls_and_trigger.sql | 73 | 008_profiles_rls_and_trigger.sql | Renumbered far; IDENTICAL content |
| 055_onboarding_salons.sql | 158 | 009_onboarding_salons.sql | Renumbered far; IDENTICAL content |
| 056_salon_services.sql | 135 | 011_salon_services.sql | Renumbered far; IDENTICAL content |
| 057_reports_insights.sql | 781 | 020_reports_insights.sql | Renumbered far; IDENTICAL content |
| 058_consumables.sql | 145 | 046_consumables.sql | Renumbered; IDENTICAL content |
| 059_fix_consumables_schema.sql | 28 | 046a_fix_consumables_schema.sql | Renumbered; IDENTICAL content |
| 060_improved_consumable_predictions.sql | 139 | 047_improved_consumable_predictions.sql | Renumbered; IDENTICAL content |
| 061_advanced_consumable_predictions.sql | 449 | 048_advanced_consumable_predictions.sql | Renumbered; CONTENT DIFFERS (BS=EWMA v2 451L, Tapzi=statistical v1 428L) |
| 062_support_tickets.sql | 52 | None | barber-store-only (support_tickets table) |
| 066_hashtag_triggers.sql | 65 | None | barber-store-only (hashtag post_count triggers) |
| 067_realtime_comment_reactions.sql | 5 | None | barber-store-only (no-op marker) |
| 068_api_usage_logs.sql | 28 | None | barber-store-only (api_usage_logs table) |
| 069_fix_notify_trigger_host_id.sql | 41 | None | barber-store-only (fix host_id in notify trigger) |
| 070_lives_staleness_cleanup.sql | 89 | None | barber-store-only (live streams staleness + cleanup) |
| 071_review_photos_multi.sql | 17 | None | barber-store-only (multi-photo review support) |
| 073_platform_xp_earn_triggers.sql | 82 | None | barber-store-only (XP earn triggers) |
| 074_stories_realtime_publication.sql | 10 | None | barber-store-only (stories table realtime) |

---

## Section 3 — Renumbering Conflict Map

All pairs confirmed by filename suffix matching + MD5 content comparison:

| Tapzi Filename | barber-store Filename | Number Delta | Content Match |
|---------------|----------------------|-------------|--------------|
| 008_profiles_rls_and_trigger.sql | 054_profiles_rls_and_trigger.sql | +46 | IDENTICAL |
| 009_onboarding_salons.sql | 055_onboarding_salons.sql | +46 | IDENTICAL |
| 011_salon_services.sql | 056_salon_services.sql | +45 | IDENTICAL |
| 020_reports_insights.sql | 057_reports_insights.sql | +37 | IDENTICAL |
| 025_appointment_booking_fix.sql | 026_appointment_booking_fix.sql | +1 | IDENTICAL |
| 026_social_completion.sql | 027_social_completion.sql | +1 | IDENTICAL |
| 027_social_seed_data.sql | 028_social_seed_data.sql | +1 | IDENTICAL |
| 028_dive_software_salon_seed.sql | 029_dive_software_salon_seed.sql | +1 | IDENTICAL |
| 029_dive_extra_appointments.sql | 030_dive_extra_appointments.sql | +1 | IDENTICAL |
| 030_fix_salon_members_rls_recursion.sql | 031_fix_salon_members_rls_recursion.sql | +1 | IDENTICAL |
| 031_fix_seed_display_names.sql | 032_fix_seed_display_names.sql | +1 | IDENTICAL |
| 032_lives_table.sql | 033_lives_table.sql | +1 | **DIFFERS** — Tapzi adds LiveKit columns; BS creates full table from scratch |
| 033_stories_video_support.sql | 034_stories_video_support.sql | +1 | IDENTICAL |
| 034_add_verified_column.sql | 039_add_verified_column.sql | +5 | IDENTICAL |
| 035_full_text_search.sql | 040_full_text_search.sql | +5 | IDENTICAL |
| 036_trending_topics.sql | 041_trending_topics.sql | +5 | IDENTICAL |
| 037_comment_likes.sql | 042_comment_likes.sql | +5 | IDENTICAL |
| 038_hashtags.sql | 043_hashtags.sql | +5 | IDENTICAL |
| 039_notify_followers_on_live.sql | 044_notify_followers_on_live.sql | +5 | IDENTICAL |
| 040_remove_seed_lives.sql | 045_remove_seed_lives.sql | +5 | IDENTICAL |
| 041_per_barber_analytics.sql | 046_per_barber_analytics.sql | +5 | IDENTICAL |
| 042_multi_service_appointments.sql | 038_multi_service_appointments.sql | -4 | **DIFFERS** — Tapzi=junction table v2 (76L); BS=simpler initial version (50L) |
| 043_social_fixes.sql | 048_social_fixes.sql | +5 | IDENTICAL |
| 044_comment_reactions.sql | 049_comment_reactions.sql | +5 | IDENTICAL |
| 045_complete_social_setup.sql | 050_complete_social_setup.sql | +5 | IDENTICAL |
| 046_consumables.sql | 058_consumables.sql | +12 | IDENTICAL |
| 046a_fix_consumables_schema.sql | 059_fix_consumables_schema.sql | +13 | IDENTICAL |
| 047_improved_consumable_predictions.sql | 060_improved_consumable_predictions.sql | +13 | IDENTICAL |
| 048_advanced_consumable_predictions.sql | 061_advanced_consumable_predictions.sql | +13 | **DIFFERS** — Tapzi=428L stat forecasting v1; BS=449L EWMA v2 (newer) |

**Root cause of renumbering:** barber-store inserted `025_review_photos.sql` at position 025, shifting all subsequent files +1. Then further reorganization shifted more files by +5, +12, +13, +46.

---

## Section 4 — Final Categorization

### Group A — "Pure Missing" (in Tapzi, no equivalent in barber-store — copy as-is)

97 files with no barber-store counterpart (entirely new features):

| tapzi_filename | barber_store_filename | category | action_recommended |
|---------------|----------------------|----------|-------------------|
| 005_live_seed_data.sql | N/A | A | Copy to barber-store; low risk (seed data only) |
| 010_fix_trigger_and_fallback.sql | N/A | A | Copy; Tapzi has both 010_fix and 010_unified — barber-store only has 010_unified. Review for conflicts. |
| 048_consumable_auto_deduction.sql | N/A | A | Copy; auto-deduction on appointment complete |
| 049_atomic_restock_rpc.sql | N/A | A | Copy; atomic stock RPC |
| 050_consumable_data_integrity.sql | N/A | A | Copy; data integrity checks |
| 051_advanced_consumable_predictions.sql | N/A | A | Copy; EWMA prediction v1 (superseded by BS 061 which is newer) — copy for schema parity but note BS 061 is the upgraded version |
| 052_waste_tracking.sql | N/A | A | Copy; waste/loss tracking tables |
| 053_per_barber_consumption.sql | N/A | A | Copy; per-barber consumption analytics |
| 054_loyalty_core.sql | N/A | A | Copy; loyalty core tables |
| 054_loyalty_gamification.sql | N/A | A | Copy; full loyalty+gamification system |
| 055_loyalty_rewards.sql | N/A | A | Copy; loyalty rewards & redemptions |
| 056_loyalty_achievements.sql | N/A | A | Copy; achievements & challenges |
| 057_loyalty_referrals.sql | N/A | A | Copy; referral system |
| 058_loyalty_streaks_multipliers.sql | N/A | A | Copy; streaks & multipliers V2 |
| 059_loyalty_rpc_core.sql | N/A | A | Copy; loyalty core RPCs |
| 060_loyalty_analytics.sql | N/A | A | Copy; loyalty analytics |
| 060_personalization_engine.sql | N/A | A | Copy; personalization engine V1 |
| 061_loyalty_seasonal_events.sql | N/A | A | Copy; seasonal events |
| 062_loyalty_seed_data.sql | N/A | A | Copy; loyalty seed data |
| 063_fix_loyalty_dashboard_vtier.sql | N/A | A | Copy; loyalty dashboard fix |
| 065_analytics_dashboard.sql | N/A | A | Copy; analytics dashboard RPCs |
| 066_client_intelligence.sql | N/A | A | Copy; client intelligence RPCs |
| 067_financial_analytics.sql | N/A | A | Copy; financial analytics |
| 068_data_integrity_fixes.sql | N/A | A | Copy; data integrity + security |
| 069_post_features.sql | N/A | A | Copy; post rich features (tags, location, mood) |
| 069_shop_gamification_xp.sql | N/A | A | Copy; shop gamification XP |
| 070_xp_reward_from_catalog.sql | N/A | A | Copy; XP reward from catalog |
| 071_business_signup_subscriptions.sql | N/A | A | Copy; business signup + subscription plans |
| 072_seed_plans_and_trial_rpc.sql | N/A | A | Copy; plans seed + trial RPC |
| 072b_start_salon_trial_rpc.sql | N/A | A | Copy; start_salon_trial RPC |
| 073_subscription_realtime_and_view.sql | N/A | A | Copy; subscription realtime + view |
| 074_salon_setup_dismiss.sql | N/A | A | Copy; setup checklist dismiss |
| 075_salon_setup_progress_rpc.sql | N/A | A | Copy; setup progress RPC |
| 076_barber_service_assignments.sql | N/A | A | Copy; service<->staff assignments |
| 077_salon_setup_team_skip.sql | N/A | A | Copy; "invite team later" skip flag |
| 078_stripe_integration.sql | N/A | A | Copy; Stripe integration |
| 079_stripe_seat_price.sql | N/A | A | Copy; seat price ID |
| 080_billing_summary_fix.sql | N/A | A | Copy; billing summary fix |
| 081_metered_billing_core.sql | N/A | A | Copy; metered billing core |
| 082_metered_billing_rpcs.sql | N/A | A | Copy; metered billing RPCs |
| 083_delivery_webhooks.sql | N/A | A | Copy; delivery webhooks |
| 084_stripe_usage_reporting.sql | N/A | A | Copy; Stripe usage reporting |
| 085_plan_metered_quotas.sql | N/A | A | Copy; plan quotas refresh |
| 087_appointment_reminders.sql | N/A | A | Copy; appointment reminders (SMS + email) |
| 089_credit_packs.sql | N/A | A | Copy; credit packs |
| 090_reserve_usage_v2.sql | N/A | A | Copy; 3-tier usage consumption |
| 091_sms_marketing_schema.sql | N/A | A | Copy; SMS marketing schema |
| 092_sms_marketing_rpcs.sql | N/A | A | Copy; SMS marketing RPCs |
| 093_sms_campaign_worker_rpcs.sql | N/A | A | Copy; campaign worker RPCs |
| 094_remove_stop_constraint.sql | N/A | A | Copy; STOP constraint removal |
| 095_cost_summary_filter.sql | N/A | A | Copy; cost summary fix |
| 096_estimate_usage_cost_cast_fix.sql | N/A | A | Copy; cast fix |
| 097_pool_enum_cast_fix.sql | N/A | A | Copy; enum cast fix |
| 098_bulk_pool_enum_cast.sql | N/A | A | Copy; bulk enum cast fix |
| 099_add_encoding_column.sql | N/A | A | Copy; encoding column |
| 100_add_recipient_filter_and_error.sql | N/A | A | Copy; missing columns |
| 101_relax_encoding_check.sql | N/A | A | Copy; encoding CHECK relax |
| 102_add_queued_at.sql | N/A | A | Copy; queued_at column |
| 103_user_notification_preferences.sql | N/A | A | Copy; notification toggles |
| 104_notifications_push.sql | N/A | A | Copy; push notification extension |
| 105_notifications_triggers.sql | N/A | A | Copy; push dispatch triggers |
| 106_notifications_triggers_extended.sql | N/A | A | Copy; extended notification sources |
| 107_platform_xp_foundation.sql | N/A | A | Copy; Platform XP foundation |
| 108_salon_marketplace_wallet.sql | N/A | A | Copy; marketplace credit wallet |
| 109_marketplace_catalog.sql | N/A | A | Copy; marketplace catalog |
| 110_feature_flags.sql | N/A | A | Copy; feature flags |
| 111_platform_xp_rpcs.sql | N/A | A | Copy; XP RPC layer |
| 112_xp_notification_triggers.sql | N/A | A | Copy; XP notification triggers |
| 113_marketplace_b2b_foundations.sql | N/A | A | Copy; B2B foundations |
| 114_marketplace_b2b_rpcs.sql | N/A | A | Copy; B2B RPCs |
| 115_appointments_salon_client_link.sql | N/A | A | Copy; CRM appointment link |
| 116_fix_salon_clients_unique_for_upsert.sql | N/A | A | Copy; upsert constraint fix |
| 117_rpc_auto_set_sms_consent.sql | N/A | A | Copy; SMS consent auto-set |
| 118_barber_breaks.sql | N/A | A | Copy; barber_breaks table |
| 119_barber_breaks_rpcs.sql | N/A | A | Copy; breaks RPCs |
| 120_appointments_break_collision_trigger.sql | N/A | A | Copy; collision trigger |
| 121_barber_breaks_consistency.sql | N/A | A | Copy; breaks consistency |
| 122_barber_breaks_custom_color.sql | N/A | A | Copy; custom break color |
| 123_calendar_realtime_publication.sql | N/A | A | Copy; calendar realtime |
| 124_rpc_update_appointment.sql | N/A | A | Copy; atomic appointment edit RPC |
| 125_review_photos_in_rpc.sql | N/A | A | Copy; photo_urls in reviews RPC |
| 126_auto_link_client_app_bookings.sql | N/A | A | Copy; auto-link CRM |
| 127_fix_booking_notifications.sql | N/A | A | Copy; notification fixes |
| 128_billing_multi_entity.sql | N/A | A | Copy; multi-entity billing |
| 129_seed_categories_from_barber_store.sql | N/A | A | Copy; category seed |
| 130_category_images.sql | N/A | A | Copy; category images |
| 131_salons_verified_column.sql | N/A | A | Copy; salons.verified flag |
| 132_avg_price_denorm_and_happy_hours_owner_rls.sql | N/A | A | Copy; avg_price + happy hours RLS |
| 133_marketplace_product_images.sql | N/A | A | Copy; product multi-images |
| 134_marketplace_product_variants.sql | N/A | A | Copy; product variants |
| 135_marketplace_product_bundles.sql | N/A | A | Copy; product bundles |
| 136_marketplace_product_sale_window.sql | N/A | A | Copy; sale price window |
| 137_marketplace_orders_workflow.sql | N/A | A | Copy; orders state machine |
| 138_marketplace_order_returns.sql | N/A | A | Copy; order returns |
| 139_voucher_marketplace_scope.sql | N/A | A | Copy; voucher scope |
| 140_marketplace_storage_bucket.sql | N/A | A | Copy; marketplace storage bucket |
| _diag_plan_quotas.sql | N/A | A | Copy (diagnostic only, non-migration) |
| _diagnostic_salon_clients_count.sql | N/A | A | Copy (diagnostic only, non-migration) |

**Group A total: 97 files**

---

### Group B — "Renumbered Equivalent" (different number, same logical migration)

Subdivided by content match result:

#### B1 — Identical content (safe to treat as already migrated)

| tapzi_filename | barber_store_filename | category | action_recommended |
|---------------|----------------------|----------|-------------------|
| 025_appointment_booking_fix.sql | 026_appointment_booking_fix.sql | B1 | Already applied under different number; no action needed |
| 026_social_completion.sql | 027_social_completion.sql | B1 | Already applied; no action needed |
| 027_social_seed_data.sql | 028_social_seed_data.sql | B1 | Already applied; no action needed |
| 028_dive_software_salon_seed.sql | 029_dive_software_salon_seed.sql | B1 | Already applied; no action needed |
| 029_dive_extra_appointments.sql | 030_dive_extra_appointments.sql | B1 | Already applied; no action needed |
| 030_fix_salon_members_rls_recursion.sql | 031_fix_salon_members_rls_recursion.sql | B1 | Already applied; no action needed |
| 031_fix_seed_display_names.sql | 032_fix_seed_display_names.sql | B1 | Already applied; no action needed |
| 033_stories_video_support.sql | 034_stories_video_support.sql | B1 | Already applied; no action needed |
| 034_add_verified_column.sql | 039_add_verified_column.sql | B1 | Already applied; no action needed |
| 035_full_text_search.sql | 040_full_text_search.sql | B1 | Already applied; no action needed |
| 036_trending_topics.sql | 041_trending_topics.sql | B1 | Already applied; no action needed |
| 037_comment_likes.sql | 042_comment_likes.sql | B1 | Already applied; no action needed |
| 038_hashtags.sql | 043_hashtags.sql | B1 | Already applied; no action needed |
| 039_notify_followers_on_live.sql | 044_notify_followers_on_live.sql | B1 | Already applied; no action needed |
| 040_remove_seed_lives.sql | 045_remove_seed_lives.sql | B1 | Already applied; no action needed |
| 041_per_barber_analytics.sql | 046_per_barber_analytics.sql | B1 | Already applied; no action needed |
| 043_social_fixes.sql | 048_social_fixes.sql | B1 | Already applied; no action needed |
| 044_comment_reactions.sql | 049_comment_reactions.sql | B1 | Already applied; no action needed |
| 045_complete_social_setup.sql | 050_complete_social_setup.sql | B1 | Already applied; no action needed |
| 008_profiles_rls_and_trigger.sql | 054_profiles_rls_and_trigger.sql | B1 | Already applied; no action needed |
| 009_onboarding_salons.sql | 055_onboarding_salons.sql | B1 | Already applied; no action needed |
| 011_salon_services.sql | 056_salon_services.sql | B1 | Already applied; no action needed |
| 020_reports_insights.sql | 057_reports_insights.sql | B1 | Already applied; no action needed |
| 046_consumables.sql | 058_consumables.sql | B1 | Already applied; no action needed |
| 046a_fix_consumables_schema.sql | 059_fix_consumables_schema.sql | B1 | Already applied; no action needed |
| 047_improved_consumable_predictions.sql | 060_improved_consumable_predictions.sql | B1 | Already applied; no action needed |

**B1 total: 26 pairs — no action required**

#### B2 — Content diverged (same name suffix, different SQL — needs manual diff review)

| tapzi_filename | barber_store_filename | category | action_recommended |
|---------------|----------------------|----------|-------------------|
| 032_lives_table.sql | 033_lives_table.sql | B2 | REVIEW: Tapzi=ALTER TABLE add LiveKit cols; BS=full CREATE TABLE. BS applied first, Tapzi patch is additive — verify LiveKit columns exist in BS DB. May need to port the ALTER only. |
| 042_multi_service_appointments.sql | 038_multi_service_appointments.sql | B2 | REVIEW: Tapzi version is v2 with full junction table (76L); BS has v1 partial (50L) + separate 047_multi_service_junction_table.sql. Together BS 038+047 may cover same ground — verify schema parity. |
| 048_advanced_consumable_predictions.sql | 061_advanced_consumable_predictions.sql | B2 | REVIEW: BS version (449L EWMA) is actually NEWER than Tapzi (428L statistical v1). BS is ahead here. No action needed; Tapzi 048 is already superseded. |

**B2 total: 3 pairs — manual content review required**

---

### Group C — "Identical Name, Different Content" (same filename in both, hash mismatch)

| tapzi_filename | barber_store_filename | category | action_recommended |
|---------------|----------------------|----------|-------------------|
| seed_all_data.sql | seed_all_data.sql | C | REVIEW: Both are seed files, not schema migrations. Tapzi version (494L) likely has more data. Not applied by Supabase migration runner — manual diff recommended before any merge. |

**Group C total: 1 file**

Note: All 22 other shared-name files (001–024 range + cleanup_test_accounts.sql) are byte-for-byte identical — no action needed.

---

### Group D — "barber-store Only" (in barber-store, no Tapzi equivalent — preserve)

| tapzi_filename | barber_store_filename | category | action_recommended |
|---------------|----------------------|----------|-------------------|
| N/A | 009.sql | D | Preserve — same content as Tapzi 009_onboarding_salons.sql but differently named |
| N/A | 025_review_photos.sql | D | Preserve — unique BS feature (review photo_url single column) |
| N/A | 035_realtime_publication.sql | D | Preserve — earlier realtime setup; Tapzi has 123 which may supersede |
| N/A | 036_stories_storage_and_cleanup.sql | D | Preserve — BS-specific merge of cron + storage_path |
| N/A | 037_stories_storage_path.sql | D | Preserve — BS no-op marker |
| N/A | 047_multi_service_junction_table.sql | D | Preserve — BS split of junction table logic |
| N/A | 051_notifications_realtime.sql | D | Preserve — BS-only notifications realtime pub |
| N/A | 052_comments_social_realtime.sql | D | Preserve — BS-only comment reactions realtime |
| N/A | 062_support_tickets.sql | D | Preserve — support_tickets table (BS-only feature) |
| N/A | 066_hashtag_triggers.sql | D | Preserve — hashtag post_count triggers |
| N/A | 067_realtime_comment_reactions.sql | D | Preserve — no-op marker |
| N/A | 068_api_usage_logs.sql | D | Preserve — api_usage_logs (BS-only) |
| N/A | 069_fix_notify_trigger_host_id.sql | D | Preserve — host_id fix for BS schema |
| N/A | 070_lives_staleness_cleanup.sql | D | Preserve — live staleness + cron (BS-only) |
| N/A | 071_review_photos_multi.sql | D | Preserve — photo_urls array upgrade (BS-only) |
| N/A | 073_platform_xp_earn_triggers.sql | D | Preserve — XP earn triggers (BS custom) |
| N/A | 074_stories_realtime_publication.sql | D | Preserve — stories realtime (BS-only) |

**Group D total: 17 files — do not touch**

---

## Summary Statistics

| Group | Count | Description |
|-------|-------|-------------|
| A — Pure missing | 97 | In Tapzi, no barber-store equivalent. Copy as-is. |
| B1 — Renumbered, identical | 26 | Already in barber-store under different number. No action. |
| B2 — Renumbered, content differs | 3 | Manual diff review required. |
| C — Same filename, content differs | 1 | seed_all_data.sql — manual review. |
| D — barber-store only | 17 | Preserve, do not touch. |
| Shared identical (baseline) | 22 | Both have same file, same content. No action. |

**Total Tapzi files audited:** 144 (140 numbered SQL + 4 non-numbered)  
**Total barber-store files audited:** 71 (69 numbered SQL + 2 non-numbered)  
**Net new migrations barber-store needs:** 97 (Group A)
