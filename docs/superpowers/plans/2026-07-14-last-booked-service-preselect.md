# Last-Booked Service Preselection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user opens the booking wizard for a salon+barber they've booked before, their last appointment's service(s) appear at the top of the Step 2 list, badged „Ultima rezervare", and preselected.

**Architecture:** A new TanStack Query hook fetches the user's recent non-cancelled appointments at the salon once (client-side derivation picks exact-barber match, else salon fallback). The wizard reorders its Step 2 list via `useMemo` and auto-preselects via an effect mirroring the existing route-param auto-apply. `ServiceCard` gets an `isLastBooked` badge prop following the package-hint pattern.

**Tech Stack:** Expo / React Native, TypeScript, TanStack Query v5, Supabase (PostgREST), Reanimated. Spec: `docs/superpowers/specs/2026-07-14-last-booked-service-preselect-design.md`.

## Global Constraints

- Badge copy is exactly „Ultima rezervare" (Romanian, no trailing punctuation).
- **No per-task commits.** Edi's standing preference: implement end-to-end, one commit at the very end (orchestrator does it). Ignore any commit steps implied by skills.
- No test runner exists in this repo. Each task's verification is `npx tsc --noEmit` (run from repo root; pre-existing errors, if any, must be noted but not fixed) plus the checks written in the task.
- Match existing file style: double quotes + `@/` imports in `app/`, single quotes in `components/shared/ServiceCard.tsx`; StyleSheet-based styles in `ServiceCard.tsx`.
- Do not change the behavior of the existing route-param auto-apply, reschedule flow, or guest booking flows.

---

### Task 1: `useLastBookedServices` hook

**Files:**
- Create: `hooks/useLastBookedServices.ts`

**Interfaces:**
- Consumes: `useAuthStore` (`stores/authStore.ts`), `supabase` (`lib/supabase.ts`) — both exist.
- Produces (Task 3 relies on this exact signature):
  ```ts
  useLastBookedServices(
    salonId: string | null | undefined,
    barberId: string | null | undefined
  ): { serviceIds: string[]; source: "barber" | "salon" | null; isLoading: boolean }
  ```

Schema facts (verified): `appointments` has `user_id, barber_id, service_id, scheduled_at, status` but **no `salon_id`** — salon is reached via `barber:barbers!inner(salon_id)`. Multi-service bookings live in `appointment_services (service_id, sort_order)`. `appointments.salon_client_id` → `salon_clients`; a non-null `salon_clients.managed_by_profile_id` means the appointment was for a dependent/guest (must not drive preselection). Reference pattern: `hooks/useNextAppointment.ts`.

- [ ] **Step 1: Write the hook**

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

// One recent-appointment row, trimmed to what preselection needs.
type LastBookedAppointmentRow = {
  id: string;
  barber_id: string;
  service_id: string | null;
  scheduled_at: string;
  services: { service_id: string; sort_order: number }[] | null;
  // Non-null managed_by_profile_id ⇒ booked for a dependent/guest, not the
  // account holder — those must not drive the holder's own preselection.
  salon_client: { managed_by_profile_id: string | null } | null;
};

export type LastBookedSource = "barber" | "salon";

const EMPTY_IDS: string[] = [];

/**
 * Service ids of the user's most recent non-cancelled appointment at
 * `salonId` — preferring an exact `barberId` match, falling back to the
 * salon's most recent appointment with any barber. One fetch per salon;
 * switching barbers reuses the cached rows (derivation is client-side).
 */
export function useLastBookedServices(
  salonId: string | null | undefined,
  barberId: string | null | undefined
): { serviceIds: string[]; source: LastBookedSource | null; isLoading: boolean } {
  const session = useAuthStore((s) => s.session);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["last-booked-services", session?.user.id, salonId],
    enabled: !!session && !!salonId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          `id, barber_id, service_id, scheduled_at,
           barber:barbers!inner(salon_id),
           services:appointment_services(service_id, sort_order),
           salon_client:salon_clients(managed_by_profile_id)`
        )
        .eq("user_id", session!.user.id)
        .eq("barber.salon_id", salonId!)
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      const all = (data ?? []) as unknown as LastBookedAppointmentRow[];
      // Dependent/guest bookings don't count as "your" last service.
      return all.filter((r) => !r.salon_client?.managed_by_profile_id);
    },
  });

  const derived = useMemo(() => {
    const serviceIdsOf = (row: LastBookedAppointmentRow): string[] => {
      if (row.services && row.services.length > 0) {
        return [...row.services]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => s.service_id);
      }
      return row.service_id ? [row.service_id] : [];
    };

    if (rows && rows.length > 0) {
      const exact = barberId
        ? rows.find((r) => r.barber_id === barberId)
        : undefined;
      if (exact) {
        const ids = serviceIdsOf(exact);
        if (ids.length > 0) return { serviceIds: ids, source: "barber" as const };
      }
      const fallbackIds = serviceIdsOf(rows[0]);
      if (fallbackIds.length > 0) {
        return { serviceIds: fallbackIds, source: "salon" as const };
      }
    }
    return { serviceIds: EMPTY_IDS, source: null as LastBookedSource | null };
  }, [rows, barberId]);

  return { serviceIds: derived.serviceIds, source: derived.source, isLoading };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no NEW errors (report any pre-existing ones untouched).

- [ ] **Step 3: Self-check against schema**

Confirm by reading, not guessing: `migrations/047_multi_service_junction_table.sql` (junction columns), `migrations/115_appointments_salon_client_link.sql` (salon_client_id), `hooks/useNextAppointment.ts` (embed style). If any select column mismatches the schema, fix the select — do not change the return signature.

---

### Task 2: `ServiceCard` „Ultima rezervare" badge

**Files:**
- Modify: `components/shared/ServiceCard.tsx`

**Interfaces:**
- Produces (Task 3 relies on this): new optional prop `isLastBooked?: boolean` on `ServiceCard`, default `false`. No other prop/behavior changes.

- [ ] **Step 1: Add the prop**

In `ServiceCardProps` (after `onPressPackage` at line ~43) add:

```ts
  /** Marks the user's most recent booking here — shows the „Ultima rezervare" pill. */
  isLastBooked?: boolean;
```

In the destructuring (line ~48-57) add `isLastBooked = false,` after `onPressPackage,`.

- [ ] **Step 2: Render the badge**

Immediately BEFORE the `{/* ── Service name ── */}` block (line ~205), inside the card:

```tsx
          {/* ── Last-booked badge (quiet, in-card) ──────────────────────────── */}
          {isLastBooked ? (
            <View style={styles.lastBookedBadge}>
              <Ionicons name="refresh" size={12} color={Colors.primary} />
              <Text style={styles.lastBookedText}>Ultima rezervare</Text>
            </View>
          ) : null}
```

Update the Pressable's `accessibilityLabel` (line ~179) to:

```tsx
        accessibilityLabel={`${service.name}, ${durationLabel}, ${priceLabel}${isLastBooked ? ', ultima rezervare' : ''}`}
```

- [ ] **Step 3: Add styles**

In the StyleSheet, after the `pkgHintChevron` entry (line ~374-377), add (single quotes — this file's style):

```ts
  // ── Last-booked badge ───────────────────────────────────────────────────────
  lastBookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.primaryMuted,
    marginBottom: 8,
  },

  lastBookedText: {
    fontFamily: 'EuclidCircularA-SemiBold',
    fontSize: 11,
    color: Colors.primary,
  },
```

(`Colors.primaryMuted` and `Colors.primary` already exist — used by `pkgHintActive`/`pkgHintText`.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors. Also confirm the badge sits above the service name and cannot intercept taps (it's a plain `View`, not `Pressable`).

---

### Task 3: Wizard integration in `app/book-appointment.tsx`

**Files:**
- Modify: `app/book-appointment.tsx`

**Interfaces:**
- Consumes: `useLastBookedServices` from Task 1 (exact signature above); `isLastBooked` prop from Task 2.
- Produces: nothing downstream.

Context you need (verified line anchors; re-locate by content if drifted):
- `effectiveSalonId` defined at line 283: `const effectiveSalonId = selectedBarber?.salon_id ?? salonId;`
- `visibleServices` memo at lines 317-322.
- Route-param auto-apply effect at lines 630-689 (uses `paramsApplied` state, line 117).
- `toggleService` at lines 808-818; `toggleGuestService` at lines 695+.
- Step 2 render maps `visibleServices` at lines 1691-1725; empty-state check `visibleServices.length === 0` at line 1678 — leave the empty check as-is.
- Params destructured at line 74: `serviceId`, `rawServiceIds`, `rescheduleId` (sanitized at line 84).

- [ ] **Step 1: Import the hook**

After line 19 (`import { formatPrice } from "@/lib/utils";`):

```ts
import { useLastBookedServices } from "@/hooks/useLastBookedServices";
```

- [ ] **Step 2: Touched-ref**

Next to `step2VisitedRef` (line ~129):

```ts
  // Flips the moment the user manually toggles any service; once true, the
  // last-booked auto-select must never fire again (it would fight the user).
  const servicesTouchedRef = useRef(false);
```

Add `servicesTouchedRef.current = true;` as the FIRST line of BOTH callbacks:
- inside `toggleService` (line ~808), before `setSelectedServices(...)`
- inside `toggleGuestService` (line ~695), before `setGuests(...)`

- [ ] **Step 3: Hook call + memos**

Immediately AFTER the `visibleServices` memo (line ~322):

```ts
  // ── Last-booked preselection ("Ultima rezervare") ────────────────────────
  // Disabled whenever explicit intent drives the flow: a deep-linked service
  // (serviceId/serviceIds params) or a reschedule. Passing undefined salonId
  // disables the underlying query entirely.
  const lastBookedEnabled = !serviceId && !rawServiceIds && !rescheduleId;
  const { serviceIds: lastBookedIds } = useLastBookedServices(
    lastBookedEnabled ? effectiveSalonId : undefined,
    selectedBarber?.id
  );

  // Only ids still bookable here (active + offered by this barber), kept in
  // the original appointment's service order.
  const lastBookedVisibleIds = useMemo(() => {
    if (lastBookedIds.length === 0 || visibleServices.length === 0) return [];
    const visible = new Set(visibleServices.map((s) => s.id));
    return lastBookedIds.filter((id) => visible.has(id));
  }, [lastBookedIds, visibleServices]);

  // Step-2 list order: last-booked cards first, the rest keep the price sort.
  const orderedServices = useMemo(() => {
    if (lastBookedVisibleIds.length === 0) return visibleServices;
    const rank = new Map(lastBookedVisibleIds.map((id, i) => [id, i]));
    const pinned: BarberService[] = [];
    const rest: BarberService[] = [];
    for (const s of visibleServices) {
      if (rank.has(s.id)) pinned.push(s);
      else rest.push(s);
    }
    pinned.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    return [...pinned, ...rest];
  }, [visibleServices, lastBookedVisibleIds]);
```

- [ ] **Step 4: Preselect effect**

Immediately AFTER the route-param auto-apply effect (after line ~689):

```ts
  // ── Auto-preselect last-booked services ──────────────────────────────────
  // History-driven sibling of the param auto-apply above; gated on
  // paramsApplied so params always win and the two can't race. Fires only
  // while the selection is untouched and empty, and only for the main user
  // (never guests). Re-evaluates if the barber changes while still untouched.
  useEffect(() => {
    if (!lastBookedEnabled || !paramsApplied) return;
    if (!selectedBarber || lastBookedVisibleIds.length === 0) return;
    if (servicesTouchedRef.current || selectedServices.length > 0) return;
    if (activePersonKey !== "self" || guests.length > 0) return;
    const byId = new Map(visibleServices.map((s) => [s.id, s]));
    const resolved = lastBookedVisibleIds
      .map((id) => byId.get(id))
      .filter((s): s is BarberService => !!s);
    if (resolved.length > 0) setSelectedServices(resolved);
  }, [
    lastBookedEnabled,
    paramsApplied,
    selectedBarber,
    lastBookedVisibleIds,
    selectedServices.length,
    activePersonKey,
    guests.length,
    visibleServices,
  ]);
```

- [ ] **Step 5: Render changes**

In the Step 2 list (line ~1692): change `visibleServices.map((service, index) => {` to `orderedServices.map((service, index) => {`. Do NOT change the `visibleServices.length === 0` empty-state condition at line ~1678.

Add to the `<ServiceCard ... />` props (line ~1710-1721):

```tsx
                          isLastBooked={lastBookedVisibleIds.includes(service.id)}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

Then re-read your diff and confirm each guard from the spec:
1. `serviceId`/`serviceIds`/`rescheduleId` present → hook disabled AND `lastBookedVisibleIds` empty → no reorder, no badge, no preselect.
2. Preselect never fires after a manual toggle (ref set in BOTH toggle callbacks).
3. Guests/dependents flows untouched (`activePersonKey !== "self"` or `guests.length > 0` bail).
4. Empty history → `orderedServices === visibleServices` (same reference, no re-render churn).

---

### Task 4: End-to-end verification + single commit (orchestrator)

- [ ] **Step 1: Full typecheck** — `npx tsc --noEmit` clean (no new errors).
- [ ] **Step 2: Manual QA** per spec checklist (7 scenarios) — run in Expo dev client against staging data where possible.
- [ ] **Step 3: Single commit** of all changes (hook + card + wizard + spec + plan), message: `feat(booking): preselect last-booked service on same salon+barber rebook`.
