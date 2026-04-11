# Social/Feed Architecture — barber-store (Consumer App)

**Date:** 2026-03-30
**Scope:** Feed, Stories, Lives, Comments, Notifications, Realtime
**App model:** Client-only consumer app. Users read, like, comment, and follow. They do not post content.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Flow: Supabase to Components](#2-data-flow-supabase-to-components)
3. [Realtime Architecture](#3-realtime-architecture)
4. [State Management](#4-state-management)
5. [Navigation Structure](#5-navigation-structure)
6. [Component Hierarchy](#6-component-hierarchy)
7. [LiveKit Integration](#7-livekit-integration)
8. [Missing Pieces vs. tapzi-barber (Creator App)](#8-missing-pieces-vs-tapzi-barber-creator-app)
9. [Recommendations for New Features](#9-recommendations-for-new-features)
10. [Performance Considerations](#10-performance-considerations)

---

## 1. System Overview

The app is a React Native / Expo (file-based routing) application using:

- **Expo Router v3** for navigation (file-system routes, Stack + Tabs)
- **TanStack React Query v5** for all server-state (feed, comments, stories, follows)
- **Zustand** for client-only global state (auth session/profile, cart, UI flags)
- **Supabase** as the backend (Postgres, Auth, Realtime, Storage, Edge Functions)
- **LiveKit** for WebRTC live video playback (native module, guarded against Expo Go)
- **NativeWind / Tailwind** for styling with a custom `Bubble` design token system
- **Reanimated 3 + Gesture Handler 2** for animations and gestures

The feed screen is the primary social surface. It composes five concerns in a single scrollable view: stories, live streams, the post feed, comments, and notifications. Each concern is isolated into its own hook and component.

---

## 2. Data Flow: Supabase to Components

### 2.1 Feed Posts

The feed uses cursor-based infinite pagination via `useInfiniteQuery` with the query key `["feed"]`. Each page fetches 10 posts ordered by `created_at DESC`, joined with the author profile. A second, parallel query fetches the set of `content_id` values the current user has liked within each page, which is merged onto each item as `is_liked`.

The cursor is the `created_at` timestamp of the last item on the previous page (`lt` filter). This is a time-based cursor, which means posts inserted during an active session will silently appear in subsequent pages only if the user triggers a refresh — new posts are surfaced instead through the realtime `NewPostsBanner`.

The `followingIds` set is a separate `useQuery` keyed by `["following", userId]`. It is fetched once per session and kept in sync through optimistic updates in the follow mutation.

```
Supabase (content table, profiles join)
  --> useInfiniteQuery(["feed"])
  --> feedItems = pages.flatMap(page => page)   [flat array, all pages]
  --> FlatList (renders FeedCard per item)

Supabase (likes table, filtered by user + content IDs)
  --> merged as is_liked onto each ContentWithAuthor

Supabase (follows table)
  --> useQuery(["following", userId])
  --> followingIds Set<string>
  --> passed as prop to each FeedCard
```

### 2.2 Stories

Stories use a single `useQuery(["stories", userId])` with a 30-second stale time. The query function calls `fetchStoriesWithSeenState(userId)` in `lib/stories.ts`, which does a single Supabase query joining `stories` with `profiles` and a LEFT JOIN on `story_views`. The join result is normalized client-side into `StoryGroup[]`, sorted with unseen groups first.

Marking a story viewed calls a `useMutation` that upserts into `story_views` and then invalidates the `["stories", userId]` query to re-sort groups.

```
Supabase (stories + profiles + story_views LEFT JOIN)
  --> fetchStoriesWithSeenState()
  --> useQuery(["stories", userId])
  --> StoryGroup[] (grouped by author, sorted unseen-first)
  --> StoriesRow (horizontal scroll)
  --> StoryViewer (full-screen modal)
```

### 2.3 Lives

Lives do not use React Query. They are managed entirely in local component state inside `useRealtimeLives`. An initial fetch populates the list, and then a Supabase Realtime subscription keeps it live. When no active streams exist, `feed.tsx` falls back to hardcoded placeholder cards so the `LiveSection` always renders.

```
Supabase (lives table, status IN ['live', 'starting'])
  --> useRealtimeLives() --> { lives: LiveWithHost[], loading }
  --> displayLives = realtimeLives.length > 0 ? realtimeLives : PLACEHOLDER_LIVES
  --> LiveSection (horizontal scroll)
  --> AllLivesModal (pageSheet, 2-column grid)
  --> router.push('/live/[id]') (full-screen LiveKit player)
```

### 2.4 Comments

Comments are fetched inside `CommentsModal` using `useInfiniteQuery(["comments", contentId])` with page size 20. Top-level comments and their replies are fetched together and shaped into `CommentWithReplies[]`. The modal is opened imperatively — `feed.tsx` stores the selected `ContentWithAuthor` in local state (`commentsItem`), passes it as a prop, and the modal queries by `item.id`.

### 2.5 Notifications

Notifications are managed by `useNotifications()` using local state (not React Query). The hook fetches 50 notifications on mount, then subscribes to realtime inserts for the current user. The `unreadCount` is derived by filtering the array client-side. The bell badge in the header reacts to `unreadCount` from this hook.

---

## 3. Realtime Architecture

### 3.1 Channel Registry

All realtime subscriptions go through `lib/realtime.ts`, which maintains a module-level `Map<string, RealtimeChannel>`. The two exported primitives are `getOrCreateChannel(name)` and `removeChannel(name)`. This prevents React StrictMode's double-mount from creating duplicate WebSocket subscriptions. `cleanupAllChannels()` is called on sign-out inside `authStore`.

### 3.2 Active Channels Per Session

| Channel Name | Table | Events | Purpose |
|---|---|---|---|
| `feed:content` | `content` | UPDATE, INSERT, DELETE | Push count updates to feed cache; show new-post banner; remove deleted posts |
| `realtime-lives` | `lives` | INSERT, UPDATE, DELETE | Keep active stream list live |
| `feed:comments` | `comments` | INSERT | Fast increment of `comments_count` in feed cache; invalidate open comments modal |
| `feed:likes:{userId}` | `likes` | INSERT, DELETE | Confirm or correct optimistic like state in feed cache |
| `notifications-{userId}` | `notifications` | INSERT | Push incoming notifications into the hook's local state |

Five channels total per authenticated user session. All are app-level (not per-component), mounted when their respective hooks first run and torn down on unmount or sign-out.

### 3.3 Update Strategies

**Feed content UPDATEs (likes_count, comments_count):** These can arrive in rapid bursts when a post goes viral. `useRealtimeFeed` batches them into a `pendingUpdates` Map and flushes every 100ms via `setTimeout`. This prevents React from re-rendering the entire feed list on every individual like event.

**Like mutations:** Double-written intentionally. The `likeMutation` in `feed.tsx` does an optimistic update immediately (modifying `["feed"]` cache), and then `useRealtimeLikes` confirms or corrects the `is_liked` flag once the database event arrives. A `pendingLikeIds` ref guards against starting a second mutation on the same item while one is in-flight.

**Lives viewers_count:** Updated in-place inside the `setLives` updater function without a network round-trip. Scalar fields from the realtime payload are spread directly onto the existing `LiveWithHost` object.

**New post banner:** INSERTs into `content` increment a ref counter and update a `newPostCount` state. Pressing the banner calls `queryClient.invalidateQueries(["feed"])`, which re-fetches from the top. The banner does not prepend items directly to avoid re-ordering issues.

### 3.4 What Does NOT Have Realtime

- Stories — polling via 30s staleTime, no live subscription
- Follows — no realtime, only optimistic UI
- Comments reactions (`comment_reactions` table) — fetched on modal open, no realtime push
- Notifications UPDATE (mark-as-read) — local-only state mutation

---

## 4. State Management

### 4.1 Zustand Stores

| Store | File | What It Owns |
|---|---|---|
| `useAuthStore` | `stores/authStore.ts` | `session`, `profile`, `isInitialized`, auth actions (signIn, signOut, updateProfile) |
| `useCartStore` | `stores/cartStore.ts` | Cart items, total, add/remove/update actions |
| `useUIStore` | `stores/uiStore.ts` | `tabBarHidden` boolean — controls the animated tab bar visibility |
| `useLocationStore` | `stores/locationStore.ts` | User GPS coordinates for the Discover map |

Zustand is used exclusively for state that must persist across navigation boundaries or must be accessed by non-React code (e.g., `cleanupAllChannels` in `authStore.signOut`). It is not used for server data.

### 4.2 React Query Cache

React Query owns all server state. Key namespaces in use:

| Query Key | Content |
|---|---|
| `["feed"]` | `InfiniteData<ContentWithAuthor[]>` — all feed pages |
| `["following", userId]` | `Set<string>` — IDs the user follows |
| `["stories", userId]` | `StoryGroup[]` |
| `["comments", contentId]` | `InfiniteData<CommentsPage>` — paginated comments |
| `["notifications"]` | Not used — notifications are local state |

The global `QueryClient` is created once in `app/_layout.tsx` with `staleTime: 1000 * 60 * 5` (5 minutes). This means data older than 5 minutes will be re-fetched on the next mount, but data within the window will be served from cache without a network round-trip.

### 4.3 Local Component State

Local state (`useState`) is used within screens and modals for:

- `commentsItem` — which feed card's comments to show
- `notifVisible` — notifications modal open/closed
- `viewerVisible` / `viewerStartIndex` — story viewer open state
- `livesModalVisible` — all-lives modal open state
- Animation values (`useSharedValue` in Reanimated)

There is no global modal management system. Each modal is co-located with the screen that owns it.

---

## 5. Navigation Structure

### 5.1 Root Stack

`app/_layout.tsx` defines the root `Stack`. Auth resolution happens before any screen renders: `RootLayoutNav` checks `useAuthStore.isInitialized`. While loading, a branded `LoadingScreen` is shown. The `Stack` screens declared at root level are:

```
Stack (slide_from_right default)
├── index                       -- redirect logic
├── (auth)                      -- welcome, login, signup, onboarding, forgot-password
├── (tabs)                      -- main tab group (see below)
├── course/[id]                 -- slide_from_bottom
├── lesson/[id]
├── salon/[id]
├── product/[id]
├── book-appointment
├── cart                        -- modal presentation
├── checkout                    -- modal presentation
├── orders
├── go-live                     -- modal presentation (creator-only)
├── live/[id]                   -- slide_from_bottom (LiveKit viewer)
├── appointments
├── settings
└── profile/[id]
```

### 5.2 Tab Group

`app/(tabs)/_layout.tsx` uses a fully custom `GlassTabBar` rendered via the `tabBar` prop. The bar is a floating frosted-glass pill with a sliding gradient indicator. It uses `useUIStore.tabBarHidden` to animate itself off-screen when content requests it (e.g., full-screen video). Tab configuration:

| Index | Route | Label | Icon |
|---|---|---|---|
| 0 | `feed` | Acasa | home |
| 1 | `courses` | Cursuri | school |
| 2 | `discover` | Programari | calendar |
| 3 | `shop` | Magazin | bag (+ cart badge) |
| 4 | `profile` | Profil | person |

The initial tab on app open is `discover` (set as `initialRouteName`), not `feed`.

### 5.3 Auth Guard

The auth guard lives in `(tabs)/_layout.tsx`. After initialization, if `session` is null, the layout calls `router.replace("/(auth)/welcome")`. This fires reactively on session expiry and sign-out because `authStore.session` is a reactive Zustand slice.

### 5.4 Deep Links and Modals

Deep links declared in `app.json` use the `tapzi://` scheme. The reset-password link (`tapzi://reset-password`) is the only confirmed deep link target visible in the source. Universal Links are not yet configured.

Modals used in the feed surface:

| Modal | Trigger | Presentation |
|---|---|---|
| `CommentsModal` | Tap "Comenteaza" on any FeedCard | Bottom sheet, 88% screen height, drag-to-dismiss |
| `StoryViewer` | Tap any story avatar in StoriesRow | Full-screen overlay |
| `AllLivesModal` | Tap "See All" in LiveSection | `pageSheet` (native iOS sheet) |
| `NotificationsModal` | Tap bell icon in header | (check component for presentation type) |

---

## 6. Component Hierarchy

### 6.1 Feed Screen Tree

```
FeedScreen (app/(tabs)/feed.tsx)
├── [hooks mounted here]
│   ├── useRealtimeFeed()          -- content channel, new post banner
│   ├── useRealtimeLikes(userId)   -- likes channel
│   ├── useRealtimeComments()      -- comments channel
│   ├── useRealtimeLives()         -- lives channel + local state
│   ├── useStories()               -- React Query ["stories"]
│   ├── useNotifications()         -- local state + notifications channel
│   └── useInfiniteQuery(["feed"]) -- paginated posts
│
├── Header Bar (logo + search button + bell button)
│
├── FlatList
│   ├── ListHeaderComponent (memoized)
│   │   ├── StoriesRow           -- horizontal scroll of story bubbles
│   │   ├── LiveSection          -- horizontal scroll of live cards
│   │   ├── "Toate postarile" label + filter icon
│   │   └── NewPostsBanner       -- appears when new posts arrive via realtime
│   │
│   └── renderItem: FeedCard
│       ├── Author row (avatar, name, verified badge, follow button, more menu)
│       ├── Caption text (max 3 lines)
│       ├── Post image (TapGestureHandler for double-tap-to-like)
│       │   └── Heart overlay animation (Reanimated)
│       ├── Stats row (like count + comment count)
│       └── Action row (Like, Comment, Share)
│           └── Like: particle burst animation (6 Reanimated particles)
│
├── CommentsModal (bottom sheet)
│   ├── Comment list (useInfiniteQuery per contentId)
│   ├── Reply threading (parent_id)
│   ├── Reaction picker (emoji reactions on comments)
│   └── ReactionBubbles per comment
│
├── StoryViewer (full-screen overlay)
│   ├── StoryProgressBar (segmented progress)
│   └── Story media (image/video)
│
├── AllLivesModal (pageSheet)
│   └── 2-column FlatList of ModalLiveCard
│
└── NotificationsModal
```

### 6.2 FeedCard Internal State

`FeedCard` maintains its own local state for the optimistic like experience:

- `liked` (bool) — local shadow of `item.is_liked`, updated immediately on tap
- `displayLikes` (number) — local shadow of `item.likes_count`, updated immediately
- These are synced back from props in a `useEffect` watching `[item.is_liked, item.likes_count]`

This creates a deliberate two-level optimism: the card updates instantly on tap, and the React Query cache update (from the mutation) flows back via the `useEffect`. Realtime corrections from `useRealtimeLikes` also flow through this path.

### 6.3 CommentsModal Structure

The modal is a 88%-height bottom sheet with drag-to-dismiss via Reanimated + GestureDetector. It owns its own infinite query for comments, a text input for posting, reply threading state (`replyTarget`), and edit state (`editingComment`). Comment reactions (`useCommentReactions`, `useCommentLikes`) are loaded per-comment. The `ReactionPicker` and `ReactionBubbles` are separate presentational components imported into the modal.

---

## 7. LiveKit Integration

LiveKit is integrated via `@livekit/react-native`. Because it requires native modules not available in Expo Go, the entire import is wrapped in a conditional `require()` guarded by `Constants.appOwnership !== "expo"`. `registerGlobals()` is called once in `app/_layout.tsx` for proper builds.

The token flow is:

```
live/[id].tsx
  --> fetchLiveKitToken(roomName, canPublish=false)
  --> supabase.functions.invoke("token-livekit")
  --> returns { token, serverUrl }
  --> <LiveKitRoom url={serverUrl} token={token} connect={true}>
```

Consumers always join with `canPublish: false`. Only the creator app (tapzi-barber) publishes. The viewer screen also uses `useLiveViewers` and `useLiveChat` hooks (separate from the feed hooks) for the live-specific UI.

---

## 8. Missing Pieces vs. tapzi-barber (Creator App)

This section describes capabilities present in the creator app that are absent or incomplete in the consumer app.

### 8.1 Content

**Video playback in the feed.** The `content` table has a `type` field supporting `"video"`, but `FeedCard` only renders `<Image>`. There is no video player in the feed. The `media_url` and `thumb_url` fields exist and are populated by creators, but consumers always see a static thumbnail regardless of content type.

**Content type filtering.** The feed header has a filter icon (Ionicons `options-outline`) that is wired to a `Pressable` with no `onPress` handler. There is no active filter or sort UI.

**Hashtag rendering in captions.** The database has a `043_hashtags.sql` migration, and captions contain hashtags, but `FeedCard` renders captions as plain `Text` with no tappable hashtag spans.

**Full post detail view.** Tapping a post opens nothing — there is no `post/[id]` route. The only navigation from a card is to the author's profile.

### 8.2 Discovery

**Search.** The search button in the feed header navigates to `/(tabs)/discover`, which is the map/booking screen — not a search UI. There is no dedicated search screen for content, hashtags, or creators. The database has `040_full_text_search.sql` and `041_trending_topics.sql` migrations ready, as well as a `search_vector` column on both `profiles` and `content`, but no client-side search feature consumes them.

**Trending / Explore.** No explore or trending page exists. The migrations for trending topics are in place but unused.

### 8.3 Profiles

**Public creator profiles.** `profile/[id]` exists as a route in the Stack but there is no file at `app/profile/[id].tsx` — it is listed as an untracked new file in git status (`?? app/profile/`), meaning it exists but is not yet complete or may be a directory. Profile navigation from `FeedCard` pushes to `/profile/${authorId}` for other users, but the destination screen's state is unknown.

**Follower/following counts.** The `profiles` table has `followers_count` and `following_count` columns, but these are not surfaced anywhere in the feed card or header UI.

**Verified badge logic.** Verification uses `role === 'creator' || role === 'admin'` as a proxy. The `profiles` table also has a `verified` boolean column (from `039_add_verified_column.sql`) that is not used for badge display.

### 8.4 Social Interactions

**Comment reactions.** The `comment_reactions` table and `useCommentReactions` hook exist and are wired into `CommentsModal`, but the reactions have no realtime subscription. New reactions from other users do not appear until the modal is closed and reopened.

**Post reactions.** Posts only support a single like action. There is no multi-reaction system (emoji picker) on the post itself, only on comments.

**Mention system.** The `027_social_completion.sql` migration suggests a mentions table exists, but `useNotifications` includes `'mention'` as a notification type with no corresponding UI to navigate to the mentioned content.

**Share functionality.** The share button in `FeedCard` calls `Share.share()` with a plain text message. There are no deep links that would allow a recipient to open the specific post, because there is no `post/[id]` route.

### 8.5 Stories

**Story realtime.** Stories use a 30-second polling window only. If a creator posts a new story, it does not appear until the cache expires. There is no realtime subscription on the `stories` table.

**Story expiry.** The `expires_at` filter is applied correctly at query time, but expired stories are not removed from the UI in real-time. The UI would show them until the next stories query.

### 8.6 Notifications

**Push notifications.** `useNotifications` handles in-app realtime only. There is no FCM/APNS push notification configuration. The `hooks/useNotifications.ts` file mentioned in git status is the in-app version. Background or killed-app notifications are not implemented.

**Notification navigation.** The `NotificationsModal` displays notifications but the `target_id` and `target_type` fields are available yet no navigation is wired — tapping a notification does not navigate to the relevant post, profile, or live.

### 8.7 Architecture

**No offline support.** There is no local database (SQLite/WatermelonDB) or queue. If the device loses connectivity, the feed shows stale cache data from React Query's in-memory store, which does not persist across app restarts.

**No React Query persistence.** `QueryClient` is created in memory with no `AsyncStoragePersistor`. Feed data is lost on app restart, forcing a cold fetch every launch.

**No background sync.** Stories, notifications, and lives are only updated while the app is in the foreground.

---

## 9. Recommendations for New Features

### 9.1 Search and Discovery

The infrastructure is already in place. The `search_vector` column on `content` (tsvector) and `profiles` enables full-text search via Supabase's PostgREST `textSearch` filter. The trending topics migration (041) likely exposes a materialized view or function.

Recommended approach:

- Add a `app/search.tsx` screen accessible from the feed header search button (replace the current navigate-to-discover behavior)
- Split into two tabs within the search screen: "Creatori" and "Postari"
- Use a debounced `useQuery` (300ms) that calls `supabase.from('content').select(...).textSearch('search_vector', query)` for posts and the equivalent for profiles
- A "Trending" section below the search bar (before the user types) can consume the trending topics view/function
- Hashtags in captions should become `Pressable` spans that navigate to `app/hashtag/[tag].tsx`

### 9.2 Video Feed

The content table already distinguishes `type: "video"` with a `thumb_url` for the static preview. The recommended implementation:

- Replace the `<Image>` in `FeedCard` with a conditional: image types render `<Image>`, video types render a thumbnail with a play button overlay
- Tapping the thumbnail opens `app/post/[id].tsx` (new route) which renders the full video using `expo-av` or `react-native-video`
- For an auto-playing video feed (TikTok-style), switch the `FlatList` to a `FlashList` with `viewabilityConfig` and play only the video whose card is at least 80% visible. This requires `useRef` on the video player per card and a shared `activeVideoId` context or Zustand atom
- Always use `thumb_url` as the poster frame to avoid layout shift

### 9.3 Hashtag System

- Parse captions in `FeedCard` by splitting on whitespace and identifying tokens starting with `#`
- Render hashtag tokens as `<Pressable>` with the brand primary color
- Navigate to `app/hashtag/[tag].tsx` which runs `useInfiniteQuery` filtering `content` by caption text search or a dedicated `content_hashtags` junction table (migration 043 likely defines this)
- Add hashtags to the `SearchScreen` trending section

### 9.4 Public Creator Profiles

The `app/profile/` directory exists as an untracked file. The recommended profile screen structure:

- Header: cover photo, avatar, name, verified badge (using the `verified` column), follower/following counts, follow button
- Stats row: post count, follower count, following count
- Tab strip: Posts grid (3-column) / About
- Posts grid uses a `FlatList` with `numColumns={3}` querying `content` filtered by `author_id`
- Tapping a grid item navigates to `app/post/[id].tsx`
- The follow/unfollow mutation is the same mutation already in `feed.tsx` — extract it to a shared `useFollowMutation` hook

### 9.5 Post Detail Screen

`app/post/[id].tsx` is missing but needed for share targets, hashtag navigation, and profile grids.

- Fetch the single post by ID, render the full `FeedCard` at the top
- Below it, inline the comments list (not a modal — detail screens scroll naturally)
- Register the route in the root Stack in `app/_layout.tsx`
- Update `FeedCard`'s share button to use `tapzi://post/{id}` deep link format once Universal Links are configured

### 9.6 React Query Persistence

Add `@tanstack/react-query-async-storage-persister` with `AsyncStorage`:

- Feed data survives app restarts, enabling immediate content display on cold start
- Set `maxAge` to match the staleTime (5 minutes) to avoid serving data that is too old
- Mark the `["following", userId]` and `["stories", userId]` queries as persistable; the notification state should remain local-only

### 9.7 Push Notifications

The notification type system (`like`, `comment`, `reply`, `follow`, `mention`, `live`) is already defined. To wire up push:

- Integrate `expo-notifications` for permission request and token retrieval on app open
- Store the Expo push token in a new `push_tokens` table scoped to `user_id`
- The Supabase edge function or a database trigger on the `notifications` table INSERT event sends the push via the Expo Push API
- On notification tap, parse `target_type` and `target_id` from the notification payload and navigate accordingly using `expo-router`'s `router.push`

### 9.8 Stories Realtime

Add a Supabase Realtime subscription in `useStories` (or a companion `useRealtimeStories` hook) listening to INSERT on the `stories` table. On INSERT, call `queryClient.invalidateQueries(["stories", userId])` to re-fetch. This keeps the stories row current without relying on the 30-second polling window.

---

## 10. Performance Considerations

### 10.1 FlatList and Rendering

The feed `FlatList` renders every item without a windowing library. For feeds with more than ~50 items across multiple pages, this will accumulate memory. Consider migrating to `FlashList` from `@shopify/flash-list`, which recycles cells natively and maintains 60/120 FPS with large datasets. The migration is mostly a drop-in — replace `FlatList` with `FlashList` and provide an `estimatedItemSize` prop (approximately 550–700 for the current card size with a square image).

### 10.2 ListHeaderComponent Memoization

The `listHeader` element in `feed.tsx` is correctly wrapped in `useMemo` with `[storyGroups, displayLives, newPostCount, handleShowNewPosts]` as dependencies. This prevents the Stories and Lives sections from remounting on every feed scroll, which would re-trigger their entrance animations.

### 10.3 Realtime Debouncing

The 100ms batch debounce in `useRealtimeFeed` for UPDATE events is appropriate for current scale. At higher scale (thousands of concurrent likes on a single post), this should be increased to 300–500ms and the update strategy should switch to a polling-only model for counts — treating realtime as a hint to invalidate rather than applying every delta.

### 10.4 Image Loading

Images are loaded with the React Native built-in `<Image>` component. There is no image caching configuration beyond the default native cache. For feed performance:

- Add `FastImage` (`react-native-fast-image`) for aggressive HTTP cache control and priority queuing
- Request appropriately sized images from Supabase Storage using the `transform` query parameter (width, quality) on the `media_url` rather than loading full-resolution images for feed thumbnails

### 10.5 Channel Count and Memory

Five WebSocket subscriptions per session is well within acceptable bounds. Supabase Realtime multiplexes over a single WebSocket connection regardless of channel count. The risk is the `channels` Map in `lib/realtime.ts` growing if channels are not cleaned up properly. The current pattern of calling `removeChannel` in each hook's `useEffect` cleanup is correct. Verifying this with `getChannelCount()` in dev builds would be a useful assertion.

### 10.6 Notification Hook Memory

`useNotifications` loads 50 notifications into local state and keeps them for the session lifetime. The notification array grows by one item per realtime INSERT with no eviction policy. Consider capping the local array at 50 items and dropping older items when new ones arrive, or switching to React Query with `keepPreviousData`.

### 10.7 Video Autoplay (Future)

When video is added to the feed, autoplay must be tightly controlled. Each video player component subscribes to a viewability callback. Only one video should be playing at any moment. A Zustand atom or a React context value tracking `activePostId` is the cleanest approach — each card reads the atom and pauses itself if its ID does not match. All videos must pause when the app backgrounds. Use `AppState` from React Native to detect background/foreground transitions and issue a global pause.

### 10.8 CommentsModal Query Overhead

The modal mounts a new `useInfiniteQuery(["comments", contentId])` every time it opens. If the user opens and closes the modal rapidly for different posts, multiple cache entries accumulate. This is acceptable with React Query's default garbage collection (5-minute window), but can be capped by setting `gcTime: 60_000` on the comments query specifically.

### 10.9 Cold Start

The root layout shows a `LoadingScreen` while fonts load and auth initializes. The font list (10 Euclid Circular A weights) is bundled into the binary via `useFonts`. Font loading is the primary blocker of the splash screen. Consider subsetting the font files to reduce binary size, or lazy-loading the heavier weights (Light, LightItalic) since they are unlikely to be used during the first render frame.

---

*Document generated from source reading of barber-store @ commit 27038ab. Update when new migrations (038+) are reflected in client types.*
