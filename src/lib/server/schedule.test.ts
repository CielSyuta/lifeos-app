import { describe, expect, it } from "vitest";
import { getLocalDateTime, isDailyReminderDue } from "./schedule";
import { type PushSubscriptionRecord } from "../types";

function baseRecord(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    deviceId: "device-1",
    subscription: { endpoint: "https://example.com/push", keys: { p256dh: "key", auth: "auth" } },
    timezone: "America/New_York",
    dailyReminderEnabled: true,
    dailyReminderTime: "08:00",
    dailyReminderMessage: "Hey, did you plan your day already?",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("timezone storage and local time resolution", () => {
  it("resolves local date/time for a valid IANA timezone", () => {
    // 12:00 UTC on 2026-01-15 is 07:00 in America/New_York (EST, UTC-5).
    const { date, time } = getLocalDateTime("America/New_York", new Date("2026-01-15T12:00:00.000Z"));
    expect(date).toBe("2026-01-15");
    expect(time).toBe("07:00");
  });

  it("falls back to UTC for an invalid timezone instead of throwing", () => {
    const { date, time } = getLocalDateTime("Not/AZone", new Date("2026-01-15T12:00:00.000Z"));
    expect(date).toBe("2026-01-15");
    expect(time).toBe("12:00");
  });
});

describe("daily reminder scheduling", () => {
  it("is due when local time has just reached the configured time", () => {
    const record = baseRecord({ dailyReminderTime: "08:00" });
    // 13:05 UTC = 08:05 America/New_York (EST).
    const due = isDailyReminderDue(record, new Date("2026-01-15T13:05:00.000Z"));
    expect(due).toBe(true);
  });

  it("is not due before the configured local time", () => {
    const record = baseRecord({ dailyReminderTime: "08:00" });
    // 12:00 UTC = 07:00 America/New_York.
    const due = isDailyReminderDue(record, new Date("2026-01-15T12:00:00.000Z"));
    expect(due).toBe(false);
  });

  it("is not due again the same local day once already sent", () => {
    const record = baseRecord({ dailyReminderTime: "08:00", lastSentDate: "2026-01-15" });
    const due = isDailyReminderDue(record, new Date("2026-01-15T13:05:00.000Z"));
    expect(due).toBe(false);
  });

  it("is not due when disabled", () => {
    const record = baseRecord({ dailyReminderEnabled: false });
    const due = isDailyReminderDue(record, new Date("2026-01-15T13:05:00.000Z"));
    expect(due).toBe(false);
  });

  it("respects each subscriber's own timezone rather than treating times as UTC", () => {
    const nyRecord = baseRecord({ timezone: "America/New_York", dailyReminderTime: "08:00" });
    const tokyoRecord = baseRecord({ deviceId: "device-2", timezone: "Asia/Tokyo", dailyReminderTime: "08:00" });

    // 13:05 UTC is 08:05 in New York (due) but 22:05 in Tokyo (not due).
    const now = new Date("2026-01-15T13:05:00.000Z");
    expect(isDailyReminderDue(nyRecord, now)).toBe(true);
    expect(isDailyReminderDue(tokyoRecord, now)).toBe(false);
  });
});
