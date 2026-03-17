# Architecture

**Analysis Date:** 2026-03-17

## Pattern Overview

**Overall:** Expo Router with client-side state management using Zustand and React Query

**Key Characteristics:**
- File-based routing (Expo Router) with folder-based grouping for auth and tab navigation
- Real-time database via Supabase with TypeScript-generated types
- Global state management using Zustand for auth and cart
- React Query for server state and data fetching
- Glassmorphism UI design system with Nativewind/TailwindCSS
- Platform-specific code handling (iOS/Android/Web)

## Layers

**Routing & Navigation:**
- Purpose: Manage app navigation and screen hierarchy
- Location: `app/`, `app/(auth)/`, `app/(tabs)/`
- Contains: Route definitions, screen components, layout coordinators
- Depends on: Auth store for protected routes, UI components
- Used by: All screens and modal flows

**Authentication & Authorization:**
- Purpose: Handle user identity, session management, and profile operations
- Location: `stores/authStore.ts`, `lib/supabase.ts`, `app/(auth)/`
- Contains: Auth logic, session persistence, profile CRUD
- Depends on: Supabase client, secure storage (expo-secure-store)
- Used by: Root layout, all authenticated screens, auth-required actions

**State Management:**
- Purpose: Manage client-side state for auth, cart, location
- Location: `stores/authStore.ts`, `stores/cartStore.ts`, `stores/locationStore.ts`
- Contains: Zustand stores with actions and computed values
- Depends on: Supabase for persistence, TypeScript types
- Used by: Components across entire app

**Data Access & API:**
- Purpose: Communicate with Supabase database and manage server state
- Location: `lib/supabase.ts`, React Query hooks in components
- Contains: Supabase client initialization, query implementations, mutations
- Depends on: Supabase JS SDK, environment variables
- Used by: Stores, React Query hooks, components

**UI Components & Screens:**
- Purpose: Render user interface with design system compliance
- Location: `components/`, `app/(tabs)/`, individual route files
- Contains: Reusable UI components, screen-specific components, layouts
- Depends on: Constants (theme, colors, typography), third-party animations
- Used by: Route handlers, other components

**Design System & Constants:**
- Purpose: Centralize styling, colors, typography, spacing
- Location: `constants/theme.ts`, `components/ui/`
- Contains: Color definitions, typography scales, spacing constants, shadow definitions
- Depends on: React Native platform detection
- Used by: All UI components

**Utilities & Helpers:**
- Purpose: Provide common functions and transformations
- Location: `lib/utils.ts`, `lib/rateLimit.ts`, `lib/booking.ts`, `lib/salon.ts`, `lib/discover.ts`
- Contains: Price formatting, time utilities, rate limiting, domain-specific helpers
- Depends on: Standard library, Supabase client
- Used by: Components, stores, screens

**Type System:**
- Purpose: Define database schema and TypeScript contracts
- Location: `types/database.ts`
- Contains: Database schema types (generated from Supabase), extended relations, enums
- Depends on: None
- Used by: All data-related code, stores, components

## Data Flow

**Authentication Flow:**

1. App initializes (RootLayout)
2. `useAuthStore.initialize()` checks for existing session
3. Supabase session restored from secure storage (native) or localStorage (web)
4. If session exists, `fetchProfile()` loads user profile data
5. `isInitialized` flag triggers layout navigation
6. Components subscribe to `session` and `profile` from store

**Cart Operations:**

1. User adds product (Shop screen or Product detail)
2. `cartStore.addItem()` checks if product already in cart
3. Inserts into `cart_items` table or updates quantity
4. Optimistic update of local state
5. Cart count computed by `totalItems()` selector
6. Tab badge updates in real-time

**Content & Feed Loading:**

1. Feed screen uses React Query with infinite scroll
2. `useInfiniteQuery` fetches paginated content from `content` table
3. Author data loaded via join with `profiles` table
4. Likes and comments counts denormalized in `content` table
5. Likes/comments mutations update both Supabase and React Query cache
6. Comments modal shows thread with nested replies via `parent_id`

**Salon Discovery:**

1. Discover screen queries salon data by type (barbershop/coafor)
2. Location-based filtering via `latitude/longitude`
3. Salon detail screen loads appointments, reviews, services
4. Booking flow creates appointments in `appointments` table
5. Reviews submitted to `salon_reviews` table with optional photos

**Course & Lesson Access:**

1. Courses screen loads course list from `courses` table
2. Course detail expands course with modules and lessons
3. Lesson progress tracked in `lesson_progress` table
4. Video/text content served from `content_url` in lessons

## Key Abstractions

**Zustand Store Pattern:**
- Purpose: Centralize state and actions for a domain
- Examples: `stores/authStore.ts`, `stores/cartStore.ts`
- Pattern: Store factory with state object, computed selectors, async actions, error handling via return objects

**Supabase Client:**
- Purpose: Provide real-time database access with type safety
- Location: `lib/supabase.ts`
- Pattern: Platform-aware storage adapter (SecureStore for native, localStorage for web), auto-refresh tokens, persistent sessions

**React Query Integration:**
- Purpose: Manage server state, caching, and synchronization
- Examples: Feed infinite queries, story queries, salon searches
- Pattern: Query functions encapsulate Supabase calls, cache invalidation on mutations, staleTime/retry config at root

**Design System Constants:**
- Purpose: Ensure UI consistency across all screens
- Location: `constants/theme.ts`
- Pattern: Exported objects for Colors, Typography, Spacing, Bubble styles, Shadows

**Route Groups:**
- Purpose: Organize navigation and apply layout logic
- Examples: `(auth)` group for login/signup/reset flows, `(tabs)` for bottom-tab navigation
- Pattern: Group wrapper with Stack or Tabs, child routes inherit layout configuration

## Entry Points

**Root Layout:**
- Location: `app/_layout.tsx`
- Triggers: App initialization
- Responsibilities: Font loading, auth initialization, QueryClient setup, GestureHandler/StatusBar configuration, loading screen display

**Auth Layout:**
- Location: `app/(auth)/_layout.tsx`
- Triggers: Unauthenticated user navigation
- Responsibilities: Stack navigation for login/signup/forgot-password flows with fade animations

**Tabs Layout:**
- Location: `app/(tabs)/_layout.tsx`
- Triggers: Authenticated user enters main app
- Responsibilities: Custom glass-morphism tab bar, tab route configuration, cart badge state

**Welcome/Index:**
- Location: `app/index.tsx`
- Triggers: First app launch after auth check
- Responsibilities: Route authentication status to auth stack or tabs

**Dynamic Route Handlers:**
- `app/product/[id].tsx`: Load product details, handle add-to-cart
- `app/salon/[id].tsx`: Load salon details, reviews, services
- `app/course/[id].tsx`: Load course with modules
- `app/lesson/[id].tsx`: Load lesson content with progress tracking

## Error Handling

**Strategy:** Explicit error returns from async actions

**Patterns:**
- Store actions return `{ error: Error | null }` tuples
- Components check error and display user-friendly messages
- Supabase errors caught and re-thrown with context
- Rate limiting via `lib/rateLimit.ts` checks before expensive operations
- Optimistic updates reverted on error via state roll-back

## Cross-Cutting Concerns

**Logging:** Console logs with prefixes (e.g., `[AUTH]`, `[CART]`) for debugging; no external logger configured

**Validation:** React Hook Form for user inputs (forms); schema validation at Supabase RLS level; client-side type checking via TypeScript

**Authentication:** Supabase Auth with magic link and password reset; token auto-refresh; session listeners for auth state changes

**Rate Limiting:** Custom rate limiting in `lib/rateLimit.ts` prevents abuse of mutations (comments, likes, bookings)

**Permissions:** Role-based access control via `profiles.role` (user/creator/admin/moderator); Supabase RLS policies enforce at database level

---

*Architecture analysis: 2026-03-17*
