import { NativeModule, requireNativeModule } from "expo";
import { Platform } from "react-native";

/** Input for {@link LiveActivityModule.startAppointmentActivity}. */
export type StartAppointmentActivityInput = {
  appointmentId: string;
  barberName: string;
  salonName: string;
  serviceLabel: string;
  extraServicesCount: number;
  /** ISO 8601 string. */
  startsAt: string;
  /** ISO 8601 string. */
  endsAt: string;
  /** "upcoming" | "soon" | "inProgress" */
  status: string;
};

/** Input for {@link LiveActivityModule.updateAppointmentActivity}. */
export type AppointmentActivityState = {
  /** ISO 8601 string. */
  startsAt: string;
  /** ISO 8601 string. */
  endsAt: string;
  /** "upcoming" | "soon" | "inProgress" */
  status: string;
};

/** One entry returned by {@link LiveActivityModule.getActiveActivities}. */
export type ActiveAppointmentActivity = {
  id: string;
  appointmentId: string;
};

declare class LiveActivityModule extends NativeModule<Record<string, never>> {
  /** True only on iOS 16.2+ with Live Activities enabled in Settings. */
  areActivitiesEnabled(): boolean;
  /** Starts the appointment Live Activity. Returns the activity id, or null if unsupported/disabled. */
  startAppointmentActivity(input: StartAppointmentActivityInput): Promise<string | null>;
  /** Pushes a new dynamic content state (start/end time, status) to a running activity. */
  updateAppointmentActivity(activityId: string, state: AppointmentActivityState): Promise<void>;
  /** Ends (dismisses) the activity immediately. */
  endAppointmentActivity(activityId: string): Promise<void>;
  /** Enumerates currently running appointment Live Activities (e.g. to recover/dedupe after relaunch). */
  getActiveActivities(): Promise<ActiveAppointmentActivity[]>;
}

const nativeModule: LiveActivityModule | null =
  Platform.OS === "ios" ? requireNativeModule<LiveActivityModule>("LiveActivity") : null;

/**
 * JS bridge to the native `LiveActivity` Expo module (ActivityKit), iOS only.
 * All calls are safe no-ops on non-iOS platforms and on iOS < 16.2.
 */
const LiveActivity = {
  areActivitiesEnabled(): boolean {
    return nativeModule?.areActivitiesEnabled() ?? false;
  },
  async startAppointmentActivity(input: StartAppointmentActivityInput): Promise<string | null> {
    if (!nativeModule) return null;
    return nativeModule.startAppointmentActivity(input);
  },
  async updateAppointmentActivity(activityId: string, state: AppointmentActivityState): Promise<void> {
    if (!nativeModule) return;
    return nativeModule.updateAppointmentActivity(activityId, state);
  },
  async endAppointmentActivity(activityId: string): Promise<void> {
    if (!nativeModule) return;
    return nativeModule.endAppointmentActivity(activityId);
  },
  async getActiveActivities(): Promise<ActiveAppointmentActivity[]> {
    if (!nativeModule) return [];
    return nativeModule.getActiveActivities();
  },
};

export default LiveActivity;
