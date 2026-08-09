import { registerPlugin } from "@capacitor/core";

import { isNative } from "@/lib/native/environment";
import { buildShortcutPayload, buildShortcutUrl } from "@/lib/reminders/shortcut";
import { type ScheduleItem } from "@/lib/types";

type NativeReminderResult = {
  success: boolean;
  reminderId?: string;
  error?: string;
};

interface ReminderOptions {
  title: string;
  dueDate: string;
  dueTime?: string;
  notes?: string;
  url?: string;
  priority: ScheduleItem["priority"];
  listName?: string;
  alertOffset?: string;
}

interface LifeOSRemindersPlugin {
  addReminder(options: ReminderOptions): Promise<NativeReminderResult>;
}

const remindersPlugin = registerPlugin<LifeOSRemindersPlugin>("LifeOSReminders");

export async function addReminderNative(item: ScheduleItem): Promise<{ success: boolean; error?: string }> {
  if (item.type !== "reminder") {
    return { success: false, error: "Schedule item is not a reminder." };
  }

  if (isNative()) {
    try {
      const result = await remindersPlugin.addReminder({
        title: item.title,
        dueDate: item.date,
        dueTime: item.dueTime || undefined,
        notes: item.notes || undefined,
        url: item.url || undefined,
        priority: item.priority,
        listName: item.reminderList || undefined,
        alertOffset: item.alert || undefined,
      });

      return result.success ? { success: true } : { success: false, error: result.error ?? "Unable to add reminder." };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unable to add reminder." };
    }
  }

  return openShortcutFallback(item);
}

function openShortcutFallback(item: ScheduleItem): { success: boolean; error?: string } {
  if (typeof window === "undefined") {
    return { success: false, error: "Shortcut fallback requires a browser environment." };
  }

  window.location.assign(buildShortcutUrl(buildShortcutPayload([item])));
  return { success: true };
}
