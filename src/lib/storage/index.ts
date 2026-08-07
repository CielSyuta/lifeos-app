import { createDefaultSettings } from "../parser";
import { type ImportSession, type UserSettings } from "../types";

const SETTINGS_KEY = "lifeos-settings";
const HISTORY_KEY = "lifeos-history";
const ACTIVE_IMPORT_KEY = "lifeos-active-import";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") {
    return createDefaultSettings();
  }

  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return createDefaultSettings();
  }

  try {
    return {
      ...createDefaultSettings(),
      ...JSON.parse(raw),
      learnedRules: Array.isArray(JSON.parse(raw).learnedRules) ? JSON.parse(raw).learnedRules : [],
    };
  } catch {
    return createDefaultSettings();
  }
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

  const raw = window.localStorage.getItem(HISTORY_KEY);
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

  const raw = window.localStorage.getItem(ACTIVE_IMPORT_KEY);
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
