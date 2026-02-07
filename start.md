# BarberApp — Project Start (React Native + Supabase)

Scop: aplicație mobile cu:
- **Go Live** (creatorii pornesc live din app) — *scaffold acum, streaming provider mai târziu*
- **Scrolling feed** (TikTok-like) cu HUD (pentru video/live)
- **Cursuri de barber** (catalog + lecții + progres)
- **Shop** (produse barber + comenzi)
- **Profile**

> Stack: React Native + Supabase (Auth, DB, Storage, Realtime, Edge Functions).  
> Dev: Cursor (coding assistant), repo Git.

---

## 1) MVP scope (Phase 1)
### Must-have
- Onboarding + Auth (Sign up / Login / Forgot)
- Profile (edit profil, avatar)
- Feed scroll cu video items (fără live real la început) + HUD (like, comment, share placeholder)
- Cursuri: listă cursuri, detail, lecții, mark as completed, progres
- Shop: listă produse, product detail, coș, checkout (placeholder), orders history
- Admin/Creator roles (minim) + gating pentru “Go Live” (doar creators)

### Nice-to-have (Phase 2)
- Live streaming real (AWS IVS / Mux / Cloudflare / GCP) + chat realtime + gifts
- Payments complet (Stripe)
- Recomandări feed (ranking)
- Notifications push (follow, new lesson, promo)

---

## 2) App pages (navigation map)
### Auth
- `Welcome`
- `SignUp`
- `Login`
- `ForgotPassword`
- `Onboarding` (pick username, interests, accept T&C)

### Core Tabs
- `Feed` (scroll vertical)
- `Courses`
- `Shop`
- `Profile`

### Additional
- `GoLive` (creator only) — **scaffold**
- `CourseDetail` → `LessonPlayer`
- `ProductDetail` → `Cart` → `Checkout`
- `Orders`
- `Settings` (account, privacy, logout)
- `Report/Block` (safety)

---

## 3) UX notes (TikTok-like feed)
- Full-screen vertical `FlatList` cu `pagingEnabled`.
- Rule: **doar item-ul activ** rulează player-ul (others paused).
- HUD overlay:
  - dreapta: like, comment, share, save
  - jos: username, caption, tags
  - sus: search / filter (optional)
- Tracking:
  - `view_start`, `view_end`, `watch_time_ms`
  - likes/comments/save events

---

## 4) “Go Live” page (scaffold acum)
### UI
- Title input (ex: “Fade tutorial live”)
- Cover image optional
- Toggle: public/private
- Button: **Start Live** (în MVP -> creează entry în DB + status `starting`, fără video real)
- Button: **End Live** (status `ended`)

### Logic (Phase 1)
- “Start Live” = creezi rând în `lives` (fără playback_url)
- Feed poate afișa live placeholder card (ex: “LIVE (coming soon)”)

### Logic (Phase 2)
- Integrezi provider (IVS/Mux etc.) și completezi:
  - `ingest_url`, `stream_key`, `playback_url`, `status=live`
  - Chat pe Supabase Realtime

---

## 5) Cursuri (Barber Academy)
### Model
- Course → Module → Lesson
- Lesson types:
  - video (mp4/hls url)
  - text (markdown)
  - quiz (optional)
- Progres per user:
  - lessons completed
  - last seen timestamp

### UI
- Courses list (cards)
- Course detail (overview + curriculum)
- Lesson player (video + notes + next lesson)
- Progress bar (course completion)

---

## 6) Shop (Barber products)
### MVP flow
- Catalog produse
- Product detail
- Cart (local + sync)
- Checkout placeholder:
  - în MVP: “cash on delivery / manual order” sau “request order”
- Orders history

### Phase 2
- Stripe checkout
- Shipping addresses
- Coupons, inventory

---

## 7) Profile
- Public profile: avatar, username, bio, followers, following
- Creator badge (role-based)
- Tabs:
  - Saved
  - Purchases (orders)
  - Progress (courses)
- Settings: logout, delete account (optional)

---

## 8) Supabase data model (tables)
### Auth / Users
- `profiles`
  - `id uuid PK` (= auth.users.id)
  - `username text UNIQUE`
  - `display_name text`
  - `avatar_url text`
  - `bio text`
  - `role text` enum: `user | creator | admin | moderator`
  - `created_at timestamptz`

### Feed content (Phase 1 video posts)
- `content`
  - `id uuid PK`
  - `author_id uuid FK -> profiles.id`
  - `type text` enum: `video | image | text | live_placeholder`
  - `caption text`
  - `media_url text`
  - `thumb_url text`
  - `status text` enum: `draft | published | hidden`
  - `created_at timestamptz`

- `likes`
  - `user_id uuid`
  - `content_id uuid`
  - `created_at timestamptz`
  - PK (`user_id`, `content_id`)

- `comments`
  - `id uuid PK`
  - `content_id uuid`
  - `user_id uuid`
  - `text text`
  - `created_at timestamptz`

### Lives (scaffold)
- `lives`
  - `id uuid PK`
  - `host_id uuid FK -> profiles.id`
  - `title text`
  - `status text` enum: `starting | live | ended`
  - `provider text` nullable
  - `playback_url text` nullable
  - `started_at timestamptz` nullable
  - `ended_at timestamptz` nullable
  - `created_at timestamptz`

### Courses
- `courses`
  - `id uuid PK`
  - `title text`
  - `description text`
  - `cover_url text`
  - `is_premium boolean`
  - `created_at timestamptz`

- `course_modules`
  - `id uuid PK`
  - `course_id uuid FK`
  - `title text`
  - `order int`

- `lessons`
  - `id uuid PK`
  - `module_id uuid FK`
  - `title text`
  - `type text` enum: `video | text`
  - `content_url text` (video url or markdown file)
  - `duration_sec int` nullable
  - `order int`

- `lesson_progress`
  - `user_id uuid`
  - `lesson_id uuid`
  - `completed boolean`
  - `last_position_sec int` nullable
  - `updated_at timestamptz`
  - PK (`user_id`, `lesson_id`)

### Shop
- `products`
  - `id uuid PK`
  - `title text`
  - `description text`
  - `price_cents int`
  - `currency text`
  - `image_url text`
  - `stock int` nullable
  - `active boolean`
  - `created_at timestamptz`

- `carts`
  - `user_id uuid PK`
  - `updated_at timestamptz`

- `cart_items`
  - `user_id uuid`
  - `product_id uuid`
  - `qty int`
  - PK (`user_id`, `product_id`)

- `orders`
  - `id uuid PK`
  - `user_id uuid FK`
  - `status text` enum: `pending | paid | shipped | cancelled`
  - `total_cents int`
  - `currency text`
  - `created_at timestamptz`

- `order_items`
  - `order_id uuid`
  - `product_id uuid`
  - `qty int`
  - `price_cents int`
  - PK (`order_id`, `product_id`)

### Safety / Moderation (minim)
- `reports`
  - `id uuid PK`
  - `reporter_id uuid`
  - `target_type text` (`content|comment|user|live`)
  - `target_id uuid`
  - `reason text`
  - `status text` (`open|reviewed|closed`)
  - `created_at timestamptz`

- `blocks`
  - `blocker_id uuid`
  - `blocked_id uuid`
  - `created_at timestamptz`
  - PK (`blocker_id`, `blocked_id`)

### Analytics (optional, dar recomandat)
- `events`
  - `id uuid PK`
  - `user_id uuid`
  - `event_type text` (view_start, view_end, like, comment, add_to_cart, purchase, lesson_complete)
  - `entity_type text` (content, product, lesson, live)
  - `entity_id uuid`
  - `meta jsonb`
  - `created_at timestamptz`

---

## 9) Storage buckets (Supabase)
- `avatars/` (public read)
- `content/` (video/thumbs)
- `course_media/` (course covers, lesson videos)
- `product_images/`

> Pentru MVP poți ține video-urile în Storage + `react-native-video` playback.  
> Pentru scale: transcoding + HLS ulterior.

---

## 10) RLS policy plan (high-level)
- `profiles`: public read (minim: username, avatar), owner can update own row.
- `content`: public read where `status=published`; only author can insert/update own.
- `likes/comments`: only logged-in users; delete only own.
- `courses/modules/lessons`: public read (sau premium gating).
- `lesson_progress`: user can read/write only own.
- `products`: public read where `active=true`; admin can manage.
- `carts/cart_items`: user only.
- `orders/order_items`: user only; admin read.
- `lives`: public read where status in (starting/live) (Phase 1), creator only insert.
- `reports/blocks`: user create; admin/moderator read.

---

## 11) Edge Functions (API endpoints)
- `auth_post_signup` (optional: auto-create profile)
- `profile_update`
- `content_create` / `content_publish`
- `feed_list` (paginated, filters)
- `live_start` / `live_end` (stub)
- `course_progress_update`
- `cart_update`
- `order_create` (MVP: pending)
- `report_create`
- `events_batch` (trimite events in bulk)

---

## 12) React Native folder structure (suggestion)
