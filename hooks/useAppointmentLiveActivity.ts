/**
 * Keeps exactly one iOS Live Activity in sync with the user's next
 * appointment. No UI — pure side-effect hook, wired once in RootLayoutNav.
 *
 * Reconciliation is driven off `getActiveActivities()` (the native source of
 * truth) rather than local storage, so it self-heals across app relaunches:
 * on every evaluation we diff "what's actually running" against "what should
 * be running for the current next appointment" and start/update/end as
 * needed. That also means a stale activity (appointment cancelled,
 * rescheduled away, or simply finished) gets cleaned up automatically even if
 * this hook wasn't mounted when that happened.
 */

import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import LiveActivity from "@/modules/live-activity";
import { useNextAppointment } from "@/hooks/useNextAppointment";
import {
  deriveActivityState,
  endActivity,
  isLiveActivitySupported,
  startForAppointment,
  updateForAppointment,
} from "@/lib/live-activity";

/** How often to re-evaluate while an appointment is inside the trigger window and the app is foregrounded. */
const EVALUATION_INTERVAL_MS = 30_000;

export function useAppointmentLiveActivity(): void {
  const { nextAppointment } = useNextAppointment();
  // Guards against overlapping evaluations (interval tick + AppState change
  // firing back to back) starting/ending the same activity twice.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!isLiveActivitySupported()) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const evaluate = async () => {
      if (inFlightRef.current || cancelled) return;
      inFlightRef.current = true;
      try {
        const active = await LiveActivity.getActiveActivities();
        if (cancelled) return;

        if (!nextAppointment) {
          // Nothing upcoming (or signed out) — nothing should be running.
          await Promise.all(active.map((a) => endActivity(a.id)));
          return;
        }

        // End any activity that isn't for the current next appointment
        // (cancelled/rescheduled away, or superseded by an earlier booking).
        const stale = active.filter((a) => a.appointmentId !== nextAppointment.id);
        if (stale.length > 0) {
          await Promise.all(stale.map((a) => endActivity(a.id)));
        }

        const derived = deriveActivityState(
          nextAppointment.scheduled_at,
          nextAppointment.duration_min
        );
        const current = active.find((a) => a.appointmentId === nextAppointment.id);

        if (derived.shouldBeActive) {
          if (current) {
            await updateForAppointment(current.id, nextAppointment);
          } else {
            await startForAppointment(nextAppointment);
          }
        } else if (current) {
          // Defensive: appointment fell out of the window (e.g. it just
          // ended) but its activity is still running — dismiss it.
          await endActivity(current.id);
        }
      } catch (e) {
        // Best-effort — a failed reconcile just retries on the next tick.
        console.warn("[live-activity] reconcile failed", e);
      } finally {
        inFlightRef.current = false;
      }
    };

    const manageInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (AppState.currentState !== "active" || !nextAppointment) return;

      // Only poll frequently while there's something worth watching — an
      // appointment currently inside the trigger window. Outside the window
      // we rely on useNextAppointment's 60s refetch (and the AppState
      // "active" listener below) to eventually re-run this effect.
      const { shouldBeActive } = deriveActivityState(
        nextAppointment.scheduled_at,
        nextAppointment.duration_min
      );
      if (!shouldBeActive) return;

      intervalId = setInterval(evaluate, EVALUATION_INTERVAL_MS);
    };

    evaluate();
    manageInterval();

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        evaluate();
      }
      manageInterval();
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextAppointment]);
}
