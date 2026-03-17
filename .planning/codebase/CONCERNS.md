# Codebase Concerns

**Analysis Date:** 2026-03-17

## Tech Debt

**Missing Error Handling in Async Operations:**
- Issue: Many async operations in stores and screens catch errors but only log them to console (3 console statements found) without user-facing feedback. Silent failures make debugging difficult.
- Files: `stores/authStore.ts`, `stores/cartStore.ts`, `stores/locationStore.ts`, `app/checkout.tsx`
- Impact: Users won't know if critical operations like cart updates or profile fetches fail. They may retry thinking nothing happened, or assume the action succeeded when it didn't.
- Fix approach: Implement consistent error handling with user-visible error states. Add error messages to store state (e.g., `lastError?: string`), and display alerts/toasts when operations fail.

**Environment Variables as Placeholders:**
- Issue: `lib/supabase.ts` uses placeholder values for missing env vars - `process.env.EXPO_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"` and anon key defaults to `"placeholder-key"`.
- Files: `lib/supabase.ts` (lines 44-45)
- Impact: App will fail silently at runtime when env vars are missing. All Supabase calls will fail with cryptic errors. Deployment will break if env vars aren't properly configured.
- Fix approach: Validate required env vars at startup with helpful error messages. Throw during initialization if critical env vars are missing rather than using placeholders.

**Unvalidated Form Data in Checkout:**
- Issue: Phone number regex is permissive (`/^[0-9+\s-]{10,}$/`) but doesn't validate Romanian phone number format properly. Name field allows any input. Address field not validated for completeness.
- Files: `app/checkout.tsx` (lines 168-170)
- Impact: Orders can be placed with invalid phone numbers (users won't be reachable), incomplete addresses, or suspicious names. No ability to recover contact info after order.
- Fix approach: Implement stricter validation rules. For Romanian numbers, ensure format like 07xx-xxxxxx or similar. Add address validation (minimum length, no special patterns). Use react-hook-form's validation rules more strictly.

**Inconsistent Error Handling Patterns Across Stores:**
- Issue: `authStore.ts` logs errors but continues execution; `cartStore.ts` silently swallows errors; `locationStore.ts` sets error messages but they're never displayed.
- Files: `stores/authStore.ts` (lines 54-56), `stores/cartStore.ts` (lines 52-53), `stores/locationStore.ts` (lines 40)
- Impact: Developers can't predict how errors propagate. Some operations appear to succeed when they fail. No consistent recovery mechanism.
- Fix approach: Standardize error handling across all stores. Create error state type for each store. Define clear contract: error always exists in state, UI layer always checks and displays errors.

**Optimistic Updates Without Rollback:**
- Issue: `cartStore.ts` updates UI optimistically (lines 80-82, 108-112, 132-134) but has no rollback mechanism if server request fails.
- Files: `stores/cartStore.ts`
- Impact: If network fails or server rejects update, UI shows completed action but data isn't actually persisted. User thinks item was added/updated but it wasn't. Next refresh shows old data.
- Fix approach: Add rollback on mutation failure. Store previous state before optimistic update and restore if operation fails. Or, remove optimistic updates until error handling is robust.

## Known Bugs

**Double Initialization on Auth Changes:**
- Issue: `authStore.ts` calls `fetchProfile()` twice - once in `initialize()` (line 38) and again in the onAuthStateChange listener (line 49).
- Files: `stores/authStore.ts` (lines 38, 49)
- Symptoms: Profile is fetched twice when user logs in, causing duplicate database queries.
- Workaround: None - just unnecessary network overhead.

**Cart Items Display Uses Product Direct Properties:**
- Issue: `cart.tsx` displays `item.product.title` and `item.product.price_cents` (lines 69, 72) but types don't guarantee these properties exist.
- Files: `app/cart.tsx`, `types/database.ts`
- Trigger: Can occur if product relationship from Supabase doesn't load properly.
- Symptoms: Cart items show blank text, NaN prices, or crashes.
- Workaround: Verify product is not null before rendering.

**Missing Quantity Limits in Cart:**
- Issue: `cartStore.ts` checks `qty <= 0` to delete but doesn't validate against product stock (line 94). `app/product/[id].tsx` limits quantity to product.stock (line 156) but cart doesn't enforce the same limit.
- Files: `stores/cartStore.ts`, `app/product/[id].tsx`
- Symptoms: User can update cart quantity to exceed available stock via direct store calls or race conditions.
- Trigger: If user modifies qty while product stock changes.

**Location Permission Error Messages Not Surfaced:**
- Issue: `useLocationStore.ts` sets `errorMsg` but it's never read or displayed in UI. Users see loading state forever if they deny permission.
- Files: `stores/locationStore.ts` (line 25), `app/(tabs)/discover.tsx` (lines 46)
- Symptoms: Discover screen hangs if location is denied. No prompt to retry or use map without location.
- Trigger: User denies location permission on first app launch.

**Placeholder Data Blocks Real Data Fallback:**
- Issue: `app/(tabs)/feed.tsx` uses placeholder stories and lives when real data is empty (lines 44-94). If real data fails to load, placeholder data is shown instead, with no indication it's stale.
- Files: `app/(tabs)/feed.tsx` (lines 44-94)
- Symptoms: User sees fake content indistinguishable from real content.
- Trigger: Any Supabase query failure for stories/lives.

## Security Considerations

**No Input Sanitization on Order Address:**
- Risk: Checkout form accepts unsanitized user input and stores it in database directly (lines 45, 55).
- Files: `app/checkout.tsx` (lines 45, 55)
- Current mitigation: Input length limited by TextInput in React Native.
- Recommendations: Sanitize input before storage. Limit to reasonable length (e.g., 200 chars). Reject input with SQL/NoSQL patterns. Use prepared statements (Supabase client already does this, but sanitize at app level too).

**Session Token Storage:**
- Risk: Supabase auth token stored in device storage (SecureStore on native, localStorage on web). If device is compromised, attacker has full user account access.
- Files: `lib/supabase.ts` (lines 29-39, 42)
- Current mitigation: Uses SecureStore (encrypted) on native, localStorage on web.
- Recommendations: Implement token refresh logic to expire tokens quickly. Add device pinning (store device identifier, invalidate if it changes). Consider removing web support if not needed.

**No Rate Limiting on User Actions:**
- Risk: Users can hammer API endpoints (like/comment/review creation) with no server-side or client-side throttling.
- Files: `lib/rateLimit.ts` exists but not used in feed/comment code.
- Current mitigation: Rate limiting utility exists but appears unused.
- Recommendations: Enforce rate limits in feed actions, comment submissions, and review creation. Check `checkRateLimit()` before mutations in FeedCard and ReviewModal.

**Auth State Not Cleared on Logout:**
- Risk: `signOut()` clears session/profile in store (line 98) but doesn't invalidate existing queries or subscriptions.
- Files: `stores/authStore.ts` (lines 94-102)
- Current mitigation: None visible.
- Recommendations: Call `queryClient.clear()` on logout to invalidate cached user data. Unsubscribe from any real-time listeners.

## Performance Bottlenecks

**Large Component File Sizes:**
- Problem: Largest files exceed 1000 lines (shop.tsx: 1085, discover.tsx: 997).
- Files: `app/(tabs)/shop.tsx`, `app/(tabs)/discover.tsx`, `app/salon/[id].tsx` (768 lines)
- Cause: Multiple sub-components and styles defined inline instead of extracted.
- Improvement path: Break into smaller component files. Move complex filter logic into custom hooks. Extract ProductCard, SheetContent into separate files with `export function` naming.

**Inline Stylesheet Creation:**
- Problem: StyleSheets created on every render for some components.
- Files: `app/(tabs)/shop.tsx` (lines 634+), `app/product/[id].tsx` (lines 199+)
- Cause: Using `StyleSheet.create()` at bottom of file (fine), but styles recreated on every component render.
- Improvement path: Move all `StyleSheet.create()` outside component functions to module level.

**Inefficient Product Filtering:**
- Problem: Shop screen sorts and filters entire product catalog on every state change (line 82-100 recalculates).
- Files: `app/(tabs)/shop.tsx` (lines 82-100)
- Cause: useMemo optimization is present but filters 2k+ products on each keystroke.
- Improvement path: Implement server-side filtering. Paginate products. Debounce search input.

**Unoptimized Image Loading:**
- Problem: No image caching or optimization. Every image from Supabase storage loaded at full resolution.
- Files: `app/(tabs)/shop.tsx`, `app/salon/[id].tsx`, feed components
- Cause: Using raw `Image` component with full URIs.
- Improvement path: Implement image caching library (react-native-fast-image). Use Supabase image URL transformation for thumbnails. Add placeholder images.

**Infinite Query Without Proper Pagination Check:**
- Problem: `feed.tsx` uses `useInfiniteQuery` but no validation that `hasNextPage` is set correctly.
- Files: `app/(tabs)/feed.tsx` (uses infinite query pattern)
- Cause: No error handling if pagination cursors are missing.
- Improvement path: Add validation. Ensure `pageParam` is always valid before querying. Add limit checks.

## Fragile Areas

**Database Query Dependency Chain in Salon Screen:**
- Files: `app/salon/[id].tsx`
- Why fragile: Salon detail screen queries 6+ separate endpoints sequentially (salon, barbers, services, photos, schedule, reviews, happy hours). If any query fails, entire screen breaks.
- Safe modification: Wrap each query in error boundary. Use `Promise.allSettled()` to batch queries and handle partial failures gracefully.
- Test coverage: No visible error states or fallbacks.

**Auth State Initialization Race Condition:**
- Files: `stores/authStore.ts`, `app/_layout.tsx`
- Why fragile: `initialize()` sets `isInitialized = true` before `onAuthStateChange` listener completes (line 42-53). If listener fires and changes session, UI may already be rendering with stale data.
- Safe modification: Only set `isInitialized = true` after initial state is fully loaded and listener is registered.
- Test coverage: Hard to test without simulating slow network.

**Conditional Rendering Without Null Checks:**
- Files: `app/checkout.tsx` (line 101-104 redirects if cart is empty, but doesn't prevent rendering)
- Why fragile: Some screens redirect based on state but continue rendering. If redirect doesn't happen immediately, component renders with invalid props.
- Safe modification: Return null or loading state before JSX, don't put redirects in middle of component.

**Bottom Sheet Refs Without Null Safety:**
- Files: `app/(tabs)/shop.tsx` (lines 74-75), `app/(tabs)/discover.tsx` (line 57)
- Why fragile: Refs are used without checking if bottom sheet is mounted (line 106: `bottomSheetRef.current?.expand()`). Works now but if render order changes, could crash.
- Safe modification: Always use optional chaining (?.) when accessing ref methods.

## Scaling Limits

**Hard-coded Pagination Limits:**
- Current capacity: Feed infinite query default limit (probably 20-50 items per page)
- Limit: Once feed has >10k posts, initial load will be slow. No pagination UI for user control.
- Scaling path: Implement proper pagination with "load more" button. Allow user to choose page size. Server-side filtering/sorting.

**Supabase Row-Level Security (RLS) Complexity:**
- Current capacity: 24 migrations creating complex RLS policies. 17 separate policy migrations.
- Limit: Policies likely conflict or have gaps. Hard to audit. New features require careful policy updates.
- Scaling path: Consolidate RLS policies. Document policy intent in comments. Create automated tests for access control.

**In-Memory Zustand Stores Without Persistence:**
- Current capacity: Stores only hold current session. No persistence between app launches.
- Limit: Auth state is refetched every app launch. Cart is refetched. No offline support.
- Scaling path: Implement store persistence using AsyncStorage. Add offline queue for mutations (user actions queue if offline).

**Static Product Catalog Loading:**
- Current capacity: Shop screen loads `products.json` statically (line 26).
- Limit: Can't add new products without code change. File will grow large. No server-side product management.
- Scaling path: Migrate product catalog to Supabase. Implement search/filter on server. Cache locally.

## Dependencies at Risk

**React Native 0.81.5 - Out of Date:**
- Risk: Version 0.81.5 is older. Expo 54 is current but may not support latest RN features. Security patches may be missing.
- Impact: Can't use latest React Native features. May have unpatched bugs affecting iOS/Android.
- Migration plan: Update to latest React Native version supported by Expo. Test thoroughly on both platforms.

**Zustand 5.0.11 - Early Major Version:**
- Risk: Zustand 5.0 is relatively new. Breaking changes possible in patch versions.
- Impact: Store refactoring might be needed. Type safety might break.
- Migration plan: Pin version exactly. Monitor Zustand changelog. Test before updating.

**@tanstack/react-query 5.90.20 - Rapid Release Cycle:**
- Risk: React Query updates frequently. Behavior changes in patch versions possible.
- Impact: Query caching behavior might change. Code assuming specific caching might break.
- Migration plan: Use lock files (package-lock.json present). Document query configuration. Test before updating.

## Missing Critical Features

**No Offline Support:**
- Problem: App requires constant internet connection. No cached data available offline. All features blocked if network unavailable.
- Blocks: Viewing previously loaded content, taking actions, user experience in poor signal areas.

**No Real-Time Sync:**
- Problem: Orders, appointments, and salon data are fetched once and cached. Changes on other devices won't appear unless user refreshes.
- Blocks: Live order status updates, appointment confirmations, inventory sync.

**No Push Notifications:**
- Problem: No integration with push notification service (Firebase Cloud Messaging, OneSignal, etc).
- Blocks: Order updates, appointment reminders, new messages.

**No Image Upload Validation:**
- Problem: Review photos can be uploaded but no validation of file size, format, or image content.
- Blocks: Potential to upload gigabyte files or inappropriate images.

## Test Coverage Gaps

**Auth Flow Not Tested:**
- What's not tested: Sign up, sign in, sign out, password reset, session recovery.
- Files: `stores/authStore.ts`, `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`
- Risk: Auth changes could silently break. Session recovery bugs undetected.
- Priority: High

**Cart Operations Not Tested:**
- What's not tested: Adding items, updating quantity, removing items, edge cases (duplicate adds, quantity limits).
- Files: `stores/cartStore.ts`, `app/cart.tsx`
- Risk: Users lose items, cart becomes inconsistent with server, duplicate items added.
- Priority: High

**Form Validation Not Tested:**
- What's not tested: Checkout form validation, phone number format, required fields, error messages.
- Files: `app/checkout.tsx`
- Risk: Invalid orders placed, uncontactable users, bad data in database.
- Priority: High

**Error Handling Not Tested:**
- What's not tested: Supabase query failures, network timeouts, invalid responses, concurrent mutations.
- Files: All screens and stores
- Risk: App crashes or hangs on network issues.
- Priority: Medium

**Component Rendering Edge Cases Not Tested:**
- What's not tested: Empty states, loading states, error states, null properties.
- Files: Feed, discover, salon screens
- Risk: Crashes when data is missing or loading.
- Priority: Medium

---

*Concerns audit: 2026-03-17*
