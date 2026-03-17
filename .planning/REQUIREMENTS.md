# Requirements: Tapzi — Social Media Features

**Defined:** 2026-03-17
**Core Value:** Clienții pot urmări barberii lor preferați în timp real — live streams, stories, și un feed social care se actualizează instant.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Realtime Infrastructure

- [ ] **RT-01**: Feed-ul se actualizează automat când apar likes/comments noi (fără refresh manual)
- [ ] **RT-02**: Posturi noi apar ca banner "N posturi noi — apasă pentru a vedea" fără refresh
- [x] **RT-03**: Subscription-urile Realtime se curăță corect la logout (fix security gap existent)
- [x] **RT-04**: Supabase Realtime subscription registry cu cleanup centralizat

### Stories

- [ ] **STORY-01**: Barberii pot posta photo stories care apar în stories row
- [ ] **STORY-02**: Barberii pot posta video stories (max 30s) cu upload resumabil (TUS)
- [ ] **STORY-03**: Clienții pot vizualiza stories cu progress bar, tap next/back, hold to pause
- [ ] **STORY-04**: Stories se grupează per creator cu swipe între creators
- [x] **STORY-05**: Stories expiră automat după 24h (query filter + pg_cron cleanup + storage cleanup)
- [ ] **STORY-06**: Ring colorat pe avatar indică story nevăzut (blue) vs văzut (none) via story_views table
- [ ] **STORY-07**: Video stories sunt comprimate înainte de upload (reduce bandwidth)

### Live Streaming

- [ ] **LIVE-01**: Barberii pot starta un live broadcast video+audio (LiveKit integration)
- [ ] **LIVE-02**: Clienții pot viziona live stream-uri în timp real cu video player
- [ ] **LIVE-03**: Viewer count se actualizează realtime via Supabase Presence
- [ ] **LIVE-04**: Text chat în timpul live-ului via Supabase Broadcast (ephemeral, fără persistare)
- [ ] **LIVE-05**: Secțiunea de live-uri pe home se populează cu date reale (nu placeholder)
- [x] **LIVE-06**: LiveKit token generation via Supabase Edge Function (server-side)
- [x] **LIVE-07**: Expo dev build configurat cu LiveKit native modules

### Barber App (tapzi-barber)

- [ ] **BARBER-01**: Go-live screen — barberul configurează titlu, cover, vizibilitate și pornește broadcast video+audio
- [ ] **BARBER-02**: Live broadcast screen cu camera preview, controls (mute, flip camera), viewer count, end stream
- [ ] **BARBER-03**: LiveKit publisher integration — barberul publică video+audio tracks
- [ ] **BARBER-04**: Expo dev build pe tapzi-barber cu LiveKit native modules
- [ ] **BARBER-05**: Story creation — barberul poate posta photo/video stories din tapzi-barber

### Infrastructure

- [x] **INFRA-01**: Supabase Pro upgrade activat (prerequisite pentru Realtime)
- [x] **INFRA-02**: Expo dev build setup cu EAS pe ambele app-uri (necesar pentru LiveKit native modules)
- [x] **INFRA-03**: LiveKit Cloud account setup cu API keys

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Stories Enhancements

- **STORY-V2-01**: Story highlights — creators pot salva collections pe profil permanent
- **STORY-V2-02**: Story likes/reactions
- **STORY-V2-03**: Story replies (DM-style)
- **STORY-V2-04**: Text overlays, stickers, drawing tools pe stories

### Live Enhancements

- **LIVE-V2-01**: Emoji reactions overlay în live stream
- **LIVE-V2-02**: Live chat message history (persistat în DB)
- **LIVE-V2-03**: Booking CTA în live viewer ("Book this barber")
- **LIVE-V2-04**: Multi-camera support

### Notifications

- **NOTIF-V2-01**: Push notifications pentru live start (FCM/APNs)
- **NOTIF-V2-02**: Push notifications pentru story nou
- **NOTIF-V2-03**: In-app notification center

## Out of Scope

| Feature | Reason |
|---------|--------|
| Audio-only rooms | Barbershops sunt vizuale, nu audio. Adaugă complexitate SDK fără câștig |
| Video calling 1:1 | Produs diferit (consultații). Live = broadcast, nu conversație |
| Creator posting UI for stories | App de client — creators postează din admin/alt tool |
| Story analytics | Dashboard de creator, nu client app |
| Monetizare/tips în live | Payment integration + legal compliance. Milestone separat |
| Push notifications | Necesită FCM/APNs setup. Milestone separat |
| Comments pe stories | High UX complexity pe conținut efemer |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RT-01 | Phase 2 | Pending |
| RT-02 | Phase 2 | Pending |
| RT-03 | Phase 2 | Complete |
| RT-04 | Phase 2 | Complete |
| STORY-01 | Phase 3 | Pending |
| STORY-02 | Phase 3 | Pending |
| STORY-03 | Phase 3 | Pending |
| STORY-04 | Phase 3 | Pending |
| STORY-05 | Phase 3 | Complete |
| STORY-06 | Phase 3 | Pending |
| STORY-07 | Phase 3 | Pending |
| LIVE-01 | Phase 4 | Pending |
| LIVE-02 | Phase 4 | Pending |
| LIVE-03 | Phase 4 | Pending |
| LIVE-04 | Phase 4 | Pending |
| LIVE-05 | Phase 4 | Pending |
| LIVE-06 | Phase 4 | Complete |
| LIVE-07 | Phase 4 | Complete |
| BARBER-01 | Phase 4 | Pending |
| BARBER-02 | Phase 4 | Pending |
| BARBER-03 | Phase 4 | Pending |
| BARBER-04 | Phase 4 | Pending |
| BARBER-05 | Phase 3 | Pending |
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 — traceability complete after roadmap creation*
