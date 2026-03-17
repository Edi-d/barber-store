# Codebase Structure

**Analysis Date:** 2026-03-17

## Directory Layout

```
barber-store/
├── app/                    # Expo Router pages and screens (file-based routing)
│   ├── (auth)/            # Authentication screens (route group)
│   ├── (tabs)/            # Main tabbed interface screens (route group)
│   ├── course/            # Dynamic course detail pages
│   ├── lesson/            # Dynamic lesson pages
│   ├── product/           # Dynamic product detail pages
│   ├── salon/             # Dynamic salon/barbershop detail pages
│   ├── _layout.tsx        # Root layout with providers and navigation
│   ├── index.tsx          # Entry point (redirect logic)
│   ├── appointments.tsx   # Appointments management
│   ├── book-appointment.tsx # Appointment booking
│   ├── cart.tsx           # Shopping cart
│   ├── checkout.tsx       # Checkout flow
│   ├── go-live.tsx        # Live streaming/broadcasting
│   ├── orders.tsx         # Order history
│   └── settings.tsx       # User settings
├── components/            # Reusable React components
│   ├── auth/             # Authentication UI components
│   ├── feed/             # Social feed components
│   ├── discover/         # Discovery/search components
│   ├── salon/            # Salon-specific components
│   ├── shared/           # Shared utility components
│   └── ui/               # Base UI components (Button, Input, Card, etc.)
├── lib/                   # Utility functions and business logic
│   ├── supabase.ts       # Supabase client initialization
│   ├── booking.ts        # Appointment booking logic
│   ├── discover.ts       # Discovery feature logic
│   ├── salon.ts          # Salon business logic
│   ├── rateLimit.ts      # Rate limiting utilities
│   └── utils.ts          # General utilities
├── stores/               # Zustand state management
│   ├── authStore.ts      # Authentication state
│   ├── cartStore.ts      # Shopping cart state
│   └── locationStore.ts  # Location/geolocation state
├── types/                # TypeScript type definitions
│   └── database.ts       # Database schema types
├── constants/            # App constants and configuration
│   └── theme.ts          # Color, spacing, and theme constants
├── data/                 # Static data and seed data
│   ├── products.json     # Product catalog data
│   └── types.ts          # Data type definitions
├── assets/               # Static assets (images, fonts)
│   └── euclid-circular-a/ # Custom font files
├── migrations/           # Database schema migrations (SQL)
│   ├── 001_initial_schema.sql
│   ├── 002_storage_buckets.sql
│   ├── ... (27+ migration files)
│   └── 025_review_photos.sql
├── ios/                  # iOS native code and configuration
│   └── Pods/             # CocoaPods dependencies
├── dist/                 # Build output (generated)
├── .expo/                # Expo configuration (generated)
├── .planning/            # Planning documents (generated)
│   └── codebase/        # Architecture and analysis docs
├── app.json              # Expo app configuration
├── package.json          # Node.js dependencies and scripts
├── package-lock.json     # Dependency lock file
├── tsconfig.json         # TypeScript configuration
├── tailwind.config.js    # Tailwind CSS configuration
├── metro.config.js       # Metro bundler configuration
├── babel.config.js       # Babel transpilation configuration
├── eas.json              # EAS (Expo Application Services) configuration
├── global.css            # Global Tailwind CSS styles
├── expo-env.d.ts         # Expo environment type definitions
└── nativewind-env.d.ts   # NativeWind environment type definitions
```

## Directory Purposes

**`app/`:**
- Purpose: Expo Router file-based routing - each file/directory becomes a screen
- Contains: Page components (screens), layout files, dynamic route handlers
- Entry point: `app/index.tsx` redirects based on auth state
- Layout structure: Route groups `(auth)` and `(tabs)` group related screens

**`app/(auth)/`:**
- Purpose: Authentication flow screens
- Contains: login, signup, welcome, onboarding, forgot-password screens
- Shared layout: `_layout.tsx` provides auth-specific navigation

**`app/(tabs)/`:**
- Purpose: Main tab-based navigation interface
- Contains: feed, courses, discover, shop, profile screens
- Uses: Bottom tab navigation with Expo Router Tabs

**`app/course/`, `app/lesson/`, `app/product/`, `app/salon/`:**
- Purpose: Dynamic detail screens using route parameters `[id]`
- Pattern: `[id].tsx` files receive route parameters via `useLocalSearchParams()`

**`components/`:**
- Purpose: Reusable React Native components organized by feature
- Structure: Feature-based organization, not flat
- Naming: PascalCase for component files, each file = one exported component

**`components/ui/`:**
- Purpose: Base UI components used across the app
- Contains: Button, Input, Card, Avatar, Badge, AnimatedScreen
- Pattern: Barrel export in `index.ts` for convenient imports
- Styling: Uses Tailwind CSS via NativeWind

**`components/feed/`:**
- Purpose: Social feed specific components
- Contains: FeedCard, FeedItem, CommentsModal, LiveSection, StoriesRow, etc.
- Complexity: Large components (CommentsModal is 38KB) handling modal state and interactions

**`lib/`:**
- Purpose: Utility functions and business logic layers
- Contains: API clients (Supabase), feature logic (booking, discover, salon)
- Pattern: Each module exports functions for a specific domain
- No direct React component code here

**`stores/`:**
- Purpose: Zustand state management stores
- Contains: authStore (session, profile), cartStore (items, totals), locationStore
- Pattern: Exported as hooks (`useAuthStore`, `useCartStore`)
- Accessed via: `import { useAuthStore } from "@/stores/authStore"`

**`types/`:**
- Purpose: Centralized TypeScript type definitions
- Contains: `database.ts` with all schema types from Supabase
- Pattern: Export types for use throughout the app

**`constants/`:**
- Purpose: App-wide configuration constants
- Contains: `theme.ts` with Colors, spacing, typography settings

**`data/`:**
- Purpose: Static data and seed information
- Contains: `products.json` (large product catalog), type definitions
- Pattern: JSON files for data, TypeScript for type definitions

**`migrations/`:**
- Purpose: Database schema version control (SQL)
- Contains: 27+ numbered migration files for incremental schema changes
- Pattern: Sequential numbering (001, 002, ... 025), one per schema change
- Executed on: Supabase database setup

**`assets/`:**
- Purpose: Static images and fonts
- Structure: Images at root, custom fonts in `euclid-circular-a/`
- Font file: Euclid Circular A with 10 variants (Light, Regular, Medium, SemiBold, Bold + Italics)

## Key File Locations

**Entry Points:**
- `app/index.tsx`: Root entry point - redirects to auth or main tabs
- `app/_layout.tsx`: Root layout - wraps entire app with providers (QueryClientProvider, GestureHandlerRootView)
- `app/(auth)/_layout.tsx`: Auth flow layout
- `app/(tabs)/_layout.tsx`: Tab navigation layout with bottom tab bar

**Configuration:**
- `tsconfig.json`: TypeScript configuration with `@/*` path alias for root imports
- `tailwind.config.js`: Tailwind CSS and NativeWind configuration
- `app.json`: Expo app metadata, name, version, plugins
- `babel.config.js`: Babel transpilation for React Native
- `metro.config.js`: Metro bundler (React Native bundler) configuration
- `eas.json`: Expo Application Services configuration for building

**Core Logic:**
- `lib/supabase.ts`: Supabase client initialization
- `lib/booking.ts`: Appointment booking logic
- `lib/discover.ts`: Discover/search feature logic
- `lib/salon.ts`: Salon business operations
- `stores/authStore.ts`: Authentication and user session state
- `stores/cartStore.ts`: Shopping cart state management
- `types/database.ts`: All TypeScript types for database schema

**Global Styles:**
- `global.css`: Global Tailwind CSS styles
- `constants/theme.ts`: Theme colors and design tokens

**Testing:**
- Not detected - no test files in repository

## Naming Conventions

**Files:**
- **Pages/Screens**: kebab-case.tsx (e.g., `book-appointment.tsx`, `go-live.tsx`)
- **Components**: PascalCase.tsx (e.g., `FeedCard.tsx`, `CommentsModal.tsx`)
- **Hooks/Stores**: camelCase.ts (e.g., `authStore.ts`, `supabase.ts`)
- **Utilities/Services**: camelCase.ts (e.g., `utils.ts`, `rateLimit.ts`)
- **Types**: camelCase.ts (e.g., `database.ts`)
- **Constants**: camelCase.ts (e.g., `theme.ts`)

**Directories:**
- **Route groups**: Parentheses (e.g., `(auth)`, `(tabs)`) - Expo Router convention
- **Dynamic routes**: Square brackets (e.g., `course/[id]`, `product/[id]`)
- **Feature modules**: lowercase (e.g., `components/feed`, `components/salon`)

**Components:**
- Named exports with PascalCase function names
- Barrel export pattern: `index.ts` exports all components from directory
- Example: `components/ui/index.ts` exports Button, Input, Card, Avatar, Badge

**Functions:**
- camelCase (e.g., `useFonts`, `useAuthStore`, `initialize`)

**Variables:**
- camelCase (e.g., `isInitialized`, `isLoading`, `queryClient`)

**Types/Interfaces:**
- PascalCase (e.g., `Profile`, `Session`, `Product`)

## Where to Add New Code

**New Screen/Page:**
- Location: `app/[name].tsx` or `app/[group]/[name].tsx`
- Pattern: Export default React component using Expo Router
- Layout: If it's a group of related screens, create a route group directory with `_layout.tsx`

**New Feature Component:**
- Implementation: `components/[feature-name]/ComponentName.tsx`
- Structure: Create new directory under `components/` for feature
- Export: Add to `components/[feature-name]/index.ts` barrel file (if needed)

**New Utility/Business Logic:**
- Location: `lib/[feature-name].ts`
- Pattern: Export named functions (not default)
- Example: `lib/newFeature.ts` with `export const doSomething = () => { ... }`

**New State Management:**
- Location: `stores/[featureName]Store.ts`
- Pattern: Zustand store with hooks
- Export: Default export as hook `export const use[Feature]Store = create(...)`

**New Type Definitions:**
- Location: `types/[domain].ts` or add to `types/database.ts`
- Pattern: TypeScript interfaces/types
- Example: `export interface Product { ... }`

**New Constants:**
- Location: `constants/[domain].ts` or `constants/theme.ts`
- Pattern: Exported constants object
- Example: `export const Colors = { primary: '#4481EB' }`

**Static Data:**
- Location: `data/` directory
- Pattern: JSON files or TypeScript constant exports
- Example: `data/products.json` for product catalog

## Special Directories

**`ios/`:**
- Purpose: iOS-specific native code generated by Expo
- Generated: Yes (from `app.json` and eas.json)
- Committed: Yes (contains Podfile, build configuration)
- Usage: Native dependencies, iOS-specific configuration

**`.expo/`:**
- Purpose: Expo development configuration
- Generated: Yes (during `expo start`)
- Committed: Partially (types, devices.json)
- Contains: Router types, device list, cache

**`dist/`:**
- Purpose: Web build output
- Generated: Yes
- Committed: No (should be in .gitignore)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (from package-lock.json)
- Committed: No (in .gitignore)

**`migrations/`:**
- Purpose: Database schema version history
- Generated: No (hand-written SQL)
- Committed: Yes
- Pattern: Applied sequentially on Supabase database

---

*Structure analysis: 2026-03-17*
