import Capacitor
import EventKit
import Foundation

@objc(LifeOSCalendarPlugin)
public class LifeOSCalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LifeOSCalendar"
    public let jsName = "LifeOSCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise)
    ]

    private let eventStore = EKEventStore()

    @objc public func addEvent(_ call: CAPPluginCall) {
        guard let title = call.getString("title"), !title.isEmpty else {
            resolveError(call, "A title is required.")
            return
        }

        let isAllDay = call.getBool("isAllDay", false)

        guard let startInput = call.getString("startDate"),
              let endInput = call.getString("endDate"),
              let startDate = parseDate(startInput, isAllDay: isAllDay),
              let endDate = parseDate(endInput, isAllDay: isAllDay) else {
            resolveError(call, "Valid startDate and endDate values are required.")
            return
        }

        requestEventAccess { [weak self] granted, message in
            guard let self else {
                call.resolve(["success": false, "error": "Plugin instance is unavailable."])
                return
            }

            guard granted else {
                self.resolveError(call, message ?? "Calendar access was denied.")
                return
            }

            let event = EKEvent(eventStore: self.eventStore)
            event.title = title
            event.startDate = startDate
            event.endDate = endDate
            event.isAllDay = isAllDay

            if let location = call.getString("location"), !location.isEmpty {
                event.location = location
            }

            if let notes = call.getString("notes"), !notes.isEmpty {
                event.notes = notes
            }

            if let urlValue = call.getString("url"), !urlValue.isEmpty, let url = URL(string: urlValue) {
                event.url = url
            }

            if let calendarName = call.getString("calendarName"), !calendarName.isEmpty,
               let namedCalendar = self.eventStore.calendars(for: .event).first(where: { $0.title == calendarName }) {
                event.calendar = namedCalendar
            } else if let defaultCalendar = self.eventStore.defaultCalendarForNewEvents {
                event.calendar = defaultCalendar
            }

            if let alarm = self.makeAlarm(from: call.getString("alertOffset")) {
                event.addAlarm(alarm)
            }

            do {
                try self.eventStore.save(event, span: .thisEvent, commit: true)
                call.resolve([
                    "success": true,
                    "eventId": event.eventIdentifier ?? ""
                ])
            } catch {
                self.resolveError(call, error.localizedDescription)
            }
        }
    }

    private func requestEventAccess(completion: @escaping (Bool, String?) -> Void) {
        if #available(iOS 17.0, *) {
            eventStore.requestFullAccessToEvents { granted, error in
                DispatchQueue.main.async {
                    completion(granted, error?.localizedDescription)
                }
            }
            return
        }

        eventStore.requestAccess(to: .event) { granted, error in
            DispatchQueue.main.async {
                completion(granted, error?.localizedDescription)
            }
        }
    }

    private func parseDate(_ value: String, isAllDay: Bool) -> Date? {
        if isAllDay || value.count == 10 {
            return dateOnlyFormatter.date(from: value)
        }

        return iso8601FormatterWithFractionalSeconds.date(from: value)
            ?? iso8601Formatter.date(from: value)
            ?? localDateTimeFormatter.date(from: value)
    }

    private func makeAlarm(from offset: String?) -> EKAlarm? {
        guard let seconds = alertOffsetSeconds(offset) else {
            return nil
        }

        return EKAlarm(relativeOffset: seconds)
    }

    private func alertOffsetSeconds(_ offset: String?) -> TimeInterval? {
        switch offset {
        case nil, "", "none":
            return nil
        case "at_time":
            return 0
        case "5m":
            return -300
        case "10m":
            return -600
        case "15m":
            return -900
        case "30m":
            return -1800
        case "1h":
            return -3600
        case "2h":
            return -7200
        case "1d":
            return -86400
        default:
            return nil
        }
    }

    private func resolveError(_ call: CAPPluginCall, _ message: String) {
        call.resolve([
            "success": false,
            "error": message
        ])
    }

    private let dateOnlyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private let localDateTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return formatter
    }()

    private let iso8601Formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private let iso8601FormatterWithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
