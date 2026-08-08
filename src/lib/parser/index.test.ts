import { describe, expect, it } from "vitest";
import { buildIcsContent } from "../calendar/ics";
import { buildShortcutJson } from "../reminders/shortcut";
import { createDefaultSettings, parseSchedule } from "./index";

describe("canonical parser", () => {
  it("preserves emoji and unicode in titles", () => {
    const sample = `[EVENT]
Title: 💪 Gym
Date: 2026-08-11
Start: 10:30 AM
End: 12:30 PM
[/EVENT]

[TASK]
Title: 🍟 McDonald's | Enfield
[/TASK]

[TASK]
Title: 予定の確認 🌅
[/TASK]`;

    const parsed = parseSchedule(sample, createDefaultSettings());

    expect(parsed).toHaveLength(3);
    expect(parsed[0]?.title).toBe("💪 Gym");
    expect(parsed[1]?.title).toBe("🍟 McDonald's | Enfield");
    expect(parsed[2]?.title).toBe("予定の確認 🌅");
  });

  it("keeps location and address separate", () => {
    const sample = `[EVENT]
Title: 💪 Gym
Date: 2026-08-11
Start: 10:30 AM
End: 12:30 PM
Location: Planet Fitness
Address: 50 Holyoke St, Holyoke, MA 01040
[/EVENT]`;

    const [item] = parseSchedule(sample, createDefaultSettings());
    expect(item?.location).toBe("Planet Fitness");
    expect(item?.address).toBe("50 Holyoke St, Holyoke, MA 01040");
  });

  it("supports blank optional address", () => {
    const sample = `[EVENT]
Title: 🌅 Morning Routine
Date: 2026-08-11
Start: 7:30 AM
End: 8:00 AM
Address:
[/EVENT]`;

    const [item] = parseSchedule(sample, createDefaultSettings());
    expect(item?.address).toBe("");
  });

  it("normalizes alerts", () => {
    const sample = `[EVENT]
Title: 💪 Gym
Date: 2026-08-11
Start: 10:30 AM
End: 12:30 PM
Alert: AtTime
[/EVENT]

[TASK]
Title: 🧺 Start Laundry
Alert: AtDueTime
[/TASK]`;

    const parsed = parseSchedule(sample, createDefaultSettings());
    expect(parsed[0]?.alert).toBe("at_time");
    expect(parsed[1]?.alert).toBe("at_due_time");
  });

  it("parses travel time into minutes", () => {
    const sample = `[EVENT]
Title: 💪 Gym
Date: 2026-08-11
Start: 10:30 AM
End: 12:30 PM
TravelTime: 1h30m
[/EVENT]`;

    const [item] = parseSchedule(sample, createDefaultSettings());
    expect(item?.travelTimeMinutes).toBe(90);
  });

  it("applies default alerts and travel time when blank", () => {
    const settings = {
      ...createDefaultSettings(),
      defaultEventAlert: "1h",
      defaultReminderAlert: "30m",
      defaultTravelTimeMinutes: 45,
    };

    const sample = `[EVENT]
Title: 🌅 Morning Routine
Date: 2026-08-11
Start: 7:30 AM
End: 8:00 AM
Alert:
TravelTime:
[/EVENT]

[TASK]
Title: 🧺 Start Laundry
Alert:
[/TASK]`;

    const parsed = parseSchedule(sample, settings);
    expect(parsed[0]?.alert).toBe("1h");
    expect(parsed[0]?.travelTimeMinutes).toBe(45);
    expect(parsed[1]?.alert).toBe("30m");
  });

  it("supports URL and notes", () => {
    const sample = `[EVENT]
Title: 💪 Gym
Date: 2026-08-11
Start: 10:30 AM
End: 12:30 PM
URL: https://example.com
Notes: 2-hour workout
[/EVENT]`;

    const [item] = parseSchedule(sample, createDefaultSettings());
    expect(item?.url).toBe("https://example.com");
    expect(item?.notes).toBe("2-hour workout");
  });

  it("parses multiple events and tasks in mixed order", () => {
    const sample = `[EVENT]
Title: 🌅 Morning Routine
Date: 2026-08-11
Start: 7:30 AM
End: 8:00 AM
[/EVENT]

[TASK]
Title: 🧺 Start Laundry
[/TASK]

[EVENT]
Title: 🍟 McDonald's | Enfield
Date: 2026-08-11
Start: 4:00 PM
End: 12:45 AM
[/EVENT]`;

    const parsed = parseSchedule(sample, createDefaultSettings());
    expect(parsed).toHaveLength(3);
    expect(parsed.filter((item) => item.type === "calendar")).toHaveLength(2);
    expect(parsed.filter((item) => item.type === "reminder")).toHaveLength(1);
  });

  it("isolates malformed blocks from valid blocks", () => {
    const sample = `[EVENT]
Title: ✅ Valid Event
Date: 2026-08-11
Start: 10:30 AM
End: 12:30 PM
[/EVENT]

[EVENT]
Date: 2026-08-11
Start: 1:00 PM
End: 2:00 PM
[/EVENT]

[TASK]
Title: ✅ Valid Task
[/TASK]`;

    const parsed = parseSchedule(sample, createDefaultSettings());
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.title).toBe("✅ Valid Event");
    expect(parsed[1]?.title).toBe("✅ Valid Task");
  });

  it("keeps legacy structured support", () => {
    const sample = `[EVENT]
Date: 8/8/26
Start: 9:30 AM
End: 11:30 AM
Title: 💪 Gym
Travel: 30m

[TASK]
Title: 🧺 Start Laundry
List: Life General`;

    const parsed = parseSchedule(sample, createDefaultSettings());
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.travelTimeMinutes).toBe(30);
    expect(parsed[1]?.reminderList).toBe("Life General");
  });
});

describe("handoff builders", () => {
  it("builds ICS with emoji title, overnight end date, location/address, URL and alarm", () => {
    const [event] = parseSchedule(`[EVENT]
Title: 🍟 McDonald's | Enfield
Date: 2026-08-11
Start: 4:00 PM
End: 12:45 AM
Location: McDonald's
Address: 34 Enfield St, Enfield, CT
Alert: 1h
URL: https://example.com
Notes: Late stop
[/EVENT]`, createDefaultSettings());

    const ics = buildIcsContent([event!]);
    expect(ics).toContain("SUMMARY:🍟 McDonald's | Enfield");
    expect(ics).toContain("DTEND:20260812T004500");
    expect(ics).toContain("LOCATION:McDonald's — 34 Enfield St\\, Enfield\\, CT");
    expect(ics).toContain("URL:https://example.com");
    expect(ics).toContain("TRIGGER:-PT1H");
  });

  it("builds reminder shortcut payload with full title", () => {
    const [task] = parseSchedule(`[TASK]
Title: 🧺 Start Laundry
Date: 2026-08-11
Due: 9:30 AM
List: Life General
Column: Laundry
Alert: AtDueTime
[/TASK]`, createDefaultSettings());

    const payload = buildShortcutJson([task!]);
    expect(payload).toContain("🧺 Start Laundry");
    expect(payload).toContain("Life General");
    expect(payload).toContain("at_due_time");
  });
});
