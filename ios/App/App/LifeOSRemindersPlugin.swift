import Capacitor
import EventKit
import Foundation

@objc(LifeOSRemindersPlugin)
public class LifeOSRemindersPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LifeOSReminders"
    public let jsName = "LifeOSReminders"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addReminder", returnType: CAPPluginReturnPromise)
    ]

    private let eventStore = EKEventStore()

    @objc public func addReminder(_ call: CAPPluginCall) {
        guard let title = call.getString("title"), !title.isEmpty else {
            resolveError(call, "A title is required.")
            return
        }

        guard let dueDate = call.getString("dueDate"),
              let dueDateComponents = buildDueDateComponents(date: dueDate, time: call.getString("dueTime")) else {
            resolveError(call, "A valid dueDate is required.")
            return
        }

        requestReminderAccess { [weak self] granted, message in
            guard let self else {
                call.resolve(["success": false, "error": "Plugin instance is unavailable."])
                return
            }

            guard granted else {
                self.resolveError(call, message ?? "Reminders access was denied.")
                return
            }

            let reminder = EKReminder(eventStore: self.eventStore)
            reminder.title = title
            reminder.dueDateComponents = dueDateComponents

            if let notes = call.getString("notes"), !notes.isEmpty {
                reminder.notes = notes
            }

            if let urlValue = call.getString("url"), !urlValue.isEmpty, let url = URL(string: urlValue) {
                reminder.url = url
            }

            reminder.priority = self.priorityValue(for: call.getString("priority"))

            if let listName = call.getString("listName"), !listName.isEmpty,
               let namedCalendar = self.eventStore.calendars(for: .reminder).first(where: { $0.title == listName }) {
                reminder.calendar = namedCalendar
            } else if let defaultCalendar = self.eventStore.defaultCalendarForNewReminders() {
                reminder.calendar = defaultCalendar
            }

            if let alarm = self.makeAlarm(from: dueDateComponents, alertOffset: call.getString("alertOffset")) {
                reminder.addAlarm(alarm)
            }

            do {
                try self.eventStore.save(reminder, commit: true)
                call.resolve([
                    "success": true,
                    "reminderId": reminder.calendarItemIdentifier
                ])
            } catch {
                self.resolveError(call, error.localizedDescription)
            }
        }
    }

    private func requestReminderAccess(completion: @escaping (Bool, String?) -> Void) {
        if #available(iOS 17.0, *) {
            eventStore.requestFullAccessToReminders { granted, error in
                DispatchQueue.main.async {
                    completion(granted, error?.localizedDescription)
                }
            }
            return
        }

        eventStore.requestAccess(to: .reminder) { granted, error in
            DispatchQueue.main.async {
                completion(granted, error?.localizedDescription)
            }
        }
    }

    private func buildDueDateComponents(date: String, time: String?) -> DateComponents? {
        guard let parsedDate = dateOnlyFormatter.date(from: date) else {
            return nil
        }

        var components = calendar.dateComponents([.year, .month, .day], from: parsedDate)

        if let time, !time.isEmpty {
            let parts = time.split(separator: ":").compactMap { Int($0) }
            guard parts.count >= 2 else {
                return nil
            }

            components.hour = parts[0]
            components.minute = parts[1]
        }

        return components
    }

    private func makeAlarm(from dueDateComponents: DateComponents, alertOffset: String?) -> EKAlarm? {
        guard let seconds = alertOffsetSeconds(alertOffset),
              let dueDate = calendar.date(from: dueDateComponents) else {
            return nil
        }

        return EKAlarm(absoluteDate: dueDate.addingTimeInterval(seconds))
    }

    private func alertOffsetSeconds(_ offset: String?) -> TimeInterval? {
        switch offset {
        case nil, "", "none":
            return nil
        case "at_due_time", "at_time":
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

    private func priorityValue(for priority: String?) -> Int {
        switch priority?.lowercased() {
        case "high":
            return 1
        case "medium":
            return 5
        case "low":
            return 9
        default:
            return 0
        }
    }

    private func resolveError(_ call: CAPPluginCall, _ message: String) {
        call.resolve([
            "success": false,
            "error": message
        ])
    }

    private let calendar = Calendar(identifier: .gregorian)

    private let dateOnlyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
