export type ScheduleItemType = "calendar" | "reminder";
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
  address: string;
  calendar: string;
  reminderList: string;
  reminderColumn: string;
  priority: Priority;
  alert: string;
  travelTimeMinutes: number | null;
  repeat: string;
  url: string;
  invitees: string;
  allDay: boolean;
  completed: boolean;
  source: "natural" | "legacy" | "canonical";
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
  defaultEventAlert: string;
  defaultReminderList: string;
  defaultReminderColumn: string;
  defaultReminderAlert: string;
  defaultTravelTimeMinutes: number | null;
  defaultRepeat: string;
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
  alert?: string;
  repeat?: string;
  url?: string;
  notes?: string;
}

export interface ShortcutPayload {
  tasks: ShortcutReminderTask[];
}
