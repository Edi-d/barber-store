/**
 * Domain wrapper around the native `LiveActivity` module (ActivityKit, iOS
 * 16.2+ only). Centralizes the "is this appointment within the Live Activity
 * window, and what status should it show" logic, and maps an
 * `AppointmentWithDetails` row onto the native input shapes so callers never
 * touch the bridge directly.
 *
 * See hooks/useAppointmentLiveActivity.ts for the effect that drives this.
 */

import { Platform } from "react-native";

import LiveActivity from "@/modules/live-activity";
import type { AppointmentWithDetails } from "@/types/database";

/** Appointment enters the Live Activity window this many minutes before start. */
export const TRIGGER_WINDOW_MIN = 60;
/** Below this many minutes to start, the card switches from "upcoming" to "soon". */
export const SOON_MIN = 15;

export type LiveActivityStatus = "upcoming" | "soon" | "inProgress";

export interface DerivedActivityState {
  status: LiveActivityStatus;
  /** Whether a Live Activity should be running for this appointment right now. */
  shouldBeActive: boolean;
  /** ISO 8601 */
  startsAt: string;
  /** ISO 8601 */
  endsAt: string;
}

/**
 * Derives the Live Activity status/window for an appointment at a given
 * instant. Pure function — no I/O — so it's trivial to unit test.
 */
export function deriveActivityState(
  scheduledAtISO: string,
  durationMin: number,
  now: Date = new Date()
): DerivedActivityState {
  const startsAtDate = new Date(scheduledAtISO);
  const endsAtDate = new Date(startsAtDate.getTime() + durationMin * 60_000);
  const nowMs = now.getTime();
  const minutesUntilStart = (startsAtDate.getTime() - nowMs) / 60_000;

  const hasPassed = nowMs >= endsAtDate.getTime();
  const shouldBeActive = !hasPassed && minutesUntilStart <= TRIGGER_WINDOW_MIN;

  let status: LiveActivityStatus;
  if (nowMs >= startsAtDate.getTime()) {
    status = "inProgress";
  } else if (minutesUntilStart <= SOON_MIN) {
    status = "soon";
  } else {
    status = "upcoming";
  }

  return {
    status,
    shouldBeActive,
    startsAt: startsAtDate.toISOString(),
    endsAt: endsAtDate.toISOString(),
  };
}

/** True only on iOS 16.2+ with Live Activities enabled in Settings. */
export function isLiveActivitySupported(): boolean {
  return Platform.OS === "ios" && LiveActivity.areActivitiesEnabled();
}

// The `salon` sub-embed is added additively in useNextAppointment.ts's select
// (barber:barbers(*, salon:salons!barbers_salon_id_fkey(name))) but isn't part
// of the shared AppointmentWithDetails type — read it defensively.
type BarberWithSalon = AppointmentWithDetails["barber"] & {
  salon?: { name: string | null } | null;
};

function getSalonName(appointment: AppointmentWithDetails): string {
  const barber = appointment.barber as BarberWithSalon | null | undefined;
  return barber?.salon?.name ?? "";
}

function getPrimaryServiceName(appointment: AppointmentWithDetails): string {
  const primary =
    appointment.services && appointment.services.length > 0
      ? appointment.services[0]?.service
      : appointment.service ?? null;
  return primary?.name ?? "Programare";
}

function getExtraServicesCount(appointment: AppointmentWithDetails): number {
  return appointment.services && appointment.services.length > 1
    ? appointment.services.length - 1
    : 0;
}

/** Starts a new Live Activity for `appointment`. Returns the activity id, or null if unsupported/failed. */
export async function startForAppointment(
  appointment: AppointmentWithDetails
): Promise<string | null> {
  if (!isLiveActivitySupported()) return null;

  const { status, startsAt, endsAt } = deriveActivityState(
    appointment.scheduled_at,
    appointment.duration_min
  );

  return LiveActivity.startAppointmentActivity({
    appointmentId: appointment.id,
    barberName: appointment.barber?.name ?? "",
    salonName: getSalonName(appointment),
    serviceLabel: getPrimaryServiceName(appointment),
    extraServicesCount: getExtraServicesCount(appointment),
    startsAt,
    endsAt,
    status,
  });
}

/** Pushes a fresh start/end/status to a running activity. */
export async function updateForAppointment(
  activityId: string,
  appointment: AppointmentWithDetails
): Promise<void> {
  if (!isLiveActivitySupported()) return;

  const { status, startsAt, endsAt } = deriveActivityState(
    appointment.scheduled_at,
    appointment.duration_min
  );

  await LiveActivity.updateAppointmentActivity(activityId, {
    startsAt,
    endsAt,
    status,
  });
}

/** Ends (dismisses) a running activity. */
export async function endActivity(activityId: string): Promise<void> {
  if (!isLiveActivitySupported()) return;
  await LiveActivity.endAppointmentActivity(activityId);
}
