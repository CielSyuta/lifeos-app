import { NextResponse } from "next/server";
import { getSubscription, deleteSubscription } from "@/lib/server/subscriptionStore";
import { isPushConfigured, sendPushNotification } from "@/lib/server/webPush";

// Sends a single, real push through the actual production send path so the "Test Notification"
// button in Settings gives an honest signal about whether daily reminders will work.
export async function POST(request: Request) {
  let body: { deviceId?: string };
  try {
    body = (await request.json()) as { deviceId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.deviceId || typeof body.deviceId !== "string") {
    return NextResponse.json({ error: "Missing deviceId." }, { status: 400 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push notifications are not configured on the server yet." }, { status: 503 });
  }

  const record = await getSubscription(body.deviceId);
  if (!record) {
    return NextResponse.json({ error: "No push subscription found for this device." }, { status: 404 });
  }

  const result = await sendPushNotification(record, {
    type: "daily-planning-reminder",
    title: "Schedule Parser",
    body: `Test notification: ${record.dailyReminderMessage}`,
  });

  if (result.expired) {
    await deleteSubscription(body.deviceId);
  }

  if (!result.sent) {
    return NextResponse.json({ error: result.error ?? "Unable to send test notification." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
