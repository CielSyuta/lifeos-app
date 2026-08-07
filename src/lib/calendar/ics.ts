import { type ScheduleItem } from "../types";

export function buildIcsContent(items: ScheduleItem[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LifeOS//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const item of items.filter((entry) => entry.type === "calendar")) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.id}@lifeos.app`);
    lines.push(`DTSTAMP:${formatIcsDateTime(new Date())}`);

    if (item.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(item.date)}`);
      const endDate = addDays(item.date, 1);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(endDate)}`);
    } else {
      const startDateTime = combineDateAndTime(item.date, item.startTime || "09:00");
      lines.push(`DTSTART:${formatIcsDateTime(startDateTime)}`);
      let endDateTime = combineDateAndTime(item.date, item.endTime || item.startTime || "10:00");
      if (item.endTime && item.startTime && isOvernight(item.startTime, item.endTime)) {
        endDateTime = addDaysToDate(endDateTime, 1);
      }
      lines.push(`DTEND:${formatIcsDateTime(endDateTime)}`);
    }

    lines.push(`SUMMARY:${escapeText(item.title)}`);
    if (item.notes) {
      lines.push(`DESCRIPTION:${escapeText(item.notes)}`);
    }
    if (item.location) {
      lines.push(`LOCATION:${escapeText(item.location)}`);
    }
    if (item.alert) {
      const trigger = formatAlarmTrigger(item.alert);
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

function combineDateAndTime(dateValue: string, timeValue: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

function addDays(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatIcsDate(date);
}

function addDaysToDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatIcsDate(date: Date | string): string {
  if (typeof date === "string") {
    const [year, month, day] = date.split("-").map(Number);
    return `${year.toString().padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  }
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatIcsDateTime(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;
}

function isOvernight(startTime: string, endTime: string): boolean {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return endHour * 60 + endMinute < startHour * 60 + startMinute;
}

function formatAlarmTrigger(alert: string): string {
  const normalized = alert.toLowerCase();
  const minutesMatch = normalized.match(/(\d+)\s*m/);
  if (minutesMatch) {
    return `-PT${minutesMatch[1]}M`;
  }
  if (normalized.includes("at due")) {
    return "-PT0M";
  }
  return "-PT30M";
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, " ");
}
