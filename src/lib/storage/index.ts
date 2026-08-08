import { createDefaultSettings, parseTravelTimeValue } from "../parser";
import { type ImportSession, type UserSettings } from "../types";

const SETTINGS_KEY = "schedule-parser-settings";
const LEGACY_SETTINGS_KEY = "lifeos-settings";
const HISTORY_KEY = "schedule-parser-history";
const LEGACY_HISTORY_KEY = "lifeos-history";
const ACTIVE_IMPORT_KEY = "schedule-parser-active-import";
const LEGACY_ACTIVE_IMPORT_KEY = "lifeos-active-import";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") {
    return createDefaultSettings();
  }

  const raw = window.localStorage.getItem(SETTINGS_KEY) ?? window.localStorage.getItem(LEGACY_SETTINGS_KEY);
  if (!raw) {
    return createDefaultSettings();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserSettings> & {
      defaultCalendarAlert?: string;
      defaultTravelTime?: string;
    };

    return {
      ...createDefaultSettings(),
      ...parsed,
      defaultEventAlert: parsed.defaultEventAlert ?? parsed.defaultCalendarAlert ?? createDefaultSettings().defaultEventAlert,
      defaultTravelTimeMinutes: parsed.defaultTravelTimeMinutes ?? parseLegacyTravelTime(parsed.defaultTravelTime),
      learnedRules: Array.isArray(parsed.learnedRules) ? parsed.learnedRules : [],
    };
  } catch {
    return createDefaultSettings();
  }
}

function parseLegacyTravelTime(value?: string): number | null {
  const normalized = value?.toLowerCase();
  if (!normalized || normalized === "none") return null;
  if (normalized === "manual" || normalized === "automatic") return null;
  return parseTravelTimeValue(normalized, null);
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadHistory(): ImportSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(HISTORY_KEY) ?? window.localStorage.getItem(LEGACY_HISTORY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as ImportSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: ImportSession[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function loadActiveImport(): ImportSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(ACTIVE_IMPORT_KEY) ?? window.localStorage.getItem(LEGACY_ACTIVE_IMPORT_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ImportSession;
  } catch {
    return null;
  }
}

export function saveActiveImport(session: ImportSession | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(ACTIVE_IMPORT_KEY);
    return;
  }

  window.localStorage.setItem(ACTIVE_IMPORT_KEY, JSON.stringify(session));
}

export function clearAllData(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(SETTINGS_KEY);
  window.localStorage.removeItem(HISTORY_KEY);
  window.localStorage.removeItem(ACTIVE_IMPORT_KEY);
  window.localStorage.removeItem(LEGACY_SETTINGS_KEY);
  window.localStorage.removeItem(LEGACY_HISTORY_KEY);
  window.localStorage.removeItem(LEGACY_ACTIVE_IMPORT_KEY);
}
