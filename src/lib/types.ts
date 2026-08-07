export type ScheduleItemType = "calendar" | "reminder";
export type TravelMode = "none" | "manual" | "automatic";
export type Priority = "low" | "medium" | "high";
export type TimeFormat = "12h" | "24h";
export type ThemeMode = "dark" | "light" | "system";

export interface ScheduleItem {
  id: string;
  type: ScheduleItemType;
  title: string;
  emoji: string;
  date: string;
  startTime?: string;
  endTime?: string;
  dueTime?: string;
  notes: string;
  location: string;
  calendar: string;
  reminderList: string;
  reminderColumn: string;
  priority: Priority;
  alert: string;
  travelTime: TravelMode | string;
  allDay: boolean;
  completed: boolean;
  source: "natural" | "structured";
  inferredType: ScheduleItemType;
  duplicateAction?: "keep" | "skip" | "replace";
  edited: boolean;
  skipped?: boolean;
}

export interface LearnedRule {
  titleKey: string;
  type?: ScheduleItemType;
  calendar?: string;
  reminderList?: string;
  reminderColumn?: string;
  priority?: Priority;
}

export interface UserSettings {
  defaultCalendar: string;
  defaultReminderList: string;
  defaultReminderColumn: string;
  defaultCalendarAlert: string;
  defaultReminderAlert: string;
  defaultTravelTime: TravelMode | string;
  timeFormat: TimeFormat;
  theme: ThemeMode;
  darkMode: boolean;
  compactMode: boolean;
  autoDetectType: boolean;
  autoSelectAll: boolean;
  saveImportHistory: boolean;
  defaultLocationBehavior: string;
  learnedRules: LearnedRule[];
}

export interface ImportSession {
  id: string;
  createdAt: string;
  sourceText: string;
  items: ScheduleItem[];
  exportDate?: string;
  eventCount: number;
  reminderCount: number;
  notes?: string;
}

export interface ShortcutReminderTask {
  title: string;
  date: string;
  time?: string;
  list: string;
  column?: string;
  priority?: string;
  notes?: string;
}

export interface ShortcutPayload {
  tasks: ShortcutReminderTask[];
}
