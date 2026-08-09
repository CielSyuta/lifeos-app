import { type PushSubscriptionRecord } from "../types";

/**
 * Returns the current local date (YYYY-MM-DD) and time (HH:MM) for a given IANA timezone.
 * Falls back to UTC if the timezone is invalid.
 */
export function getLocalDateTime(timezone: string, now: Date = new Date()): { date: string; time: string } {
  let zone = timezone;
  try {
    // Validate the timezone; Intl throws for unsupported/garbage values.
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

/**
 * Decides whether a daily reminder is due for this subscription right now, given the cron job
 * runs on a fixed interval (e.g. every 15 minutes) rather than at the user's exact local time.
 * A record is due when the current local time has reached (but not passed by more than the
 * tolerance window) the configured reminder time, and it hasn't already been sent today.
 */
export function isDailyReminderDue(
  record: PushSubscriptionRecord,
  now: Date = new Date(),
  toleranceMinutes = 15
): boolean {
  if (!record.dailyReminderEnabled) {
    return false;
  }

  const { date: localDate, time: localTime } = getLocalDateTime(record.timezone, now);
  if (record.lastSentDate === localDate) {
    return false;
  }

  const targetMinutes = toMinutes(record.dailyReminderTime);
  const currentMinutes = toMinutes(localTime);
  if (targetMinutes === null || currentMinutes === null) {
    return false;
  }

  const diff = currentMinutes - targetMinutes;
  return diff >= 0 && diff < toleranceMinutes;
}

function toMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
