import { NextResponse } from "next/server";
import { deleteSubscription } from "@/lib/server/subscriptionStore";

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

  try {
    await deleteSubscription(body.deviceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove subscription." },
      { status: 500 }
    );
  }
}
