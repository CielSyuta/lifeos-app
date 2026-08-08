import { type ScheduleItem } from "../types";

export function buildIcsContent(items: ScheduleItem[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Schedule Parser//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const item of items.filter((entry) => entry.type === "calendar")) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.id}@scheduleparser.app`);
    lines.push(`DTSTAMP:${formatIcsDateTime(new Date())}`);

    if (item.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(item.date)}`);
      const endDate = addDays(item.date, 1);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(endDate)}`);
    } else {
      const startDateTime = combineDateAndTime(item.date, item.startTime || "09:00");
      lines.push(`DTSTART:${formatIcsDateTimeLocal(startDateTime)}`);
      let endDateTime = combineDateAndTime(item.date, item.endTime || item.startTime || "10:00");
      if (item.endTime && item.startTime && isOvernight(item.startTime, item.endTime)) {
        endDateTime = addDaysToDate(endDateTime, 1);
      }
      lines.push(`DTEND:${formatIcsDateTimeLocal(endDateTime)}`);
    }

    lines.push(`SUMMARY:${escapeText(item.title)}`);

    if (item.notes) {
      lines.push(`DESCRIPTION:${escapeText(item.notes)}`);
    }

    const location = buildLocation(item);
    if (location) {
      lines.push(`LOCATION:${escapeText(location)}`);
    }

    if (item.url) {
      lines.push(`URL:${escapeText(item.url)}`);
    }

    const trigger = formatAlarmTrigger(item.alert);
    if (trigger) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeText(item.title)}`);
      lines.push(`TRIGGER:${trigger}`);
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function buildLocation(item: ScheduleItem): string {
  if (item.location && item.address) {
    return `${item.location} — ${item.address}`;
  }
  return item.address || item.location;
}

function combineDateAndTime(dateValue: string, timeValue: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function addDays(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatIcsDate(date);
}

function addDaysToDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatIcsDate(date: Date | string): string {
  if (typeof date === "string") {
    const [year, month, day] = date.split("-").map(Number);
    return `${year.toString().padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function formatIcsDateTime(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;
}

function formatIcsDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
}

function isOvernight(startTime: string, endTime: string): boolean {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return endHour * 60 + endMinute < startHour * 60 + startMinute;
}

function formatAlarmTrigger(alert: string): string | null {
  switch (alert) {
    case "none":
      return null;
    case "at_time":
      return "-PT0M";
    case "at_due_time":
      return null;
    case "5m":
    case "10m":
    case "15m":
    case "30m": {
      return `-PT${alert.replace("m", "")}M`;
    }
    case "1h":
      return "-PT1H";
    case "2h":
      return "-PT2H";
    case "1d":
      return "-P1D";
    default:
      return null;
  }
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, " ");
}
