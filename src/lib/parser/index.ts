import { type LearnedRule, type Priority, type ScheduleItem, type TimeFormat, type UserSettings } from "../types";

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const CALENDAR_KEYWORDS = /work|shift|gym|appointment|meeting|movie|dinner|travel|class|lunch|breakfast|brunch|doctor|dentist|interview|coffee/i;
const REMINDER_KEYWORDS = /clean|laundry|pay|buy|call|remember|pack|review|charge|prep|submit|pickup/i;

const DEFAULTS: UserSettings = {
  defaultCalendar: "Personal",
  defaultReminderList: "Life General",
  defaultReminderColumn: "Home",
  defaultCalendarAlert: "30m",
  defaultReminderAlert: "at_due",
  defaultTravelTime: "none",
  timeFormat: "12h",
  theme: "dark",
  darkMode: true,
  compactMode: false,
  autoDetectType: true,
  autoSelectAll: false,
  saveImportHistory: true,
  defaultLocationBehavior: "ask",
  learnedRules: [],
};

export function createDefaultSettings(): UserSettings {
  return {
    ...DEFAULTS,
    learnedRules: [],
  };
}

export function parseSchedule(input: string, settings: UserSettings = createDefaultSettings()): ScheduleItem[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.includes("[EVENT]") || trimmed.includes("[TASK]")) {
    return parseStructuredSchedule(trimmed, settings);
  }

  return parseNaturalSchedule(trimmed, settings);
}

function parseStructuredSchedule(input: string, settings: UserSettings): ScheduleItem[] {
  const lines = input.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[(EVENT|TASK)\]$/i.test(trimmed)) {
      if (current.length) {
        blocks.push(current);
      }
      current = [trimmed];
      continue;
    }

    if (current.length) {
      current.push(line);
    }
  }

  if (current.length) {
    blocks.push(current);
  }

  return blocks
    .map((block) => parseStructuredBlock(block, settings))
    .filter((item): item is ScheduleItem => Boolean(item));
}

function parseStructuredBlock(block: string[], settings: UserSettings): ScheduleItem | null {
  const type = block[0].toLowerCase().includes("event") ? "calendar" : "reminder";
  const values: Record<string, string> = {};

  for (const line of block.slice(1)) {
    const match = line.match(/^([A-Za-z]+):\s*(.+)$/);
    if (match) {
      values[match[1].toLowerCase()] = match[2].trim();
    }
  }

  const title = values.title || "Untitled";
  const date = values.date ? formatDateString(values.date) : "";
  let itemType: ScheduleItem["type"] = type;
  if (settings.autoDetectType) {
    itemType = inferItemType(title, values.start, values.end, values.due);
  }

  const item: ScheduleItem = {
    id: crypto.randomUUID(),
    type: itemType,
    title: stripEmoji(title),
    emoji: extractEmoji(title),
    date,
    startTime: values.start ? normalizeTime(values.start) : undefined,
    endTime: values.end ? normalizeTime(values.end) : undefined,
    dueTime: values.due ? normalizeTime(values.due) : undefined,
    notes: values.notes || "",
    location: values.location || "",
    calendar: values.calendar || settings.defaultCalendar,
    reminderList: values.list || settings.defaultReminderList,
    reminderColumn: values.column || settings.defaultReminderColumn,
    priority: normalizePriority(values.priority),
    alert: normalizeAlert(values.alert, itemType, settings),
    travelTime: values.travel || settings.defaultTravelTime,
    allDay: false,
    completed: false,
    source: "structured",
    inferredType: itemType,
    edited: false,
  };

  return applyLearningRules(item, settings);
}

function parseNaturalSchedule(input: string, settings: UserSettings): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const lines = input.split(/\r?\n/).map((line) => line.trimEnd());
  let currentDate = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    const dateLabelMatch = line.match(/^Date:\s*(.+)$/i);
    if (dateLabelMatch) {
      currentDate = parseDateValue(dateLabelMatch[1]);
      continue;
    }

    const timeMatch = line.match(/^(?:(\d{1,2}\/\d{1,2}\/\d{2,4})\s+)?((?:\d{1,2}:\d{2}|\d{1,2})\s*(?:AM|PM)?)\s*(?:-\s*((?:\d{1,2}:\d{2}|\d{1,2})\s*(?:AM|PM)?))?$/i);
    if (!timeMatch) {
      continue;
    }

    const extractedDate = timeMatch[1] ? parseDateValue(timeMatch[1]) : currentDate;
    const startTime = timeMatch[2] ? normalizeTime(timeMatch[2]) : undefined;
    const endTime = timeMatch[3] ? normalizeTime(timeMatch[3]) : undefined;

    let title = "Untitled";
    const notes: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const candidate = lines[cursor].trim();
      if (!candidate) {
        cursor += 1;
        continue;
      }

      if (/^Date:\s*/i.test(candidate)) {
        break;
      }

      const nextTime = candidate.match(/^(?:(\d{1,2}\/\d{1,2}\/\d{2,4})\s+)?(?:\d{1,2}:\d{2}|\d{1,2})\s*(?:AM|PM)?(?:\s*-\s*(?:\d{1,2}:\d{2}|\d{1,2})\s*(?:AM|PM)?)?$/i);
      if (nextTime) {
        break;
      }

      if (title === "Untitled") {
        title = candidate;
      } else if (/^[•\-\*]\s*/.test(candidate)) {
        notes.push(candidate.replace(/^[•\-\*]\s*/, ""));
      } else {
        notes.push(candidate);
      }
      cursor += 1;
    }

    index = cursor - 1;
    const itemType: ScheduleItem["type"] = settings.autoDetectType ? inferItemType(title, startTime, endTime) : endTime ? "calendar" : "reminder";
    const item: ScheduleItem = {
      id: crypto.randomUUID(),
      type: itemType,
      title: stripEmoji(title),
      emoji: extractEmoji(title),
      date: extractedDate,
      startTime,
      endTime,
      dueTime: itemType === "reminder" && startTime ? startTime : undefined,
      notes: notes.join("\n"),
      location: "",
      calendar: settings.defaultCalendar,
      reminderList: settings.defaultReminderList,
      reminderColumn: settings.defaultReminderColumn,
      priority: "medium",
      alert: itemType === "calendar" ? settings.defaultCalendarAlert : settings.defaultReminderAlert,
      travelTime: settings.defaultTravelTime,
      allDay: false,
      completed: false,
      source: "natural",
      inferredType: itemType,
      edited: false,
    };

    items.push(applyLearningRules(item, settings));
  }

  return items;
}

export function applyLearningRules(item: ScheduleItem, settings: UserSettings): ScheduleItem {
  const key = normalizeTitleKey(item.title);
  const rule = settings.learnedRules.find((candidate) => candidate.titleKey === key);
  if (!rule) {
    return item;
  }

  const nextItem = { ...item };
  if (rule.type) {
    nextItem.type = rule.type;
  }
  if (rule.calendar) {
    nextItem.calendar = rule.calendar;
  }
  if (rule.reminderList) {
    nextItem.reminderList = rule.reminderList;
  }
  if (rule.reminderColumn) {
    nextItem.reminderColumn = rule.reminderColumn;
  }
  if (rule.priority) {
    nextItem.priority = rule.priority;
  }

  return nextItem;
}

export function detectDuplicateItems(items: ScheduleItem[]): ScheduleItem[] {
  const groups = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const key = duplicateKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return items.map((item) => {
    const group = groups.get(duplicateKey(item)) ?? [];
    if (group.length <= 1) {
      return { ...item, duplicateAction: "keep" };
    }
    const index = group.findIndex((candidate) => candidate.id === item.id);
    return { ...item, duplicateAction: index === 0 ? "keep" : "skip" };
  });
}

export function resolveExportItems(items: ScheduleItem[]): ScheduleItem[] {
  const groups = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const key = duplicateKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const exportItems: ScheduleItem[] = [];
  for (const item of items) {
    const group = groups.get(duplicateKey(item)) ?? [];
    if (group.length > 1 && item.duplicateAction === "skip") {
      continue;
    }
    if (group.length > 1 && item.duplicateAction === "replace") {
      exportItems.push(item);
      continue;
    }
    if (group.length <= 1) {
      exportItems.push(item);
      continue;
    }
    if (item.duplicateAction === "keep" || item.duplicateAction === undefined) {
      exportItems.push(item);
    }
  }

  return exportItems.filter((item) => !item.skipped);
}

export function learnItemRule(item: ScheduleItem, settings: UserSettings): UserSettings {
  const nextSettings = { ...settings, learnedRules: [...settings.learnedRules] };
  const key = normalizeTitleKey(item.title);
  const existingIndex = nextSettings.learnedRules.findIndex((rule) => rule.titleKey === key);
  const rule: LearnedRule = {
    titleKey: key,
    type: item.type,
    calendar: item.type === "calendar" ? item.calendar : undefined,
    reminderList: item.type === "reminder" ? item.reminderList : undefined,
    reminderColumn: item.type === "reminder" ? item.reminderColumn : undefined,
    priority: item.priority,
  };

  if (existingIndex >= 0) {
    nextSettings.learnedRules[existingIndex] = rule;
  } else {
    nextSettings.learnedRules.push(rule);
  }

  return nextSettings;
}

function inferItemType(title: string, start?: string, end?: string, due?: string): ScheduleItem["type"] {
  if (start && end) {
    return "calendar";
  }
  if (due) {
    return "reminder";
  }
  const normalized = title.toLowerCase();
  if (CALENDAR_KEYWORDS.test(normalized)) {
    return "calendar";
  }
  if (REMINDER_KEYWORDS.test(normalized)) {
    return "reminder";
  }
  return start || end ? "calendar" : "reminder";
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePriority(value?: string): Priority {
  const normalized = value?.toLowerCase();
  if (normalized === "high") {
    return "high";
  }
  if (normalized === "low") {
    return "low";
  }
  return "medium";
}

function normalizeAlert(value: string | undefined, type: ScheduleItem["type"], settings: UserSettings): string {
  if (value) {
    return value;
  }
  return type === "calendar" ? settings.defaultCalendarAlert : settings.defaultReminderAlert;
}

function normalizeTime(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    return trimmed;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const meridiem = match[3];

  if (meridiem) {
    const normalizedHour = meridiem === "PM" && hour !== 12 ? hour + 12 : hour === 12 && meridiem === "AM" ? 0 : hour;
    return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractEmoji(text: string): string {
  const match = text.match(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu);
  return match?.[0] || "🗓️";
}

function stripEmoji(text: string): string {
  return text.replace(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu, "").trim();
}

function formatDateString(value: string): string {
  const trimmed = value.trim();
  return parseDateValue(trimmed);
}

function parseDateValue(value: string): string {
  const trimmed = value.trim().replace(/^Date:\s*/i, "");
  if (!trimmed) {
    return "";
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const yearValue = slashMatch[3].length === 2 ? Number(`20${slashMatch[3]}`) : Number(slashMatch[3]);
    return formatIsoDate(yearValue, month, day);
  }

  const monthNameMatch = trimmed.match(/^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/i);
  if (monthNameMatch) {
    const month = MONTHS[monthNameMatch[1].toLowerCase()];
    const day = Number(monthNameMatch[2]);
    const yearValue = monthNameMatch[3] ? Number(monthNameMatch[3]) : new Date().getFullYear();
    if (month === undefined) {
      return "";
    }
    return formatIsoDate(yearValue, month + 1, day);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatIsoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return trimmed;
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function duplicateKey(item: ScheduleItem): string {
  return [item.type, item.title.toLowerCase(), item.date, item.startTime || item.dueTime || ""].join("::");
}

export function formatDisplayDate(date: string): string {
  if (!date) {
    return "";
  }
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatTimeLabel(value: string | undefined, format: TimeFormat = "12h"): string {
  if (!value) {
    return "";
  }
  const [hour, minute] = value.split(":").map(Number);
  if (format === "24h") {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}
