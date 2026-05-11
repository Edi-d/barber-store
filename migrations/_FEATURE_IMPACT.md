# Feature Impact Matrix — Tapzi-barber vs barber-store

Generated: 2026-05-11
Missing migrations: 103 SQL files only in Tapzi-barber

---

## Feature Impact Matrix

| Feature Area | # Migrations | Key Tables / Objects | barber-store code uses them? | Priority |
|---|---|---|---|---|
| **Marketplace Catalog & Orders** | 14 | `marketplace_products`, `marketplace_orders`, `marketplace_order_items`, `marketplace_categories`, `marketplace_sections`, `marketplace_inventory_adjustments`, `marketplace_shipments`, `marketplace_salon_order_summary` (view), `marketplace_storage_bucket` | **YES** — `use-marketplace-catalog.ts`, `use-salon-orders.ts`, all `/marketplace/*` screens query these tables directly | **HIGH** |
| **Marketplace Maturity (Images/Variants/Bundles/Orders Workflow/Returns)** | 9 | `marketplace_product_images`, `marketplace_product_variants`, `marketplace_product_bundles`, `marketplace_bundle_items`, `marketplace_order_status_history`, `marketplace_order_returns`, `loyalty_vouchers.scope`, `marketplace_product_effective_price()` (fn) | **PARTIAL** — code uses `marketplace_products` and `loyalty_vouchers` but none of these sub-tables; `use-recurring-list.ts` and `use-stock-notifications.ts` reference `marketplace_recurring_lists`, `marketplace_recurring_list_items`, `marketplace_stock_notifications` (all from mig 113) | **HIGH** |
| **Platform XP / DIVE universal loyalty** | 7 | `user_platform_xp`, `platform_xp_transactions`, `xp_voucher_tiers`, `xp_level_thresholds`, `user_shop_xp`, `shop_xp_config`, `shop_xp_transactions`, `feature_flags`, `salon_feature_overrides`, RPC `convert_points_to_voucher`, `earn_platform_xp`, `earn_xp_from_purchase`, `spend_xp_on_reward` | **YES** — `lib/loyalty.ts` reads `platform_xp_transactions`, `xp_voucher_tiers`; `use-shop-xp.ts` reads `user_shop_xp`, `xp_level_thresholds`, calls `earn_xp_from_purchase`; `/shop-xp/index.tsx`, `/loyalty/index.tsx` all exist; `feature_flags` / `salon_feature_overrides` NOT referenced | **HIGH** |
| **Loyalty & Gamification (per-salon)** | 11 | `loyalty_settings`, `loyalty_tiers`, `loyalty_profiles`, `point_transactions`, `rewards_catalog`, `loyalty_vouchers`, `loyalty_streaks`, `streak_rewards`, `point_multipliers`, `referral_codes`, `referral_claims`, `achievements`, `user_achievements`, `challenges`, `user_challenges`, `user_personalization`, `loyalty_events`, `event_participations`, RPC `earn_appointment_points`, `redeem_reward`, `get_loyalty_dashboard` | **PARTIAL** — `useLoyaltyProfile.ts` and `useLoyaltyNotifications.ts` exist and are used on profile/loyalty screens; `lib/loyalty.ts` calls these RPCs; BUT the per-salon loyalty tables (`loyalty_settings`, `loyalty_tiers`, etc.) are **only in Tapzi-barber migrations** — barber-store has no migrations for them | **HIGH** |
| **Billing, Subscriptions & Stripe** | 19 | `plans`, `subscriptions`, `webhook_events`, `payments`, `invoices`, `salon_billing_details`, `salon_billing_config`, `usage_events`, `metered_skus`, `usage_periods`, `credit_packs`, `credit_ledger`, `usage_stripe_reports`, `delivery_events_log`, RPC `reserve_usage`, `confirm_usage`, `release_usage`, `start_salon_trial`, `get_salon_billing_summary` | **PARTIAL** — `use-salon-billing-details.ts` and `use-default-salon-billing.ts` query `salon_billing_details` (from mig 113/128); no subscription/plans/Stripe code present in barber-store app; `subscription_status` column on `salons` (from mig 071) not referenced anywhere in code | **MEDIUM** |
| **SMS Marketing** | 12 | `salon_clients`, `sms_campaigns`, `sms_campaign_recipients`, `salon_sms_opt_outs`, extended `salons.sms_sender_id`, RPC `estimate_usage_cost`, `reserve_usage_bulk`, `release_usage_bulk`, `claim_campaign_batch`, `confirm_recipient_sent` | **NO** — no references in barber-store code; `salon_clients` table is also needed for booking CRM link (mig 115/116/126) which the code doesn't use either | **MEDIUM** |
| **Booking Enhancements** | 10 | `barber_breaks`, `v_barber_breaks_active` (view), `salon_reminder_preferences`, `appointment_reminders`, `service_staff_assignments`, `appointments.salon_client_id` (column), `appointments.tracking_*` (columns), RPC `create_appointment_with_client`, `update_appointment_with_services`, `create_barber_break` | **NO** — none of these tables or RPCs are referenced in barber-store code; `/book-appointment.tsx` and `/appointments.tsx` exist but use legacy direct insert patterns | **MEDIUM** |
| **Push Notifications** | 4 | `notification_log` (extended), `push_tokens`, `user_notification_prefs` (extended), `notification_log.is_read`, `notification_log.deep_link`, `notification_log.title_key`, pg_net push dispatch trigger, `create_notification()` helper fn | **NO** — no references to these tables in barber-store; the legacy `notifications` table from mig 026 is in barber-store but the modern `notification_log` is not | **MEDIUM** |
| **Analytics & CRM** | 6 | `salon_overhead_config`, `smart_alerts`, `user_personalization`, RPC `get_salon_health_score`, `get_client_intelligence`, `get_financial_dashboard`, `get_salon_loyalty_kpis`, `get_salon_loyalty_trends`, `get_churn_risk_members`, `get_analytics_dashboard` | **NO** — no references in barber-store code | **LOW** |
| **Consumables Tracking** | 10 | `salon_consumables`, `consumable_stock_logs`, `consumable_service_usage`, RPC `get_consumable_predictions` (EWMA v3), `restock_consumable`, `deduct_consumables_for_appointment`, `log_consumable_waste`, `get_barber_consumption_stats` | **NO** — zero references in barber-store code | **LOW** |
| **Onboarding & Salon Setup** | 7 | `salons.setup_dismissed_at`, `salons.setup_team_skipped_at`, `salons.cui`, `salons.legal_name`, `salons.subscription_status`, `salons.trial_ends_at`, `salons.stripe_customer_id`, `salons.verified`, `salons.avg_price_cents`, `service_staff_assignments`, RPC `get_salon_setup_progress`, `dismiss_salon_setup`, `skip_salon_setup_team` | **NO** — not referenced in barber-store; relevant only to salon-owner (Tapzi) web app | **LOW** |
| **Security / RLS Fixes** | 3 | Fixes for `courses`, `products`, `hashtags`, `notifications`, `barber_services`, `appointments` (updated_at trigger), missing FK indexes, CHECK constraints on status columns | **INDIRECT** — barber-store shares the same schema base, so these RLS gaps currently exist unpatched in barber-store's DB | **MEDIUM** |
| **Seed Data / Test Data** | 10 | Auth users, salon, barbers, appointments, loyalty seed data, plan seed data, marketplace category seed data | **NO** — seed only; relevant for local dev | **LOW** |

---

## Code vs Schema Direction

### barber-store code is AHEAD of its own migrations (uses tables that don't exist in its migrations)

These tables are referenced in barber-store code but have NO migration in barber-store:

- `platform_xp_transactions` — read by `lib/loyalty.ts` (needs mig 107)
- `xp_voucher_tiers` — read by `lib/loyalty.ts` (needs mig 107)
- `user_platform_xp` — implied by loyalty lib (needs mig 107)
- `xp_level_thresholds` — read by `use-shop-xp.ts` (needs mig 069)
- `user_shop_xp` — read by `use-shop-xp.ts` (needs mig 069)
- `shop_xp_transactions` — written by `earn_xp_from_purchase` RPC (needs mig 069)
- `marketplace_products` — read by `use-marketplace-catalog.ts` (needs mig 109)
- `marketplace_orders` — read by `use-salon-orders.ts` (needs mig 109)
- `marketplace_order_items` — read by `use-salon-orders.ts` (needs mig 109)
- `marketplace_categories` — read by `use-marketplace-catalog.ts` (needs mig 109)
- `marketplace_salon_order_summary` — view read by `use-salon-orders.ts` (needs mig 109+)
- `marketplace_recurring_lists` — read by `use-recurring-list.ts` (needs mig 113)
- `marketplace_recurring_list_items` — read by `use-recurring-list.ts` (needs mig 113)
- `marketplace_stock_notifications` — read by `use-stock-notifications.ts` (needs mig 113)
- `salon_billing_details` — read/written by billing hooks (needs mig 113/128)
- `loyalty_profiles` — implied by `useLoyaltyProfile` (needs mig 054)
- `loyalty_settings`, `loyalty_tiers`, `point_transactions`, `rewards_catalog` — implied (needs migs 054-063)

### barber-store migrations have tables but code doesn't use them

- `073_platform_xp_earn_triggers.sql` — exists in barber-store, but triggers depend on `user_platform_xp` not yet migrated
- `033_lives_table.sql` through `037_stories_storage_path.sql` — migrated, code partially uses them
- `040_full_text_search.sql` through `043_hashtags.sql` — migrated, code uses search/hashtags

---

## TOP 5 Most Impactful Feature Areas — Migrations to Prioritize

### 1. Platform XP / DIVE Foundation (HIGH — code crashes without it)
**Migrations:** `107_platform_xp_foundation.sql`, `111_platform_xp_rpcs.sql`, `112_xp_notification_triggers.sql`, `069_shop_gamification_xp.sql`, `070_xp_reward_from_catalog.sql`, `110_feature_flags.sql`

barber-store code actively queries `platform_xp_transactions`, `xp_voucher_tiers`, `user_shop_xp`, `xp_level_thresholds` and calls `earn_xp_from_purchase` + `convert_points_to_voucher` RPCs. Without these tables the loyalty screen, shop-xp screen, and `/app/(tabs)/profile.tsx` will throw runtime errors on every load. This is the single most urgent gap.

---

### 2. Marketplace Catalog Core (HIGH — marketplace is already in the app)
**Migrations:** `109_marketplace_catalog.sql`, `108_salon_marketplace_wallet.sql`, `113_marketplace_b2b_foundations.sql`, `114_marketplace_b2b_rpcs.sql`, `129_seed_categories_from_barber_store.sql`, `140_marketplace_storage_bucket.sql`

Marketplace screens (`/marketplace/index.tsx`, `/marketplace/checkout.tsx`, `use-salon-orders.ts`, `use-recurring-list.ts`, `use-stock-notifications.ts`) all query tables created by these migrations. Without mig 109 the entire marketplace is broken. Without mig 113 recurring lists and stock notifications silently fail.

---

### 3. Per-salon Loyalty Core (HIGH — loyalty screen exists and is user-facing)
**Migrations:** `054_loyalty_core.sql`, `054_loyalty_gamification.sql`, `055_loyalty_rewards.sql`, `056_loyalty_achievements.sql`, `057_loyalty_referrals.sql`, `058_loyalty_streaks_multipliers.sql`, `059_loyalty_rpc_core.sql`, `060_loyalty_analytics.sql`, `063_fix_loyalty_dashboard_vtier.sql`

`/app/loyalty/index.tsx` calls `useLoyaltyProfile` which resolves to `lib/loyalty.ts` reading from loyalty tables. These tables are entirely absent from barber-store migrations. The per-salon loyalty (distinct from platform XP) powers the rewards catalog, tier badges, and voucher issuance shown to end customers.

---

### 4. Marketplace Maturity (HIGH — code references tables that don't exist)
**Migrations:** `133_marketplace_product_images.sql`, `134_marketplace_product_variants.sql`, `135_marketplace_product_bundles.sql`, `136_marketplace_product_sale_window.sql`, `137_marketplace_orders_workflow.sql`, `138_marketplace_order_returns.sql`, `139_voucher_marketplace_scope.sql`, `130_category_images.sql`, `131_salons_verified_column.sql`, `132_avg_price_denorm_and_happy_hours_owner_rls.sql`

The PDP screen (`/marketplace/product/[id].tsx`) and cart/checkout will need variant and image support as the catalog grows. Sale windows and bundle support are pre-wired in the UI already ported from Tapzi.

---

### 5. Booking Enhancements (MEDIUM — prevents CRM link and break management)
**Migrations:** `115_appointments_salon_client_link.sql`, `116_fix_salon_clients_unique_for_upsert.sql`, `118_barber_breaks.sql`, `119_barber_breaks_rpcs.sql`, `120_appointments_break_collision_trigger.sql`, `121_barber_breaks_consistency.sql`, `122_barber_breaks_custom_color.sql`, `123_calendar_realtime_publication.sql`, `124_rpc_update_appointment.sql`, `126_auto_link_client_app_bookings.sql`, `127_fix_booking_notifications.sql`, `087_appointment_reminders.sql`

`appointments.salon_client_id` (mig 115) is needed to link customer-app bookings to the CRM so names show correctly in the owner calendar. `barber_breaks` (mig 118-123) enables break management. Realtime calendar publication (mig 123) prevents stale calendar displays after create/edit. These are operationally critical for the salon owner experience.

---

## Migrations to Skip (barber-store irrelevant)

- `071-090` Stripe billing, metered billing, credit packs — only relevant when barber-store adds a B2B subscription paywall (not yet in the app)
- `091-102` SMS marketing — entirely a Tapzi-barber B2B feature; barber-store has no SMS campaign screens
- `065-068` Advanced analytics RPCs — salon-owner BI dashboard not yet built in barber-store
- `046-053` Consumables — no consumables screens in barber-store
- `005`, `027-031` Seed data — local dev only
