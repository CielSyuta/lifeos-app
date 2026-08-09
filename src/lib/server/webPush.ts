import webpush from "web-push";
import { type PushSubscriptionRecord } from "../types";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@scheduleparser.app";

let configured = false;

function ensureConfigured(): boolean {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return false;
  }
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export type DailyReminderPayload = {
  type: "daily-planning-reminder";
  title: string;
  body: string;
};

/**
 * Sends a Web Push notification to a single subscription. Returns whether the subscription is
 * still valid (a 404/410 response means the browser has unsubscribed and the record should be
 * removed from the store).
 */
export async function sendPushNotification(
  record: PushSubscriptionRecord,
  payload: DailyReminderPayload
): Promise<{ sent: boolean; expired: boolean; error?: string }> {
  if (!ensureConfigured()) {
    return { sent: false, expired: false, error: "VAPID keys are not configured." };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: record.subscription.endpoint,
        keys: record.subscription.keys,
      },
      JSON.stringify(payload)
    );
    return { sent: true, expired: false };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const expired = statusCode === 404 || statusCode === 410;
    return {
      sent: false,
      expired,
      error: error instanceof Error ? error.message : "Unknown push error.",
    };
  }
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}
