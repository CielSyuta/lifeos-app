import { afterEach, describe, expect, it, vi } from "vitest";
import { enableDailyReminder } from "./client";
import { type NotificationSettings } from "../types";

function baseNotificationSettings(): NotificationSettings {
  return {
    dailyReminderEnabled: false,
    dailyReminderTime: "08:00",
    dailyReminderMessage: "Hey, did you plan your day already?",
    eveningReminderEnabled: false,
    eveningReminderTime: "21:00",
    eveningReminderMessage: "Ready to plan tomorrow?",
    timezone: "America/New_York",
    deviceId: "device-1",
    pushSubscribed: false,
  };
}

/** Stubs a browser-like environment that satisfies isPushSupported(). */
function stubSupportedBrowser(notificationStub: { requestPermission: () => Promise<NotificationPermission> }) {
  vi.stubGlobal("Notification", notificationStub);
  vi.stubGlobal("window", { PushManager: function PushManager() {}, Notification: notificationStub });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("enableDailyReminder", () => {
  it("reports unsupported when the browser lacks Push/Notification/Service Worker APIs", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});

    const result = await enableDailyReminder(baseNotificationSettings());
    expect(result.status).toBe("unsupported");
  });

  it("reports permission-denied without crashing when the user declines", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
    stubSupportedBrowser({ requestPermission: vi.fn().mockResolvedValue("denied") });
    vi.stubGlobal("navigator", { serviceWorker: {} });

    const result = await enableDailyReminder(baseNotificationSettings());
    expect(result.status).toBe("permission-denied");
    if (result.status === "permission-denied") {
      expect(result.message).toContain("Notifications are disabled");
    }
  });

  it("registers a push subscription and posts it to the server on success", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

    const mockSubscription = { toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } }) };
    const mockRegistration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue(mockSubscription),
      },
    };

    stubSupportedBrowser({ requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve(mockRegistration) } });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await enableDailyReminder(baseNotificationSettings());
    expect(result.status).toBe("success");
    expect(mockRegistration.pushManager.subscribe).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscribe", expect.objectContaining({ method: "POST" }));
  });

  it("returns an error result (not a throw) when the server save fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

    const mockSubscription = { toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } }) };
    const mockRegistration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(mockSubscription),
        subscribe: vi.fn(),
      },
    };

    stubSupportedBrowser({ requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve(mockRegistration) } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await enableDailyReminder(baseNotificationSettings());
    expect(result.status).toBe("error");
  });
});
