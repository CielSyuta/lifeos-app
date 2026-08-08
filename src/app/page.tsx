"use client";

import { useEffect, useMemo, useState } from "react";
import { buildIcsContent } from "@/lib/calendar/ics";
import {
  detectDuplicateItems,
  formatDisplayDate,
  formatTimeLabel,
  learnItemRule,
  parseSchedule,
} from "@/lib/parser";
import { buildShortcutPayload, buildShortcutUrl } from "@/lib/reminders/shortcut";
import { clearAllData, loadActiveImport, loadHistory, loadSettings, saveActiveImport, saveHistory, saveSettings } from "@/lib/storage";
import type { ImportSession, ScheduleItem, UserSettings } from "@/lib/types";

const SAMPLE_SCHEDULE = `[EVENT]
Title: 🌅 Morning Routine
Date: 2026-08-11
Start: 7:30 AM
End: 8:00 AM
Location: Home
Address:
Calendar: Personal
Alert: AtTime
TravelTime:
Repeat: Never
URL:
Notes: Stretch and hydrate
[/EVENT]

[EVENT]
Title: 💪 Gym
Date: 2026-08-11
Start: 10:30 AM
End: 12:30 PM
Location: Planet Fitness
Address: 50 Holyoke St, Holyoke, MA 01040
Calendar: Personal
Alert: 30m
TravelTime: 30m
Repeat: Never
URL:
Notes: 2-hour workout
[/EVENT]

[TASK]
Title: 🧺 Start Laundry
Date: 2026-08-11
Due: 9:30 AM
List: Life General
Column: Laundry
Priority: Medium
Alert: AtDueTime
Repeat: Never
URL:
Notes: Start washer before leaving
[/TASK]`;

type AppTab = "import" | "history" | "settings";

const EVENT_ALERT_OPTIONS = ["none", "at_time", "5m", "10m", "15m", "30m", "1h", "2h", "1d"];
const REMINDER_ALERT_OPTIONS = ["none", "at_due_time", "5m", "10m", "15m", "30m", "1h", "2h", "1d"];
const TRAVEL_TIME_OPTIONS = ["none", "15", "30", "45", "60", "90"];

export default function Home() {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [scheduleText, setScheduleText] = useState(() => loadActiveImport()?.sourceText ?? SAMPLE_SCHEDULE);
  const [parsedItems, setParsedItems] = useState<ScheduleItem[]>(() => loadActiveImport()?.items ?? []);
  const [history, setHistory] = useState<ImportSession[]>(() => loadHistory());
  const [activeImport, setActiveImport] = useState<ImportSession | null>(() => loadActiveImport());
  const [activeTab, setActiveTab] = useState<AppTab>("import");
  const [statusMessage, setStatusMessage] = useState("Paste a schedule, parse it, then add items one-by-one.");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    saveActiveImport(activeImport);
  }, [activeImport]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    for (const item of parsedItems) {
      const list = groups.get(item.date || "No Date") ?? [];
      list.push(item);
      groups.set(item.date || "No Date", list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [parsedItems]);

  const editingItem = parsedItems.find((item) => item.id === editingId) ?? null;

  function persistItems(nextItems: ScheduleItem[]) {
    setParsedItems(nextItems);
    setActiveImport((current) => (current ? { ...current, items: nextItems } : current));
  }

  function updateItem(id: string, patch: Partial<ScheduleItem>) {
    const nextItems = parsedItems.map((item) => {
      if (item.id !== id) {
        return item;
      }
      const nextItem = { ...item, ...patch, edited: true };
      if (patch.title !== undefined) {
        nextItem.emoji = extractEmoji(nextItem.title);
      }
      if (patch.type !== undefined) {
        nextItem.inferredType = patch.type;
      }
      return nextItem;
    });

    persistItems(nextItems);
    const edited = nextItems.find((item) => item.id === id);
    if (edited) {
      setSettings((current) => learnItemRule(edited, current));
    }
  }

  function parseCurrentSchedule() {
    if (!scheduleText.trim()) {
      setStatusMessage("Paste a schedule first.");
      return;
    }

    const nextItems = detectDuplicateItems(parseSchedule(scheduleText, settings));
    persistItems(nextItems);
    setAddedIds(new Set());

    const session: ImportSession = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceText: scheduleText,
      items: nextItems,
      eventCount: nextItems.filter((item) => item.type === "calendar").length,
      reminderCount: nextItems.filter((item) => item.type === "reminder").length,
    };

    setActiveImport(session);
    setStatusMessage(`Parsed ${nextItems.length} item${nextItems.length === 1 ? "" : "s"}. Review and tap Add.`);
  }

  function addItem(item: ScheduleItem) {
    const isFirstAdd = addedIds.size === 0;

    if (item.type === "calendar") {
      const icsContent = buildIcsContent([item]);
      const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(item.title)}.ics`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage("Event file generated. Open it to add to Apple Calendar.");
    } else {
      const payload = buildShortcutPayload([item]);
      window.location.assign(buildShortcutUrl(payload));
      setStatusMessage("Reminder handoff opened. Complete the shortcut flow in iOS.");
    }

    setAddedIds((current) => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });

    if (settings.saveImportHistory && isFirstAdd) {
      const now = new Date().toISOString();
      const session: ImportSession = {
        id: activeImport?.id ?? crypto.randomUUID(),
        createdAt: activeImport?.createdAt ?? now,
        sourceText: scheduleText,
        items: parsedItems,
        exportDate: now,
        eventCount: parsedItems.filter((entry) => entry.type === "calendar").length,
        reminderCount: parsedItems.filter((entry) => entry.type === "reminder").length,
        notes: "Started individual add flow",
      };
      setActiveImport(session);
      setHistory((current) => [session, ...current].slice(0, 20));
    }
  }

  function resetAddedState() {
    setAddedIds(new Set());
    setStatusMessage("Added state reset.");
  }

  function reopenSession(session: ImportSession) {
    setScheduleText(session.sourceText);
    setParsedItems(session.items);
    setActiveImport(session);
    setAddedIds(new Set());
    setActiveTab("import");
    setStatusMessage("History import reopened.");
  }

  return (
    <div className={settings.darkMode ? "dark" : ""}>
      <main className="min-h-screen bg-[#f0f2f7] px-4 pb-28 pt-5 text-[#0a0e1a] dark:bg-[#07080d] dark:text-[#eef0f8]">
        <div className="mx-auto max-w-[430px]">
          <header className="mb-4">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-[#007aff] dark:text-[#60a5fa]">Schedule Parser</p>
            <h1 className="mt-1 text-3xl font-bold">Paste → Parse → Add</h1>
            <p className="mt-1 text-sm text-[#5c6478] dark:text-[#8892a4]">Import utility for Apple Calendar and Reminders handoff.</p>
          </header>

          <nav className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-black/5 dark:bg-[#0f1117] dark:ring-white/6">
            {(["import", "history", "settings"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold capitalize ${activeTab === tab ? "bg-[#007aff] text-white dark:bg-[#3b82f6]" : "text-[#5c6478] dark:text-[#8892a4]"}`}
              >
                {tab}
              </button>
            ))}
          </nav>

          {activeTab === "import" && (
            <section>
              <div className="card-list">
                <div className="card-row border-b-0">
                  <textarea
                    value={scheduleText}
                    onChange={(event) => setScheduleText(event.target.value)}
                    className="min-h-[180px] w-full resize-none rounded-xl bg-[#f0f2f7] p-3 text-sm leading-6 text-[#0a0e1a] outline-none dark:bg-[#161820] dark:text-[#eef0f8]"
                    placeholder="Paste schedule text or canonical [EVENT]/[TASK] blocks"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 p-3 pt-0">
                  <ActionButton label="Sample" onClick={() => setScheduleText(SAMPLE_SCHEDULE)} tone="ghost" />
                  <ActionButton label="Clear" onClick={() => { setScheduleText(""); setParsedItems([]); setAddedIds(new Set()); }} tone="ghost" />
                  <ActionButton label="Parse" onClick={parseCurrentSchedule} tone="primary" />
                </div>
              </div>

              <p className="mt-3 rounded-xl bg-[#e8f2ff] px-3 py-2 text-xs font-medium text-[#0057b7] dark:bg-[#0c1e38] dark:text-[#93c5fd]">{statusMessage}</p>

              {parsedItems.length > 0 && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#9ca3af] dark:text-[#4b5563]">
                      {parsedItems.length} item{parsedItems.length === 1 ? "" : "s"}
                    </p>
                    <button type="button" onClick={resetAddedState} className="text-xs font-semibold text-[#007aff] dark:text-[#60a5fa]">
                      Reset Added
                    </button>
                  </div>

                  {groupedItems.map(([date, items]) => (
                    <section key={date}>
                      <div className="mb-1 flex items-center justify-between px-1">
                        <h2 className="text-sm font-semibold text-[#5c6478] dark:text-[#8892a4]">{date === "No Date" ? "No Date" : formatDisplayDate(date)}</h2>
                        <span className="text-xs text-[#9ca3af]">{items.length} items</span>
                      </div>
                      <div className="card-list">
                        {items.map((item) => (
                          <article key={item.id} className="card-row items-start justify-between">
                            <button type="button" onClick={() => setEditingId(item.id)} className="min-w-0 flex-1 text-left">
                              <p className="truncate text-[15px] font-semibold text-[#0a0e1a] dark:text-[#eef0f8]">{item.title}</p>
                              <p className="mt-1 text-xs text-[#5c6478] dark:text-[#8892a4]">{itemSummary(item, settings)}</p>
                              {item.location ? <p className="mt-1 text-xs text-[#5c6478] dark:text-[#8892a4]">{item.location}</p> : null}
                              {item.address ? (
                                <a
                                  href={`https://maps.apple.com/?q=${encodeURIComponent(item.address)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-0.5 inline-block text-xs text-[#007aff] underline-offset-2 hover:underline dark:text-[#60a5fa]"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {item.address}
                                </a>
                              ) : null}
                              {item.travelTimeMinutes !== null ? <p className="mt-1 text-xs text-[#5c6478] dark:text-[#8892a4]">Travel: {item.travelTimeMinutes} min</p> : null}
                              <p className="mt-1 text-xs text-[#5c6478] dark:text-[#8892a4]">Alert: {formatAlertLabel(item.alert)}</p>
                              {item.type === "reminder" ? (
                                <p className="mt-1 text-xs text-[#5c6478] dark:text-[#8892a4]">{item.reminderList}{item.reminderColumn ? ` > ${item.reminderColumn}` : ""}</p>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={() => addItem(item)}
                              className={`ml-3 shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${addedIds.has(item.id) ? "bg-[#e7f8ec] text-[#15803d] dark:bg-[#0f2c18] dark:text-[#86efac]" : "bg-[#007aff] text-white dark:bg-[#3b82f6]"}`}
                            >
                              {addedIds.has(item.id) ? "✓ Added" : "Add"}
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}

                  <p className="rounded-xl bg-[#fff7e6] px-3 py-2 text-xs text-[#92400e] dark:bg-[#2b1f08] dark:text-[#fcd34d]">
                    Travel Time is preserved in Parser data and shown here. Some iOS/PWA calendar handoff paths may not apply native Apple travel-time settings directly.
                  </p>
                </div>
              )}
            </section>
          )}

          {activeTab === "history" && (
            <section>
              {history.length === 0 ? (
                <p className="rounded-xl bg-white p-4 text-sm text-[#5c6478] shadow-sm ring-1 ring-black/5 dark:bg-[#0f1117] dark:text-[#8892a4] dark:ring-white/6">No history yet.</p>
              ) : (
                <div className="card-list">
                  {history.map((session) => (
                    <div key={session.id} className="card-row justify-between">
                      <button type="button" onClick={() => reopenSession(session)} className="text-left">
                        <p className="text-sm font-semibold text-[#0a0e1a] dark:text-[#eef0f8]">{new Date(session.createdAt).toLocaleString()}</p>
                        <p className="text-xs text-[#5c6478] dark:text-[#8892a4]">{session.eventCount} events · {session.reminderCount} tasks</p>
                      </button>
                      <button type="button" onClick={() => setHistory((current) => current.filter((entry) => entry.id !== session.id))} className="text-xs font-semibold text-[#ef4444]">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "settings" && (
            <section className="space-y-4">
              <div className="card-list">
                <TextSetting label="Default Calendar" value={settings.defaultCalendar} onChange={(value) => setSettings((current) => ({ ...current, defaultCalendar: value }))} />
                <SelectSetting label="Default Event Alert" value={settings.defaultEventAlert} options={EVENT_ALERT_OPTIONS} onChange={(value) => setSettings((current) => ({ ...current, defaultEventAlert: value }))} />
                <TextSetting label="Default Reminder List" value={settings.defaultReminderList} onChange={(value) => setSettings((current) => ({ ...current, defaultReminderList: value }))} />
                <TextSetting label="Default Reminder Column" value={settings.defaultReminderColumn} onChange={(value) => setSettings((current) => ({ ...current, defaultReminderColumn: value }))} />
                <SelectSetting label="Default Reminder Alert" value={settings.defaultReminderAlert} options={REMINDER_ALERT_OPTIONS} onChange={(value) => setSettings((current) => ({ ...current, defaultReminderAlert: value }))} />
                <SelectSetting
                  label="Default Travel Time"
                  value={settings.defaultTravelTimeMinutes === null ? "none" : String(settings.defaultTravelTimeMinutes)}
                  options={TRAVEL_TIME_OPTIONS}
                  onChange={(value) => setSettings((current) => ({ ...current, defaultTravelTimeMinutes: value === "none" ? null : Number(value) }))}
                />
                <TextSetting label="Default Repeat" value={settings.defaultRepeat} onChange={(value) => setSettings((current) => ({ ...current, defaultRepeat: value }))} />
              </div>

              <div className="card-list">
                <SelectSetting label="Time Format" value={settings.timeFormat} options={["12h", "24h"]} onChange={(value) => setSettings((current) => ({ ...current, timeFormat: value as UserSettings["timeFormat"] }))} />
                <SwitchSetting label="Dark Mode" checked={settings.darkMode} onChange={(value) => setSettings((current) => ({ ...current, darkMode: value }))} />
                <SwitchSetting label="Auto-detect Type" checked={settings.autoDetectType} onChange={(value) => setSettings((current) => ({ ...current, autoDetectType: value }))} />
                <SwitchSetting label="Save Import History" checked={settings.saveImportHistory} onChange={(value) => setSettings((current) => ({ ...current, saveImportHistory: value }))} />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete all saved data?")) {
                    clearAllData();
                    window.location.reload();
                  }
                }}
                className="w-full rounded-xl bg-[#fee2e2] px-4 py-3 text-sm font-semibold text-[#ef4444] dark:bg-[#2d0f0f] dark:text-[#f87171]"
              >
                Delete All Data
              </button>
            </section>
          )}
        </div>
      </main>

      {editingItem && (
        <EditSheet
          key={editingItem.id}
          item={editingItem}
          settings={settings}
          onClose={() => setEditingId(null)}
          onSave={(patch) => {
            updateItem(editingItem.id, patch);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

function EditSheet({
  item,
  settings,
  onClose,
  onSave,
}: {
  item: ScheduleItem;
  settings: UserSettings;
  onClose: () => void;
  onSave: (patch: Partial<ScheduleItem>) => void;
}) {
  const [form, setForm] = useState<ScheduleItem>(item);

  return (
    <div className="fixed inset-0 z-40 bg-black/40 p-4">
      <div className="mx-auto max-h-[90vh] w-full max-w-[430px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-[#0f1117]">
        <h2 className="mb-3 text-lg font-semibold">{item.type === "calendar" ? "Event" : "Reminder"} Details</h2>

        <div className="space-y-2">
          <TextField label="Title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />

          {item.type === "calendar" ? (
            <>
              <TextField label="Location" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} />
              <TextField label="Address" value={form.address} onChange={(value) => setForm((current) => ({ ...current, address: value }))} />
              <SwitchField label="All-day" checked={form.allDay} onChange={(value) => setForm((current) => ({ ...current, allDay: value }))} />
              <TextField label="Start" value={form.startTime ?? ""} onChange={(value) => setForm((current) => ({ ...current, startTime: value || undefined }))} />
              <TextField label="End" value={form.endTime ?? ""} onChange={(value) => setForm((current) => ({ ...current, endTime: value || undefined }))} />
              <SelectField label="Travel Time" value={form.travelTimeMinutes === null ? "none" : String(form.travelTimeMinutes)} options={TRAVEL_TIME_OPTIONS} onChange={(value) => setForm((current) => ({ ...current, travelTimeMinutes: value === "none" ? null : Number(value) }))} />
              <TextField label="Repeat" value={form.repeat} onChange={(value) => setForm((current) => ({ ...current, repeat: value }))} />
              <TextField label="Calendar" value={form.calendar} onChange={(value) => setForm((current) => ({ ...current, calendar: value }))} />
              <TextField label="Invitees" value={form.invitees} onChange={(value) => setForm((current) => ({ ...current, invitees: value }))} />
              <SelectField label="Alert" value={form.alert} options={EVENT_ALERT_OPTIONS} onChange={(value) => setForm((current) => ({ ...current, alert: value }))} />
              <TextField label="URL" value={form.url} onChange={(value) => setForm((current) => ({ ...current, url: value }))} />
              <TextAreaField label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
            </>
          ) : (
            <>
              <TextField label="Date" value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
              <TextField label="Due" value={form.dueTime ?? ""} onChange={(value) => setForm((current) => ({ ...current, dueTime: value || undefined }))} />
              <TextField label="List" value={form.reminderList} onChange={(value) => setForm((current) => ({ ...current, reminderList: value }))} />
              <TextField label="Column" value={form.reminderColumn} onChange={(value) => setForm((current) => ({ ...current, reminderColumn: value }))} />
              <SelectField label="Priority" value={form.priority} options={["low", "medium", "high"]} onChange={(value) => setForm((current) => ({ ...current, priority: value as ScheduleItem["priority"] }))} />
              <TextField label="Repeat" value={form.repeat} onChange={(value) => setForm((current) => ({ ...current, repeat: value }))} />
              <SelectField label="Alert" value={form.alert} options={REMINDER_ALERT_OPTIONS} onChange={(value) => setForm((current) => ({ ...current, alert: value }))} />
              <TextField label="URL" value={form.url} onChange={(value) => setForm((current) => ({ ...current, url: value }))} />
              <TextAreaField label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-[#f3f4f6] px-3 py-2 text-sm font-semibold text-[#374151] dark:bg-[#1f2937] dark:text-[#d1d5db]">Cancel</button>
          <button
            type="button"
            onClick={() => {
              const patch: Partial<ScheduleItem> = {
                ...form,
                alert: item.type === "calendar"
                  ? EVENT_ALERT_OPTIONS.includes(form.alert) ? form.alert : settings.defaultEventAlert
                  : REMINDER_ALERT_OPTIONS.includes(form.alert) ? form.alert : settings.defaultReminderAlert,
              };
              onSave(patch);
            }}
            className="rounded-xl bg-[#007aff] px-3 py-2 text-sm font-semibold text-white dark:bg-[#3b82f6]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function itemSummary(item: ScheduleItem, settings: UserSettings): string {
  if (item.type === "calendar") {
    const start = item.startTime ? formatTimeLabel(item.startTime, settings.timeFormat) : "All day";
    const end = item.endTime ? formatTimeLabel(item.endTime, settings.timeFormat) : "";
    return end ? `${start} – ${end}` : start;
  }

  const due = item.dueTime ? formatTimeLabel(item.dueTime, settings.timeFormat) : "No time";
  return `Due ${due}`;
}

function formatAlertLabel(alert: string): string {
  switch (alert) {
    case "none":
      return "None";
    case "at_time":
      return "At time";
    case "at_due_time":
      return "At due time";
    case "1h":
      return "1 hour";
    case "2h":
      return "2 hours";
    case "1d":
      return "1 day";
    default:
      return alert;
  }
}

function safeFileName(title: string): string {
  return title.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim() || "event";
}

function extractEmoji(title: string): string {
  return title.match(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu)?.[0] ?? "";
}

function ActionButton({ label, onClick, tone }: { label: string; onClick: () => void; tone: "primary" | "ghost" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-semibold ${tone === "primary" ? "bg-[#007aff] text-white dark:bg-[#3b82f6]" : "bg-[#f0f2f7] text-[#0a0e1a] dark:bg-[#161820] dark:text-[#eef0f8]"}`}
    >
      {label}
    </button>
  );
}

function TextSetting({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="card-row justify-between">
      <span className="text-sm text-[#0a0e1a] dark:text-[#eef0f8]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-40 bg-transparent text-right text-sm text-[#5c6478] outline-none dark:text-[#8892a4]" />
    </label>
  );
}

function SelectSetting({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="card-row justify-between">
      <span className="text-sm text-[#0a0e1a] dark:text-[#eef0f8]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="max-w-40 bg-transparent text-right text-sm text-[#5c6478] outline-none dark:text-[#8892a4]">
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SwitchSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="card-row justify-between">
      <span className="text-sm text-[#0a0e1a] dark:text-[#eef0f8]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="ios-switch" />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6b7280] dark:text-[#9ca3af]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-[#161820]" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6b7280] dark:text-[#9ca3af]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-[#161820]">
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6b7280] dark:text-[#9ca3af]">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-20 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-[#161820]" />
    </label>
  );
}

function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
      <span className="text-sm">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="ios-switch" />
    </label>
  );
}
