import ActivityKit
import Foundation

/// Shape of the Appointment Live Activity.
///
/// ⚠️ MUST stay byte-for-byte identical to the copy in
/// `modules/live-activity/ios/AppointmentActivityAttributes.swift` (the JS bridge module,
/// compiled into the main app target). ActivityKit encodes/decodes `ContentState` by its
/// structural (memberwise) layout — the widget extension (this target) and the bridge
/// module live in two different compiled modules (a widget extension target and a
/// CocoaPods pod, respectively), so the type cannot simply be shared via a single file
/// across both. If you change one copy, change the other immediately, or the widget will
/// silently fail to update (or fail to decode the activity at all).
struct AppointmentActivityAttributes: ActivityAttributes {
    /// Dynamic, updatable content of the Live Activity.
    public struct ContentState: Codable, Hashable {
        /// Appointment start time (ISO 8601 on the JS side, `Date` here).
        public var startsAt: Date
        /// Appointment end time.
        public var endsAt: Date
        /// One of: "upcoming" | "soon" | "inProgress".
        public var status: String

        public init(startsAt: Date, endsAt: Date, status: String) {
            self.startsAt = startsAt
            self.endsAt = endsAt
            self.status = status
        }
    }

    // Static attributes — set once when the activity is started, never changed afterwards.
    public var appointmentId: String
    public var barberName: String
    public var salonName: String
    public var serviceLabel: String
    public var extraServicesCount: Int

    public init(
        appointmentId: String,
        barberName: String,
        salonName: String,
        serviceLabel: String,
        extraServicesCount: Int
    ) {
        self.appointmentId = appointmentId
        self.barberName = barberName
        self.salonName = salonName
        self.serviceLabel = serviceLabel
        self.extraServicesCount = extraServicesCount
    }
}
