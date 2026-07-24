import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Shared styling

private let tapziAccent = Color(red: 0.961, green: 0.647, blue: 0.137) // #F5A623
private let tapziCardBackground = Color(red: 0.071, green: 0.078, blue: 0.086) // ~#121417

private func initials(for name: String) -> String {
    let letters = name.split(separator: " ").prefix(2).compactMap { $0.first }
    return letters.isEmpty ? "?" : String(letters).uppercased()
}

private func serviceText(_ attributes: AppointmentActivityAttributes) -> String {
    attributes.extraServicesCount > 0
        ? "\(attributes.serviceLabel) (+\(attributes.extraServicesCount))"
        : attributes.serviceLabel
}

/// A bounded range for `Text(timerInterval:)` to live-count down to `startsAt`.
/// Clamped so it never produces an invalid (lowerBound > upperBound) range, which
/// would crash SwiftUI. Once "now" passes `startsAt`, the text freezes at 0:00 —
/// by that point the JS layer is expected to have pushed a "soon"/"inProgress" update.
private func countdownRange(startsAt: Date) -> ClosedRange<Date> {
    let now = Date()
    return startsAt > now ? now...startsAt : startsAt...startsAt
}

// MARK: - Lock Screen / banner view

private struct AppointmentLockScreenView: View {
    let context: ActivityViewContext<AppointmentActivityAttributes>

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle()
                    .fill(tapziAccent)
                    .frame(width: 46, height: 46)
                Text(initials(for: context.attributes.barberName))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.black)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text("Următorul tuns")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.6))
                Text(context.attributes.barberName)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(serviceText(context.attributes))
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.75))
                    .lineLimit(1)
                Text(context.attributes.salonName)
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                if context.state.status == "inProgress" {
                    Text("În curs")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(tapziAccent)
                } else {
                    Text("Începe în")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.6))
                    Text(timerInterval: countdownRange(startsAt: context.state.startsAt), countsDown: true)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(tapziAccent)
                        .frame(minWidth: 54, alignment: .trailing)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(16)
        .activityBackgroundTint(tapziCardBackground)
        .activitySystemActionForegroundColor(.white)
    }
}

// MARK: - Dynamic Island

private struct AppointmentDynamicIslandExpanded: View {
    let context: ActivityViewContext<AppointmentActivityAttributes>

    var body: some View {
        VStack(spacing: 2) {
            Text(context.attributes.barberName)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
            Text(serviceText(context.attributes))
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
        }
    }
}

struct AppointmentLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AppointmentActivityAttributes.self) { context in
            AppointmentLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ZStack {
                        Circle()
                            .fill(tapziAccent.opacity(0.18))
                            .frame(width: 34, height: 34)
                        Image(systemName: "scissors")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(tapziAccent)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.status == "inProgress" {
                        Text("În curs")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(tapziAccent)
                    } else {
                        Text(timerInterval: countdownRange(startsAt: context.state.startsAt), countsDown: true)
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(tapziAccent)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    AppointmentDynamicIslandExpanded(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.salonName)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: "scissors")
                    .foregroundStyle(tapziAccent)
            } compactTrailing: {
                if context.state.status == "inProgress" {
                    Text("Live")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(tapziAccent)
                } else {
                    Text(timerInterval: countdownRange(startsAt: context.state.startsAt), countsDown: true)
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(tapziAccent)
                        .frame(maxWidth: 44)
                }
            } minimal: {
                Image(systemName: "scissors")
                    .foregroundStyle(tapziAccent)
            }
            .widgetURL(URL(string: "tapzi://appointments"))
            .keylineTint(tapziAccent)
        }
    }
}

// MARK: - Previews

extension AppointmentActivityAttributes {
    fileprivate static var preview: AppointmentActivityAttributes {
        AppointmentActivityAttributes(
            appointmentId: "preview-appointment-id",
            barberName: "Andrei Popescu",
            salonName: "Tapzi Barbershop Herăstrău",
            serviceLabel: "Tuns clasic",
            extraServicesCount: 1
        )
    }
}

extension AppointmentActivityAttributes.ContentState {
    fileprivate static var upcoming: AppointmentActivityAttributes.ContentState {
        AppointmentActivityAttributes.ContentState(
            startsAt: Date().addingTimeInterval(45 * 60),
            endsAt: Date().addingTimeInterval(75 * 60),
            status: "upcoming"
        )
    }

    fileprivate static var inProgress: AppointmentActivityAttributes.ContentState {
        AppointmentActivityAttributes.ContentState(
            startsAt: Date().addingTimeInterval(-5 * 60),
            endsAt: Date().addingTimeInterval(25 * 60),
            status: "inProgress"
        )
    }
}
