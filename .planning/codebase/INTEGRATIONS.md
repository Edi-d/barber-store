# External Integrations

**Analysis Date:** 2026-03-17

## APIs & External Services

**Supabase Backend:**
- Service: Supabase (PostgreSQL + Auth + Storage)
- What it's used for: Complete backend platform (authentication, database, file storage)
- SDK/Client: @supabase/supabase-js 2.95.3
- Client initialization: `lib/supabase.ts`
- Auth method: Email/password authentication

**Google Maps:**
- Service: Google Maps Platform
- What it's used for: Map display and location-based features (salon discovery, booking locations)
- Integration: react-native-maps 1.20.1
- API Key: Located in `app.json` (configured in both iOS and Android sections)
  - iOS: `ios.config.googleMapsApiKey`
  - Android: `android.config.googleMaps.apiKey`
- Usage files: `app/(tabs)/discover.tsx`, `components/feed/BookingHeroCard.tsx`

## Data Storage

**Databases:**
- PostgreSQL (via Supabase)
  - Connection: Supabase URL (`EXPO_PUBLIC_SUPABASE_URL`)
  - Client: @supabase/supabase-js
  - Query pattern: RLS (Row-Level Security) enforced
  - Tables: profiles, appointments, salons, reviews, products, courses, etc.
  - Migrations: Located in `migrations/` directory
    - Schema includes: authentication, salon management, bookings, reviews, media, social features

**File Storage:**
- Supabase Storage
  - Access: Via @supabase/supabase-js storage client
  - Usage: Profile images, salon media, product images, course materials
  - Example: `app/settings.tsx` handles profile picture uploads
  - Methods: `supabase.storage.from('bucket').upload()`, `.getPublicUrl()`

**Caching:**
- TanStack React Query 5.90.20
  - Cache strategy: Query keys by resource type
  - Invalidation: Manual via `queryClient.invalidateQueries()`
  - Examples: `["salon", id]`, `["appointments"]`, `["salon-reviews", id]`

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Implementation: Email/password authentication
  - Session management: Automatic via `onAuthStateChange()` listener
  - Auth Store: `stores/authStore.ts`
  - Methods: `signIn()`, `signUp()`, `signOut()`, `resetPassword()`
  - Session storage:
    - Web: localStorage (via WebStorageAdapter)
    - Native: Expo Secure Store (via NativeStorageAdapter)
  - Auto-refresh: Enabled
  - Session persistence: Enabled across app restarts

**Session Flow:**
1. App initializes auth store in `app/_layout.tsx`
2. Supabase checks for existing session
3. Profile data fetched from `profiles` table
4. Real-time listener updates state on auth changes
5. Unauthorized access redirected to auth layout

## Location Services

**GPS & Geolocation:**
- Expo Location 19.0.8
  - Purpose: Determine user location for salon discovery
  - Permission: "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION" (Android)
  - iOS: "NSLocationWhenInUseUsageDescription" in infoPlist
  - Usage: `app/(tabs)/discover.tsx` filters salons by proximity

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, Bugsnag, or similar)
- Console.log statements used for debugging in authStore.ts

**Logs:**
- Browser/device console logging
- Examples: Auth state changes, profile fetching results in `stores/authStore.ts`

## CI/CD & Deployment

**Hosting:**
- Expo Go (development)
- EAS Build (cloud builds)
  - Project ID: 736a549c-35cd-4d81-8644-72075004b1d0
  - Builds stored as `.ipa` files (iOS)

**CI Pipeline:**
- Not explicitly configured (manual builds via EAS CLI)

**Build Artifacts:**
- iOS builds: `.ipa` files in project root (multiple versions present from Feb-Mar 2026)

## Environment Configuration

**Required env vars:**
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase public anon key

**Secrets location:**
- `.env` file (location: `/Users/edi/Desktop/barber-store/.env`)
- Contents not readable (secrets protection)

**Expo Public Vars Convention:**
- All public keys prefixed with `EXPO_PUBLIC_*` (required for Expo)
- Private keys stored in `.env` only (not accessible from app)

## Webhooks & Callbacks

**Incoming:**
- Not detected in codebase

**Outgoing:**
- Auth state change listener: `supabase.auth.onAuthStateChange()`
  - Callback triggers profile fetch on session changes
  - Location: `stores/authStore.ts` (lines 46-52)

## Database Schema Overview

**Core Tables:**
- `profiles` - User profile information
  - Fields: username, display_name, bio, avatar_url, onboarding_completed, etc.
  - Auth sync: User ID links to Supabase auth.users

- `salons` - Salon/barber shop information
  - Fields: name, description, location, services, salon_type (barber/coafor/both)
  - Media: Associated images/photos
  - Reviews: One-to-many relationship

- `appointments` - Booking records
  - Fields: user, salon, date, time, status
  - Relationships: user_id, salon_id foreign keys

- `reviews` - Salon ratings and comments
  - Fields: rating, comment, author_id, salon_id
  - Media: Associated review photos

- `products` - Shop inventory (if applicable)
  - Analytics: Product view/purchase tracking

- `courses` - Educational content
  - Progress tracking per user

**RLS Policies:**
- Row-level security enforced (migrations 012, 013, 017)
- Profile updates: Only user can modify own profile
- Reviews: Users can create/edit/delete own reviews
- Salon admin features: Owner-only access

## Social Features

**Comments & Likes:**
- Real-time updates via supabase realtime subscriptions
- Pagination support in queries
- Media attachments for reviews

**Follows/Connections:**
- Follow relationships tracked in database (migration 007)

## Analytics

**Employee Analytics:**
- Booking/performance tracking (migration 018)

**Product Analytics:**
- Product view counts and purchase tracking (migration 021)

---

*Integration audit: 2026-03-17*
