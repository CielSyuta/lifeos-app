import { type NotificationSettings, type WebPushSubscriptionJson } from "../types";
import { isPushSupported } from "./environment";

export type EnableReminderResult =
  | { status: "success" }
  | { status: "unsupported"; message: string }
  | { status: "needs-install"; message: string }
  | { status: "permission-denied"; message: string }
  | { status: "error"; message: string };

/**
 * Runs the full "Enable Daily Reminder" flow: requests Notification permission (only when the
 * user explicitly taps the button), registers a Push subscription, and saves it to the server.
 * Never throws — every failure mode resolves to a typed result so the UI can show clear feedback.
 */
export async function enableDailyReminder(notificationSettings: NotificationSettings): Promise<EnableReminderResult> {
  if (!isPushSupported()) {
    return { status: "unsupported", message: "Push notifications are not supported in this browser." };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { status: "error", message: "Push notifications are not configured on the server yet." };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        status: "permission-denied",
        message: "Notifications are disabled. You can continue using Schedule Parser without them.",
      };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: notificationSettings.deviceId,
        subscription: subscription.toJSON() as WebPushSubscriptionJson,
        timezone: notificationSettings.timezone,
        dailyReminderEnabled: true,
        dailyReminderTime: notificationSettings.dailyReminderTime,
        dailyReminderMessage: notificationSettings.dailyReminderMessage,
      }),
    });

    if (!response.ok) {
      return { status: "error", message: "Could not save your reminder preference. Please try again." };
    }

    return { status: "success" };
  } catch {
    return { status: "error", message: "Something went wrong enabling notifications." };
  }
}

/** Pushes updated reminder preferences (time/message/enabled) to the server for an existing subscription. */
export async function syncReminderPreferences(notificationSettings: NotificationSettings): Promise<boolean> {
  if (!notificationSettings.pushSubscribed || !isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return false;
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: notificationSettings.deviceId,
        subscription: subscription.toJSON() as WebPushSubscriptionJson,
        timezone: notificationSettings.timezone,
        dailyReminderEnabled: notificationSettings.dailyReminderEnabled,
        dailyReminderTime: notificationSettings.dailyReminderTime,
        dailyReminderMessage: notificationSettings.dailyReminderMessage,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function disableDailyReminder(deviceId: string): Promise<boolean> {
  try {
    const response = await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type TestNotificationResult = { success: boolean; message: string };

export async function sendTestNotification(deviceId: string): Promise<TestNotificationResult> {
  try {
    const response = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      return { success: false, message: body?.error ?? "Test notification failed." };
    }

    return { success: true, message: "Test notification sent. Check your device." };
  } catch {
    return { success: false, message: "Could not reach the server to send a test notification." };
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
