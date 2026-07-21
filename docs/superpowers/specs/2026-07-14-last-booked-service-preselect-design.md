# Last-Booked Service Preselection — Design

**Date:** 2026-07-14
**Status:** Approved

## Goal

When a user opens the booking wizard for a salon + barber they've booked before, the service(s) from their most recent appointment are moved to the top of the Step 2 services list, visually marked, and preselected — so rebooking the usual thing takes zero taps on the services step.

## Decisions (confirmed with Edi)

- **Source appointment:** the most recent **non-cancelled** appointment (any status except `cancelled`, upcoming included).
- **Matching:** exact salon + barber match preferred; **salon-level fallback** to the last appointment with any barber at that salon, keeping only services the selected barber actually offers.
- **Multi-service appointments:** preselect **all** services of that appointment (in their original `sort_order`), skipping any the barber no longer offers.
- **Visual treatment:** card(s) move to the **top** of the list, get an in-card **„Ultima rezervare" badge**, and are preselected.
- **Data source:** Supabase query hook (not local storage, not a new RPC).

## Architecture

### 1. New hook — `hooks/useLastBookedServices.ts`

- Signature: `useLastBookedServices(salonId: string | null | undefined, barberId: string | null | undefined)`.
- TanStack Query keyed `["last-booked-services", userId, salonId]`, `enabled: !!session && !!salonId`.
- Single fetch of the user's recent appointments at the salon:
  - `from("appointments")` selecting `id, barber_id, service_id, scheduled_at` (status is filtered server-side, not projected), embedding `barber:barbers!inner(salon_id)` (appointments have no `salon_id` column — filter via `.eq("barber.salon_id", salonId)`) and `services:appointment_services(service_id, sort_order)`.
  - `.eq("user_id", session.user.id)`, `.neq("status", "cancelled")`, `.order("scheduled_at", { ascending: false })`, `.limit(25)`.
  - Also embeds `salon_client:salon_clients(managed_by_profile_id)`; rows with a non-null `managed_by_profile_id` are appointments booked **for a dependent/guest** (migration 115) and are filtered out — only the account holder's own visits drive preselection.
- Derivation is client-side in a `useMemo` over `(data, barberId)` so switching barbers in Step 1 reuses the cached fetch:
  - First row with `barber_id === barberId` → `source: 'barber'`.
  - Else first row of any barber → `source: 'salon'`.
  - Service ids come from `services[]` sorted by `sort_order`; fallback to legacy `service_id` when the junction rows are absent.
- Returns `{ serviceIds: string[]; source: 'barber' | 'salon' | null; isLoading }`. Empty result → `{ serviceIds: [], source: null }`.

### 2. Wizard integration — `app/book-appointment.tsx`

- **Reorder:** new `useMemo` producing `orderedServices` from `visibleServices`: services whose id is in `serviceIds` (intersection keeps only active + barber-offered ones) move to the front preserving their appointment order; the rest keep the existing `price_cents` ascending order. Step 2 renders `orderedServices`; the existing `SERVICE_LIST_LAYOUT` spring layout animates the move.
- **Preselect effect:** mirrors the existing route-param auto-apply (`book-appointment.tsx:630-689`). Fires when: barber selected, services loaded, hook resolved with a non-empty intersection. Guards (all must hold):
  - No `serviceId`/`serviceIds` route params AND no `rescheduleId` — explicit intent wins and disables the feature entirely (both preselect **and** reorder/badge).
  - `selectedServices` is empty AND the user has not manually toggled any service yet (a `hasUserTouchedServicesRef` set inside the toggle handler).
  - Applies only to the main user's selection (`activePersonKey === 'me'` semantics), never guests.
  - Re-evaluates when the selected barber changes, as long as the selection is still untouched.
- Preselecting calls the same state setter as the param path (`setSelectedServices(resolved)`) so downstream (packages hint, totals, step validation) behaves identically.

### 3. Badge — `components/shared/ServiceCard.tsx`

- New optional prop `isLastBooked?: boolean`.
- Renders a small „Ultima rezervare" pill inside the card, following the package-hint pattern from commit `263b398` (quiet in-card pill, does not intercept card toggle).
- Shown on all cards that were top-sorted by this feature, independent of current selection state (stays visible if the user deselects).

## Data flow

1. Wizard mounts with `salonId` (param or derived from barber) → hook fetches recent salon appointments once.
2. User picks a barber (or arrives with `barberId` param) → derivation picks exact-match else salon-fallback service ids.
3. `orderedServices` re-sorts; effect preselects; cards render badge via `isLastBooked`.
4. User can deselect/change anything — the ref guard prevents re-application.

## Edge cases

| Case | Behavior |
| --- | --- |
| Service deleted / `active=false` / not assigned to the barber | Dropped from intersection; if none survive → no reorder, no badge, no preselect |
| Deep-link with `serviceId`/`serviceIds` | Feature fully disabled (params drive selection) |
| Reschedule (`rescheduleId`) | Feature fully disabled |
| Guest booking selections | Untouched; feature only touches the main user's selection |
| Last appointment was booked for a dependent (`salon_client.managed_by_profile_id` set) | Skipped — the holder's own most recent visit is used instead |
| No history at salon | Hook returns empty → normal behavior |
| Query error | Treated as no history (non-blocking; wizard works as today) |
| „Rezervă din nou" / Book another (same mounted screen) | Feature re-arms: the touched-ref resets and the original deep-link/reschedule intent counts as spent, so the fresh booking gets preselection again (now sourced from the appointment just made) |

## Testing

No automated test runner exists in this repo. Manual QA checklist:

1. Book service X with barber A → reopen salon → barber A → X is top, badged, preselected.
2. Multi-service booking → all its services top-sorted + preselected.
3. Pick barber B (no history) at the same salon → salon fallback applies only if B offers the service(s).
4. Deep-link from salon services tab with an explicit service → no badge/reorder, param behavior unchanged.
5. Reschedule an appointment → unchanged behavior.
6. Cancel the latest appointment → the previous non-cancelled one drives preselection.
7. Deselect the preselected service, navigate steps back/forward → it does not reselect itself.
