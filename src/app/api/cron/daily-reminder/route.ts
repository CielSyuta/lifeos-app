import { NextResponse } from "next/server";
import { deleteSubscription, listSubscriptions, saveSubscription } from "@/lib/server/subscriptionStore";
import { isDailyReminderDue, getLocalDateTime } from "@/lib/server/schedule";
import { isPushConfigured, sendPushNotification } from "@/lib/server/webPush";

// Triggered by Vercel Cron (see vercel.json) on a fixed schedule, e.g. every 15 minutes.
// Local JS timers cannot reliably fire when the PWA is closed, so daily reminders must be
// server-triggered and evaluated against each subscriber's own timezone and configured time.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret) {
    const expected = "Bearer " + secret;
    if (authHeader !== expected) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) {
    // This endpoint can trigger a bulk push send to every subscriber, so refuse to run
    // unauthenticated once deployed. CRON_SECRET must be configured for production/Vercel
    // environments; it's only optional for local development.
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ sent: 0, skipped: 0, error: "Push notifications are not configured." }, { status: 200 });
  }

  const now = new Date();
  const subscriptions = await listSubscriptions();

  let sent = 0;
  let skipped = 0;
  let removed = 0;

  for (const record of subscriptions) {
    if (!isDailyReminderDue(record, now)) {
      skipped += 1;
      continue;
    }

    const result = await sendPushNotification(record, {
      type: "daily-planning-reminder",
      title: "Schedule Parser",
      body: record.dailyReminderMessage,
    });

    if (result.expired) {
      await deleteSubscription(record.deviceId);
      removed += 1;
      continue;
    }

    if (result.sent) {
      const { date } = getLocalDateTime(record.timezone, now);
      await saveSubscription({ ...record, lastSentDate: date });
      sent += 1;
    }
  }

  return NextResponse.json({ sent, skipped, removed });
}
