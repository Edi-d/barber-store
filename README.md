# BarberApp

Aplicație mobilă React Native pentru cursuri de barber, feed video TikTok-like, shop și live streaming.

## Tech Stack

- **React Native** (Expo SDK 54)
- **expo-router** - File-based navigation
- **NativeWind** - Tailwind CSS pentru React Native
- **Supabase** - Backend (Auth, Database, Storage)
- **Zustand** - State management
- **React Query** - Data fetching & caching

## Setup

### 1. Instalare dependențe

```bash
npm install
```

### 2. Configurare Supabase

1. Creează cont pe [supabase.com](https://supabase.com)
2. Creează un proiect nou
3. Din Dashboard > Settings > API, copiază:
   - Project URL
   - anon public key

4. Creează fișierul `.env` în root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Configurare Database

În Supabase Dashboard > SQL Editor, execută fișierele din `migrations/`:

1. `001_initial_schema.sql` - Creează toate tabelele
2. `002_storage_buckets.sql` - Configurează storage-ul

### 4. Creare Storage Buckets

În Supabase Dashboard > Storage, creează 4 bucketuri:

- `avatars` (public)
- `content` (public)
- `course_media` (public)
- `product_images` (public)

### 5. Pornire aplicație

```bash
# Pornește Expo dev server
npm start

# Sau direct pentru platformă specifică
npm run ios
npm run android
npm run web
```

## Structura Proiect

```
app/                    # Expo Router screens
├── (auth)/            # Auth screens (login, signup, etc.)
├── (tabs)/            # Tab navigation (feed, courses, shop, profile)
├── course/[id].tsx    # Course detail
├── lesson/[id].tsx    # Lesson player
├── product/[id].tsx   # Product detail
├── cart.tsx           # Shopping cart
├── checkout.tsx       # Checkout flow
├── orders.tsx         # Order history
├── go-live.tsx        # Go Live scaffold
└── settings.tsx       # User settings

components/
├── ui/                # Reusable UI components
└── feed/              # Feed-specific components

lib/                   # Utilities & configs
stores/                # Zustand stores
types/                 # TypeScript types
migrations/            # SQL migrations
```

## Features MVP

- ✅ Auth (Email/Password)
- ✅ Profile (Edit, Avatar)
- ✅ Feed TikTok-like (Vertical scroll, Video player, HUD)
- ✅ Cursuri (List, Detail, Lessons, Progress tracking)
- ✅ Shop (Products, Cart, Checkout, Orders)
- ✅ Go Live (Scaffold - UI + DB entry)

## Phase 2 (Coming Soon)

- 🔄 Live streaming real (AWS IVS / Mux)
- 🔄 Stripe payments
- 🔄 Push notifications
- 🔄 Comments modal
- 🔄 RLS policies

## Development

```bash
# Verifică TypeScript
npx tsc --noEmit

# Clear cache
npx expo start -c
```
