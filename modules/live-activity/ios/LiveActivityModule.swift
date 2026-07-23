import ExpoModulesCore
import ActivityKit

// AppointmentActivityAttributes is declared in AppointmentActivityAttributes.swift
// (this pod) — see that file's header comment for the "keep both copies in sync" note.

private let iso8601Fractional: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
}()

private let iso8601: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
}()

private func parseISODate(_ value: String) -> Date? {
    iso8601Fractional.date(from: value) ?? iso8601.date(from: value)
}

/// JS-facing shape for `startAppointmentActivity(input)`.
struct StartAppointmentActivityInput: Record {
    @Field var appointmentId: String = ""
    @Field var barberName: String = ""
    @Field var salonName: String = ""
    @Field var serviceLabel: String = ""
    @Field var extraServicesCount: Int = 0
    @Field var startsAt: String = ""
    @Field var endsAt: String = ""
    @Field var status: String = "upcoming"
}

/// JS-facing shape for `updateAppointmentActivity(activityId, state)`.
struct AppointmentActivityStateInput: Record {
    @Field var startsAt: String = ""
    @Field var endsAt: String = ""
    @Field var status: String = "upcoming"
}

/// JS-facing shape for one entry returned by `getActiveActivities()`.
struct ActiveActivityRecord: Record {
    @Field var id: String = ""
    @Field var appointmentId: String = ""
}

public class LiveActivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("LiveActivity")

        // MARK: areActivitiesEnabled

        Function("areActivitiesEnabled") { () -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }

        // MARK: startAppointmentActivity

        AsyncFunction("startAppointmentActivity") { (input: StartAppointmentActivityInput) -> String? in
            guard #available(iOS 16.2, *) else { return nil }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
            guard
                let startsAt = parseISODate(input.startsAt),
                let endsAt = parseISODate(input.endsAt)
            else {
                return nil
            }

            let attributes = AppointmentActivityAttributes(
                appointmentId: input.appointmentId,
                barberName: input.barberName,
                salonName: input.salonName,
                serviceLabel: input.serviceLabel,
                extraServicesCount: input.extraServicesCount
            )
            let state = AppointmentActivityAttributes.ContentState(
                startsAt: startsAt,
                endsAt: endsAt,
                status: input.status
            )
            let content = ActivityContent(state: state, staleDate: endsAt.addingTimeInterval(30 * 60))

            do {
                let activity = try Activity.request(attributes: attributes, content: content)
                return activity.id
            } catch {
                log.error("LiveActivity: failed to start appointment activity: \(error)")
                return nil
            }
        }

        // MARK: updateAppointmentActivity

        AsyncFunction("updateAppointmentActivity") { (activityId: String, state: AppointmentActivityStateInput) in
            guard #available(iOS 16.2, *) else { return }
            guard
                let startsAt = parseISODate(state.startsAt),
                let endsAt = parseISODate(state.endsAt)
            else {
                return
            }

            let newState = AppointmentActivityAttributes.ContentState(
                startsAt: startsAt,
                endsAt: endsAt,
                status: state.status
            )
            let content = ActivityContent(state: newState, staleDate: endsAt.addingTimeInterval(30 * 60))

            for activity in Activity<AppointmentActivityAttributes>.activities where activity.id == activityId {
                await activity.update(content)
            }
        }

        // MARK: endAppointmentActivity

        AsyncFunction("endAppointmentActivity") { (activityId: String) in
            guard #available(iOS 16.2, *) else { return }

            for activity in Activity<AppointmentActivityAttributes>.activities where activity.id == activityId {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        // MARK: getActiveActivities

        AsyncFunction("getActiveActivities") { () -> [ActiveActivityRecord] in
            guard #available(iOS 16.2, *) else { return [] }

            return Activity<AppointmentActivityAttributes>.activities.map { activity in
                ActiveActivityRecord(id: activity.id, appointmentId: activity.attributes.appointmentId)
            }
        }
    }
}
