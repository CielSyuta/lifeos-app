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

describe("canonical structured format", () => {
  const settings = createDefaultSettings();

  const canonicalInput = `[EVENT]
Title: 💪 Gym
Date: 2026-08-10
Start: 10:45 AM
End: 12:45 PM
Address: 123 Main St, Springfield, MA 01103
Notes: Pull day
[/EVENT]

[TASK]
Title: 🧺 Start Laundry
Date: 2026-08-10
Due: 9:45 AM
Address:
List: Life General
Column: Laundry
Notes:
[/TASK]

[EVENT]
Title: 🍟 McDonald's | Enfield
Date: 2026-08-10
Start: 4:00 PM
End: 12:45 AM
Address: 34 Hazard Ave, Enfield, CT 06082
Notes: Work
[/EVENT]`;

  it("parses 3 items from the canonical sample", () => {
    const items = parseSchedule(canonicalInput, settings);
    expect(items).toHaveLength(3);
  });

  it("event with address stores address correctly", () => {
    const items = parseSchedule(canonicalInput, settings);
    expect(items[0]?.type).toBe("calendar");
    expect(items[0]?.address).toBe("123 Main St, Springfield, MA 01103");
  });

  it("event without explicit address has no address", () => {
    const sample = `[EVENT]
Title: 🏋️ Workout
Date: 2026-08-10
Start: 9:00 AM
End: 10:00 AM
[/EVENT]`;
    const items = parseSchedule(sample, settings);
    expect(items[0]?.address).toBeUndefined();
  });

  it("task with address stores address correctly", () => {
    const sample = `[TASK]
Title: 🏪 Pick up groceries
Date: 2026-08-10
Due: 3:00 PM
Address: 456 Elm St, Northampton, MA 01060
List: Life General
[/TASK]`;
    const items = parseSchedule(sample, settings);
    expect(items[0]?.type).toBe("reminder");
    expect(items[0]?.address).toBe("456 Elm St, Northampton, MA 01060");
  });

  it("task without address has no address", () => {
    const items = parseSchedule(canonicalInput, settings);
    const laundry = items.find((i) => i.title.includes("Laundry"));
    expect(laundry?.address).toBeUndefined();
  });

  it("overnight event: end time is on the next day (not truncated)", () => {
    const items = parseSchedule(canonicalInput, settings);
    const overnight = items.find((i) => i.title.includes("McDonald"));
    expect(overnight?.startTime).toBe("16:00");
    expect(overnight?.endTime).toBe("00:45");
    // ICS should add a day for overnight events
    const ics = buildIcsContent(items);
    expect(ics).toContain("20260811T004500"); // end on Aug 11
  });

  it("address containing commas is preserved verbatim", () => {
    const sample = `[EVENT]
Title: Meeting
Date: 2026-08-10
Start: 2:00 PM
End: 3:00 PM
Address: 100 Main St, Suite 200, Boston, MA 02101
[/EVENT]`;
    const items = parseSchedule(sample, settings);
    expect(items[0]?.address).toBe("100 Main St, Suite 200, Boston, MA 02101");
  });

  it("address with apartment info is preserved verbatim", () => {
    const sample = `[EVENT]
Title: Visit
Date: 2026-08-10
Start: 1:00 PM
End: 2:00 PM
Address: 77 Oak Ave, Apt 4B, Hartford, CT 06103
[/EVENT]`;
    const items = parseSchedule(sample, settings);
    expect(items[0]?.address).toBe("77 Oak Ave, Apt 4B, Hartford, CT 06103");
  });

  it("empty Address field results in no address", () => {
    const items = parseSchedule(canonicalInput, settings);
    const laundry = items.find((i) => i.title.includes("Laundry"));
    expect(laundry?.address === undefined || laundry?.address === "").toBe(true);
  });

  it("explicit Address field overrides any inferred location", () => {
    const sample = `[EVENT]
Title: Gym
Date: 2026-08-10
Start: 9:00 AM
End: 10:00 AM
Address: 99 Real St, Enfield, CT 06082
Location: Planet Fitness
[/EVENT]`;
    const items = parseSchedule(sample, settings);
    expect(items[0]?.address).toBe("99 Real St, Enfield, CT 06082");
  });

  it("multiple EVENT and TASK blocks in one paste all parse", () => {
    const items = parseSchedule(canonicalInput, settings);
    const events = items.filter((i) => i.type === "calendar");
    const tasks = items.filter((i) => i.type === "reminder");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
  });

  it("malformed block does not break other valid blocks", () => {
    const withBroken = `[EVENT]
Title: Broken Event
[/EVENT]

[EVENT]
Title: Good Event
Date: 2026-08-10
Start: 9:00 AM
End: 10:00 AM
Address: 123 Test St, Springfield, MA
[/EVENT]`;
    const items = parseSchedule(withBroken, settings);
    const good = items.find((i) => i.title === "Good Event");
    expect(good).toBeDefined();
    expect(good?.address).toBe("123 Test St, Springfield, MA");
  });

  it("existing natural-language imports still work", () => {
    const natural = `Date: Saturday, August 8, 2026

8/8/26 9:30 AM - 11:30 AM
💪 Gym

8/8/26 1:00 PM
🧼 Clean Bathroom`;
    const items = parseSchedule(natural, settings);
    expect(items).toHaveLength(2);
    expect(items[0]?.type).toBe("calendar");
    expect(items[1]?.type).toBe("reminder");
  });
});
