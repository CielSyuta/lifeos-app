import { registerPlugin } from "@capacitor/core";

import { buildIcsContent } from "@/lib/calendar/ics";
import { isNative } from "@/lib/native/environment";
import { type ScheduleItem } from "@/lib/types";

type NativeCalendarResult = {
  success: boolean;
  eventId?: string;
  error?: string;
};

interface CalendarEventOptions {
  title: string;
  startDate: string;
  endDate: string;
  location?: string;
  notes?: string;
  url?: string;
  isAllDay: boolean;
  calendarName?: string;
  alertOffset?: string;
}

interface LifeOSCalendarPlugin {
  addEvent(options: CalendarEventOptions): Promise<NativeCalendarResult>;
}

const calendarPlugin = registerPlugin<LifeOSCalendarPlugin>("LifeOSCalendar");

export async function addEventNative(item: ScheduleItem): Promise<{ success: boolean; error?: string }> {
  if (item.type !== "calendar") {
    return { success: false, error: "Schedule item is not a calendar event." };
  }

  if (isNative()) {
    try {
      const result = await calendarPlugin.addEvent(toCalendarEventOptions(item));
      return result.success ? { success: true } : { success: false, error: result.error ?? "Unable to add event." };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unable to add event." };
    }
  }

  return downloadIcsFallback(item);
}

function toCalendarEventOptions(item: ScheduleItem): CalendarEventOptions {
  const location = buildLocation(item);

  if (item.allDay) {
    return {
      title: item.title,
      startDate: item.date,
      endDate: addDays(item.date, 1),
      isAllDay: true,
      location: location || undefined,
      notes: item.notes || undefined,
      url: item.url || undefined,
      calendarName: item.calendar || undefined,
      alertOffset: item.alert || undefined,
    };
  }

  const startDate = combineDateAndTime(item.date, item.startTime || "09:00");
  let endDate = combineDateAndTime(item.date, item.endTime || item.startTime || "10:00");

  if (item.endTime && item.startTime && isOvernight(item.startTime, item.endTime)) {
    endDate = addDaysToDate(endDate, 1);
  }

  return {
    title: item.title,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    isAllDay: false,
    location: location || undefined,
    notes: item.notes || undefined,
    url: item.url || undefined,
    calendarName: item.calendar || undefined,
    alertOffset: item.alert || undefined,
  };
}

function downloadIcsFallback(item: ScheduleItem): { success: boolean; error?: string } {
  if (typeof window === "undefined") {
    return { success: false, error: "ICS fallback requires a browser environment." };
  }

  const icsContent = buildIcsContent([item]);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${safeFileName(item.title)}.ics`;
  link.click();
  URL.revokeObjectURL(url);

  return { success: true };
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDaysToDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isOvernight(startTime: string, endTime: string): boolean {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return endHour * 60 + endMinute < startHour * 60 + startMinute;
}

function safeFileName(value: string): string {
  return value.trim().replace(/[^\w.-]+/g, "-") || "event";
}
