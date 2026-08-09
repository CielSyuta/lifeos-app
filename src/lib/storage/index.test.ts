import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal localStorage mock
function createStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => { delete store[k]; }); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

let mockStorage: ReturnType<typeof createStorageMock>;

beforeEach(() => {
  mockStorage = createStorageMock();
  vi.stubGlobal("window", { localStorage: mockStorage });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("onboarding state", () => {
  it("returns false when key is absent", async () => {
    const { loadOnboardingCompleted } = await import("./index");
    expect(loadOnboardingCompleted()).toBe(false);
  });

  it("returns true after saveOnboardingCompleted", async () => {
    const { loadOnboardingCompleted, saveOnboardingCompleted } = await import("./index");
    saveOnboardingCompleted();
    expect(loadOnboardingCompleted()).toBe(true);
  });

  it("treats legacy mock account key as already onboarded (migration)", async () => {
    mockStorage.setItem("sp_mock_account", JSON.stringify({ firstName: "Alex" }));
    const { loadOnboardingCompleted } = await import("./index");
    expect(loadOnboardingCompleted()).toBe(true);
  });
});

describe("clearAllData", () => {
  it("removes settings, history, and active import keys", async () => {
    mockStorage.setItem("schedule-parser-settings", "{}");
    mockStorage.setItem("schedule-parser-history", "[]");
    mockStorage.setItem("schedule-parser-active-import", "null");
    const { clearAllData } = await import("./index");
    clearAllData();
    expect(mockStorage.getItem("schedule-parser-settings")).toBeNull();
    expect(mockStorage.getItem("schedule-parser-history")).toBeNull();
    expect(mockStorage.getItem("schedule-parser-active-import")).toBeNull();
  });

  it("removes legacy mock account key", async () => {
    mockStorage.setItem("sp_mock_account", JSON.stringify({ firstName: "Alex" }));
    const { clearAllData } = await import("./index");
    clearAllData();
    expect(mockStorage.getItem("sp_mock_account")).toBeNull();
  });

  it("does not remove onboarding completed key", async () => {
    mockStorage.setItem("lifeos-onboarding-completed", "1");
    const { clearAllData } = await import("./index");
    clearAllData();
    expect(mockStorage.getItem("lifeos-onboarding-completed")).toBe("1");
  });
});

describe("settings migration", () => {
  it("reads legacy key when new key is absent", async () => {
    mockStorage.setItem("lifeos-settings", JSON.stringify({ defaultCalendar: "Work" }));
    const { loadSettings } = await import("./index");
    const settings = loadSettings();
    expect(settings.defaultCalendar).toBe("Work");
  });

  it("prefers new key over legacy key", async () => {
    mockStorage.setItem("lifeos-settings", JSON.stringify({ defaultCalendar: "Old" }));
    mockStorage.setItem("schedule-parser-settings", JSON.stringify({ defaultCalendar: "New" }));
    const { loadSettings } = await import("./index");
    const settings = loadSettings();
    expect(settings.defaultCalendar).toBe("New");
  });

  it("returns valid settings object on corrupted JSON", async () => {
    mockStorage.setItem("schedule-parser-settings", "{{BROKEN}");
    const { loadSettings } = await import("./index");
    const settings = loadSettings();
    expect(typeof settings.defaultCalendar).toBe("string");
    expect(typeof settings.darkMode).toBe("boolean");
  });

  it("fills in calendar defaults, routing rules, and notification settings when absent", async () => {
    mockStorage.setItem("schedule-parser-settings", JSON.stringify({ defaultCalendar: "Work" }));
    const { loadSettings } = await import("./index");
    const settings = loadSettings();
    expect(settings.calendarDefaults.personalCalendar).toBe("Personal");
    expect(settings.calendarDefaults.workCalendar).toBe("Work");
    expect(settings.calendarDefaults.otherCalendar).toBe("Other");
    expect(settings.calendarRoutingRules).toEqual([]);
    expect(settings.notificationSettings.dailyReminderEnabled).toBe(false);
    expect(settings.notificationSettings.dailyReminderTime).toBe("08:00");
  });
});

describe("notification settings persistence", () => {
  it("persists notification settings changes across save/load", async () => {
    const { loadSettings, saveSettings } = await import("./index");
    const { createDefaultSettings } = await import("../parser");

    const settings = createDefaultSettings();
    settings.notificationSettings.dailyReminderEnabled = true;
    settings.notificationSettings.dailyReminderTime = "09:15";
    settings.notificationSettings.dailyReminderMessage = "Plan away!";
    saveSettings(settings);

    const reloaded = loadSettings();
    expect(reloaded.notificationSettings.dailyReminderEnabled).toBe(true);
    expect(reloaded.notificationSettings.dailyReminderTime).toBe("09:15");
    expect(reloaded.notificationSettings.dailyReminderMessage).toBe("Plan away!");
  });

  it("stores the resolved IANA timezone", async () => {
    const { createDefaultSettings } = await import("../parser");
    const settings = createDefaultSettings();
    expect(typeof settings.notificationSettings.timezone).toBe("string");
    expect(settings.notificationSettings.timezone.length).toBeGreaterThan(0);
  });

  it("persists calendar routing rules across save/load", async () => {
    const { loadSettings, saveSettings } = await import("./index");
    const { createDefaultSettings } = await import("../parser");

    const settings = createDefaultSettings();
    settings.calendarRoutingRules = [{ id: "1", matchText: "Gym", targetCalendar: "Personal" }];
    saveSettings(settings);

    const reloaded = loadSettings();
    expect(reloaded.calendarRoutingRules).toEqual([{ id: "1", matchText: "Gym", targetCalendar: "Personal" }]);
  });
});
