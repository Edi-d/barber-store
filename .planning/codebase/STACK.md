# Technology Stack

**Analysis Date:** 2026-03-17

## Languages

**Primary:**
- TypeScript 5.9.2 - Type-safe frontend application code

**Secondary:**
- JavaScript - Configuration files (babel, metro, tailwind configs)
- SQL - Database migrations and seed data

## Runtime

**Environment:**
- React Native 0.81.5 - Cross-platform mobile application framework
- Expo 54.0.33 - Managed React Native development platform
- Node.js - Package management and development tooling

**Package Manager:**
- npm - Version management via package-lock.json
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 19.1.0 - UI component framework
- Expo Router 6.0.23 - File-based routing for Expo/React Native
- React Native Web 0.21.0 - Web platform support

**State Management:**
- Zustand 5.0.11 - Lightweight state management
- Location: `stores/authStore.ts`, `stores/locationStore.ts`

**Form Handling:**
- React Hook Form 7.71.1 - Performant form validation and state

**Data Fetching:**
- TanStack React Query 5.90.20 - Server state management and caching
- Usage: `app/book-appointment.tsx`, `app/salon/[id].tsx`, `app/settings.tsx`

**UI & Styling:**
- Tailwind CSS 3.4.19 - Utility-first CSS framework
- NativeWind 4.2.1 - Tailwind integration for React Native
- Config: `tailwind.config.js`

**Navigation & Gestures:**
- Expo Router 6.0.23 - File-based navigation
- React Navigation (via expo-router) - Navigation library
- React Native Gesture Handler 2.28.0 - Gesture detection
- React Native Reanimated 4.1.1 - Animation and gesture-driven interactions

**Maps & Location:**
- React Native Maps 1.20.1 - Native maps integration
- Expo Location 19.0.8 - GPS location services
- Google Maps API - Via native configuration keys

**Audio/Visual:**
- Expo AV 16.0.8 - Audio and video playback
- Expo Blur 15.0.8 - Blur effect component
- Expo Linear Gradient 15.0.8 - Gradient rendering
- Expo Image Picker 17.0.10 - Image selection from device
- React Native SVG 15.12.1 - SVG rendering

**Storage & Security:**
- Expo Secure Store 15.0.8 - Secure credential storage (platform-specific)
- Base64 Array Buffer 1.0.2 - Binary data encoding
- Platform-aware storage adapter in `lib/supabase.ts`

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.95.3 - Backend database and authentication
  - Used for: Auth (email/password), database queries, file storage
  - Config: `lib/supabase.ts`
  - Auth method: Email/password via Supabase Auth

**UI Components:**
- @expo/vector-icons 15.0.3 - Icon library (Ionicons)
- @gorhom/bottom-sheet 5.2.8 - Bottom sheet modal component
- Clsx 2.1.1 - Conditional className utilities
- Tailwind Merge 3.4.0 - Tailwind class merging

**Native Modules:**
- Expo Constants 18.0.13 - App constants and metadata
- Expo Font 14.0.11 - Custom font loading
- Expo Haptics 15.0.8 - Haptic feedback
- Expo Linking 8.0.11 - Deep linking support
- Expo Splash Screen 31.0.13 - Splash screen management
- Expo Status Bar 3.0.9 - Status bar customization

**Utilities:**
- React Native Safe Area Context 5.6.0 - Safe area handling
- React Native Screens 4.16.0 - Native screen management
- React Native URL Polyfill 3.0.0 - URL polyfill for React Native
- React Native Worklets 0.5.1 - Worklet runner for Reanimated
- Babel Preset Expo 54.0.10 - Babel configuration for Expo

## Configuration

**Environment:**
- Expo-based environment variables (EXPO_PUBLIC_* prefix)
- Required vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Location: `.env` file (secrets not readable)
- Storage adapter switches between platforms:
  - Web: localStorage (via `WebStorageAdapter` in `lib/supabase.ts`)
  - Native: Expo Secure Store (via `NativeStorageAdapter`)

**Build:**
- Babel config: `babel.config.js` - Uses babel-preset-expo with nativewind
- Metro config: `metro.config.js` - Bundler configuration with NativeWind integration
- Expo config: `app.json` - Expo project manifest and platform-specific settings

## Platform Configuration

**iOS:**
- Bundle ID: `com.tapzi.app`
- Tablet support: Yes
- Google Maps API Key: Configured in `app.json` (ios.config.googleMapsApiKey)
- Permissions: Location when in use (requested in permission string)
- Non-exempt encryption: Disabled

**Android:**
- Package: `com.tapzi.app`
- Adaptive icons: Configured with foreground and background images
- Edge-to-edge display: Enabled
- Google Maps API Key: Configured in `app.json` (android.config.googleMaps.apiKey)
- Permissions: Audio recording, fine location, coarse location
- Google Play Console Project ID: 736a549c-35cd-4d81-8644-72075004b1d0 (EAS)

**Web:**
- Bundler: Metro
- Support via React Native Web 0.21.0

## TypeScript Configuration

**Base:** Expo tsconfig.base
**Strict Mode:** Disabled (strict: false)
**Path Aliases:** `@/*` → root directory
**Includes:** All `.ts`, `.tsx` files, expo types, nativewind types

## Development & Build Tools

**Development:**
- Expo CLI - Project management and development server
- EAS Build - Cloud build service for iOS/Android (Project ID in app.json)
- Metro Bundler - JavaScript bundler (via Expo)

**Build Scripts:**
```
npm start              # Start Expo development server
npm run ios           # Build and run iOS simulator
npm run android       # Build and run Android emulator
npm run web           # Run web version
```

---

*Stack analysis: 2026-03-17*
