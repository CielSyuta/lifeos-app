import { type ScheduleItem, type ShortcutPayload } from "../types";

export function buildShortcutPayload(items: ScheduleItem[]): ShortcutPayload {
  return {
    tasks: items
      .filter((item) => item.type === "reminder")
      .map((item) => ({
        title: item.title,
        date: item.date,
        time: item.dueTime,
        list: item.reminderList,
        column: item.reminderColumn,
        priority: item.priority,
        notes: [item.notes, item.address ? `Address: ${item.address}` : ""].filter(Boolean).join("\n") || undefined,
      })),
  };
}

export function buildShortcutJson(items: ScheduleItem[]): string {
  return JSON.stringify(buildShortcutPayload(items), null, 2);
}

export function buildShortcutUrl(payload: ShortcutPayload): string {
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `shortcut://run-shortcut?name=LifeOS%20Import&input=text&text=${encoded}`;
}
