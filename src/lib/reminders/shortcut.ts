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
        alert: item.alert,
        repeat: item.repeat,
        url: item.url,
        notes: item.notes,
      })),
  };
}

export function buildShortcutJson(items: ScheduleItem[]): string {
  return JSON.stringify(buildShortcutPayload(items), null, 2);
}

export function buildShortcutUrl(payload: ShortcutPayload): string {
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `shortcut://run-shortcut?name=Parser%20Import&input=text&text=${encoded}`;
}
