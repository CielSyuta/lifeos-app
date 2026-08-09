import { promises as fs } from "fs";
import path from "path";
import { type PushSubscriptionRecord } from "../types";

/**
 * Durable store for push-subscription + scheduling metadata only (never schedule content).
 *
 * In production, set KV_REST_API_URL and KV_REST_API_TOKEN (e.g. Vercel KV / Upstash Redis REST
 * API) so subscriptions survive across serverless invocations. Without those, falls back to a
 * local JSON file — fine for local development, but not durable on serverless hosts.
 */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_KEY = "push-subscriptions";

const FILE_STORE_PATH = path.join(process.cwd(), ".data", "push-subscriptions.json");

function hasKv(): boolean {
  return Boolean(KV_URL && KV_TOKEN);
}

async function kvCommand<T>(command: unknown[]): Promise<T> {
  const response = await fetch(`${KV_URL}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + KV_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`KV request failed with status ${response.status}`);
  }

  const body = (await response.json()) as { result: T };
  return body.result;
}

async function readAllKv(): Promise<Record<string, PushSubscriptionRecord>> {
  const result = await kvCommand<string | null>(["GET", KV_KEY]);
  if (!result) {
    return {};
  }
  try {
    return JSON.parse(result) as Record<string, PushSubscriptionRecord>;
  } catch {
    return {};
  }
}

async function writeAllKv(records: Record<string, PushSubscriptionRecord>): Promise<void> {
  await kvCommand(["SET", KV_KEY, JSON.stringify(records)]);
}

async function readAllFile(): Promise<Record<string, PushSubscriptionRecord>> {
  try {
    const raw = await fs.readFile(FILE_STORE_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, PushSubscriptionRecord>;
  } catch {
    return {};
  }
}

async function writeAllFile(records: Record<string, PushSubscriptionRecord>): Promise<void> {
  await fs.mkdir(path.dirname(FILE_STORE_PATH), { recursive: true });
  await fs.writeFile(FILE_STORE_PATH, JSON.stringify(records, null, 2), "utf-8");
}

async function readAll(): Promise<Record<string, PushSubscriptionRecord>> {
  return hasKv() ? readAllKv() : readAllFile();
}

async function writeAll(records: Record<string, PushSubscriptionRecord>): Promise<void> {
  return hasKv() ? writeAllKv(records) : writeAllFile(records);
}

export async function saveSubscription(record: PushSubscriptionRecord): Promise<void> {
  const records = await readAll();
  records[record.deviceId] = record;
  await writeAll(records);
}

export async function getSubscription(deviceId: string): Promise<PushSubscriptionRecord | undefined> {
  const records = await readAll();
  return records[deviceId];
}

export async function deleteSubscription(deviceId: string): Promise<void> {
  const records = await readAll();
  delete records[deviceId];
  await writeAll(records);
}

export async function listSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const records = await readAll();
  return Object.values(records);
}
