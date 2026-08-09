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

/** A simple, user-managed rule that routes matching event titles to a target calendar name. */
export interface CalendarRoutingRule {
  id: string;
  /** Substring matched case-insensitively against the event title. */
  matchText: string;
  /** Calendar name to assign when this rule matches. */
  targetCalendar: string;
}

export interface CalendarDefaults {
  personalCalendar: string;
  workCalendar: string;
  otherCalendar: string;
}

export interface NotificationSettings {
  dailyReminderEnabled: boolean;
  /** 24h "HH:MM" local time string, e.g. "08:00". */
  dailyReminderTime: string;
  dailyReminderMessage: string;
  /** Reserved for a future second reminder; not fully wired up yet. */
  eveningReminderEnabled: boolean;
  eveningReminderTime: string;
  eveningReminderMessage: string;
  /** IANA timezone name, e.g. "America/New_York", captured via Intl.DateTimeFormat. */
  timezone: string;
  /** Stable per-device id used to associate a push subscription with reminder preferences. */
  deviceId: string;
  /** Whether the user has completed the push subscription flow at least once. */
  pushSubscribed: boolean;
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
  calendarDefaults: CalendarDefaults;
  calendarRoutingRules: CalendarRoutingRule[];
  notificationSettings: NotificationSettings;
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

/** A minimal, standards-compliant Web Push subscription as returned by PushSubscription.toJSON(). */
export interface WebPushSubscriptionJson {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Server-side record for a single device's daily reminder preferences.
 * Only push-subscription and scheduling metadata is stored — never schedule content.
 */
export interface PushSubscriptionRecord {
  deviceId: string;
  subscription: WebPushSubscriptionJson;
  timezone: string;
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;
  dailyReminderMessage: string;
  /** ISO date (YYYY-MM-DD) in the user's timezone of the last successful send, to avoid duplicate sends. */
  lastSentDate?: string;
  updatedAt: string;
}
