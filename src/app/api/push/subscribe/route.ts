import { NextResponse } from "next/server";
import { saveSubscription } from "@/lib/server/subscriptionStore";
import { type PushSubscriptionRecord, type WebPushSubscriptionJson } from "@/lib/types";

interface SubscribeRequestBody {
  deviceId?: string;
  subscription?: WebPushSubscriptionJson;
  timezone?: string;
  dailyReminderEnabled?: boolean;
  dailyReminderTime?: string;
  dailyReminderMessage?: string;
}

function isValidSubscription(value: unknown): value is WebPushSubscriptionJson {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<WebPushSubscriptionJson>;
  return (
    typeof candidate.endpoint === "string" &&
    typeof candidate.keys === "object" &&
    candidate.keys !== null &&
    typeof (candidate.keys as { p256dh?: unknown }).p256dh === "string" &&
    typeof (candidate.keys as { auth?: unknown }).auth === "string"
  );
}

// Only push-subscription and scheduling metadata is ever persisted here — never schedule content.
export async function POST(request: Request) {
  let body: SubscribeRequestBody;
  try {
    body = (await request.json()) as SubscribeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { deviceId, subscription, timezone, dailyReminderEnabled, dailyReminderTime, dailyReminderMessage } = body;

  if (!deviceId || typeof deviceId !== "string") {
    return NextResponse.json({ error: "Missing deviceId." }, { status: 400 });
  }

  if (!isValidSubscription(subscription)) {
    return NextResponse.json({ error: "Missing or invalid push subscription." }, { status: 400 });
  }

  const record: PushSubscriptionRecord = {
    deviceId,
    subscription,
    timezone: typeof timezone === "string" && timezone ? timezone : "UTC",
    dailyReminderEnabled: Boolean(dailyReminderEnabled),
    dailyReminderTime: typeof dailyReminderTime === "string" && dailyReminderTime ? dailyReminderTime : "08:00",
    dailyReminderMessage:
      typeof dailyReminderMessage === "string" && dailyReminderMessage
        ? dailyReminderMessage
        : "Hey, did you plan your day already?",
    updatedAt: new Date().toISOString(),
  };

  try {
    await saveSubscription(record);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save subscription." },
      { status: 500 }
    );
  }
}
