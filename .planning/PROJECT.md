# Tapzi — Social Media Features

## What This Is

Tapzi e o aplicație mobilă (Expo/React Native) pentru clienții de saloane de barbershop/coafor. Barberii și saloanele creează conținut (posturi, stories, live streams), iar clienții consumă, interacționează (like, comment, follow) și descoperă saloane. Acest milestone adaugă live streaming real, stories, și realtime feed updates.

## Core Value

Clienții pot urmări barberii lor preferați în timp real — live streams, stories, și un feed social care se actualizează instant.

## Requirements

### Validated

<!-- Existing capabilities inferred from codebase -->

- ✓ AUTH — Email/password signup, login, logout, password reset, session persistence — existing
- ✓ PROFILES — User profiles with avatar, bio, display name, role system (user/creator/admin/moderator) — existing
- ✓ FEED — Infinite scroll feed with paginated content, author info, verified badges — existing
- ✓ LIKES — Like/unlike with double-tap gesture, particle animations, haptic feedback, optimistic updates — existing
- ✓ COMMENTS — Nested threaded comments with replies, edit/delete, pagination, animations — existing
- ✓ FOLLOW — Follow/unfollow system with rate limiting and optimistic updates — existing
- ✓ SALONS — Salon discovery by type (barber/coafor), location-based search, detail pages — existing
- ✓ BOOKING — Appointment booking system with salon services — existing
- ✓ REVIEWS — Salon reviews with ratings and photos — existing
- ✓ SHOP — Product catalog, cart system with badge, checkout flow — existing
- ✓ COURSES — Educational content with modules, lessons, progress tracking — existing
- ✓ ONBOARDING — User onboarding flow after signup — existing
- ✓ GO-LIVE MVP — Live creation form (title, cover, visibility), DB schema with provider/stream fields — existing (no video)

### Active

<!-- New features for this milestone -->

- [ ] Live streaming — barberii pot face broadcast video+audio, clienții vizionează în timp real
- [ ] Live chat — viewers pot trimite mesaje text în timpul unui live stream
- [ ] Live discovery — secțiunea de live-uri active pe home se populează cu date reale, nu placeholder
- [ ] Stories — barberii pot posta photo/video stories (15-30s video), expiră în 24h
- [ ] Stories viewer — clienții pot vizualiza stories cu progress bar, swipe between stories
- [ ] Realtime feed — likes, comments, new posts apar instant fără refresh via Supabase Realtime
- [ ] Realtime notifications — viewer count live updates, new follower notifications in-app

### Out of Scope

- Stories text overlays/stickers — complexitate prea mare pentru v1, doar photo+video simplu
- Viewer reactions emoji în live — doar text chat pentru simplitate
- Audio-only rooms — focus pe video+audio complet
- Creator/barber-side posting features — aceasta e app-ul de client, barberii postează din altă parte sau din aceeași app dar scopul e consumul
- Push notifications — vor veni într-un milestone viitor
- Monetizare/tips în live — out of scope acum

## Context

- **Aplicație brownfield** — feed, likes, comments, follows deja funcționale cu animații avansate
- **Stack**: Expo 54, React Native 0.81, Supabase (PostgreSQL + Auth + Storage), Zustand, React Query, NativeWind
- **DB schema pentru live** deja există cu câmpuri pentru `provider`, `ingest_url`, `stream_key`, `playback_url`
- **Go-live screen** există ca MVP (form de creare, fără video streaming)
- **Stories row** există pe home dar arată doar avatare creators, fără stories reale
- **Live section** pe home arată placeholder data
- **Supabase**: Momentan free tier, trebuie upgrade la Pro pentru Realtime
- **Design**: Glassmorphism consistent, animații cu Reanimated, haptic feedback

## Constraints

- **Live provider**: LiveKit Cloud (ales după research — open-source, Expo plugin, activ, ieftin)
- **Supabase Pro**: Necesar pentru realtime — userul va face upgrade
- **Dual-app**: Implementare simultană pe `barber-store` (client) și `tapzi-barber` (barber). Ambele share aceeași DB Supabase.
- **tapzi-barber state**: Are deja social tab, stories, feed, LiveSection UI, lives table, camera/audio permissions. Lipsește: go-live broadcast screen, LiveKit publisher.
- **Approach**: Cel mai simplu și robust approach, folosind volt subagents pentru implementare
- **Platform**: iOS + Android (via Expo), cu atenție la native modules pentru live streaming

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LiveKit Cloud | Open-source, Expo plugin, activ SDK, ieftin, no lock-in vs Agora (no plugin, stale, scump) | ✓ Good |
| Supabase Pro upgrade | Necesar pentru Realtime subscriptions (live feed updates) | — Pending |
| Stories 24h expiry | Standard UX pattern, reduce storage costs | — Pending |
| Text-only live chat | Simplitate maximă, fără emoji reactions | ✓ Good |
| Photo + Video stories | 15-30s video max, fără text overlays/stickers | ✓ Good |

---
*Last updated: 2026-03-17 after initialization*
