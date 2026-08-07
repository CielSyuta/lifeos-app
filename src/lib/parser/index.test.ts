import { describe, expect, it } from "vitest";
import { buildIcsContent } from "../calendar/ics";
import { buildShortcutJson } from "../reminders/shortcut";
import { createDefaultSettings, detectDuplicateItems, parseSchedule, resolveExportItems } from "./index";

describe("parseSchedule", () => {
  it("parses natural input into calendar and reminder items", () => {
    const settings = createDefaultSettings();
    const sample = `Date: Saturday, August 8, 2026

8/8/26 9:30 AM - 11:30 AM
💪 Gym

8/8/26 1:00 PM
🧼 Clean Bathroom`;

    const parsed = parseSchedule(sample, settings);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.type).toBe("calendar");
    expect(parsed[0]?.title).toBe("Gym");
    expect(parsed[1]?.type).toBe("reminder");
    expect(parsed[1]?.title).toBe("Clean Bathroom");
  });

  it("supports structured task blocks", () => {
    const settings = createDefaultSettings();
    const sample = `[EVENT]\nDate: 8/8/26\nStart: 9:30 AM\nEnd: 11:30 AM\nTitle: 💪 Gym\nCalendar: Personal\nAlert: 30m\nTravel: Auto\nLocation: Planet Fitness\n\n[TASK]\nDate: 8/8/26\nDue: 1:00 PM\nTitle: 🧼 Clean Bathroom\nList: Life General\nColumn: Home\nPriority: Medium`;

    const parsed = parseSchedule(sample, settings);
    expect(parsed[0]?.type).toBe("calendar");
    expect(parsed[0]?.calendar).toBe("Personal");
    expect(parsed[1]?.type).toBe("reminder");
    expect(parsed[1]?.reminderList).toBe("Life General");
  });

  it("handles overnight events", () => {
    const settings = createDefaultSettings();
    const sample = `Date: Saturday, August 8, 2026

8/8/26 5:00 PM - 1:45 AM
🍟 McDonald's Enfield`;

    const parsed = parseSchedule(sample, settings);
    expect(parsed[0]?.type).toBe("calendar");
    expect(parsed[0]?.endTime).toBe("01:45");
  });
});

describe("duplicate handling and exports", () => {
  it("marks duplicate items and leaves only one exportable copy", () => {
    const settings = createDefaultSettings();
    const sample = `Date: Saturday, August 8, 2026

8/8/26 9:30 AM - 11:30 AM
💪 Gym

8/8/26 9:30 AM - 11:30 AM
💪 Gym`;

    const parsed = detectDuplicateItems(parseSchedule(sample, settings));
    const exportable = resolveExportItems(parsed);
    expect(exportable).toHaveLength(1);
  });

  it("builds ICS content for calendar items", () => {
    const calendarItem = {
      id: "event-1",
      type: "calendar" as const,
      title: "Gym",
      emoji: "💪",
      date: "2026-08-08",
      startTime: "09:30",
      endTime: "11:30",
      notes: "",
      location: "Planet Fitness",
      calendar: "Personal",
      reminderList: "Life General",
      reminderColumn: "Home",
      priority: "medium" as const,
      alert: "30m",
      travelTime: "none",
      allDay: false,
      completed: false,
      source: "natural" as const,
      inferredType: "calendar" as const,
      edited: false,
    };

    const ics = buildIcsContent([calendarItem]);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Gym");
    expect(ics).toContain("DTSTART:");
    expect(ics).toContain("BEGIN:VALARM");
  });

  it("builds shortcut JSON payloads", () => {
    const reminderItem = {
      id: "task-1",
      type: "reminder" as const,
      title: "Clean Bathroom",
      emoji: "🧼",
      date: "2026-08-08",
      dueTime: "13:00",
      notes: "",
      location: "",
      calendar: "Personal",
      reminderList: "Life General",
      reminderColumn: "Home",
      priority: "medium" as const,
      alert: "at_due",
      travelTime: "none",
      allDay: false,
      completed: false,
      source: "natural" as const,
      inferredType: "reminder" as const,
      edited: false,
    };

    const payload = buildShortcutJson([reminderItem]);
    expect(payload).toContain("Clean Bathroom");
    expect(payload).toContain("Life General");
  });
});
