"use client";

import { useEffect, useMemo, useState } from "react";
import { buildIcsContent } from "@/lib/calendar/ics";
import { buildShortcutJson } from "@/lib/reminders/shortcut";
import { detectDuplicateItems, formatDisplayDate, formatTimeLabel, learnItemRule, parseSchedule, resolveExportItems } from "@/lib/parser";
import { loadActiveImport, loadHistory, loadSettings, saveActiveImport, saveHistory, saveSettings } from "@/lib/storage";
import type { ImportSession, ScheduleItem, UserSettings } from "@/lib/types";

const SAMPLE_SCHEDULE = `Date: Saturday, August 8, 2026

8/8/26 7:30 AM - 8:00 AM
🌅 Morning Routine

8/8/26 8:00 AM - 8:30 AM
🍳 Breakfast

8/8/26 9:30 AM - 11:30 AM
💪 Gym

8/8/26 1:00 PM
🧼 Clean Bathroom

8/8/26 3:30 PM
🎒 Pack Work Bag

8/8/26 5:00 PM - 1:45 AM
🍟 McDonald's Enfield`;

type PillButtonProps = { active: boolean; label: string; onClick: () => void };

function PillButton({ active, label, onClick }: PillButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] transition ${active ? "bg-white/90 text-[#05070b]" : "bg-white/8 text-slate-300"}`}
    >
      {label}
    </button>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-white">{title}</h2>
      {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
    </div>
  );
}

export default function Home() {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [scheduleText, setScheduleText] = useState(() => loadActiveImport()?.sourceText ?? SAMPLE_SCHEDULE);
  const [parsedItems, setParsedItems] = useState<ScheduleItem[]>(() => loadActiveImport()?.items ?? []);
  const [history, setHistory] = useState<ImportSession[]>(() => loadHistory());
  const [activeImport, setActiveImport] = useState<ImportSession | null>(() => loadActiveImport());
  const [statusMessage, setStatusMessage] = useState("Paste a schedule and tap Parse.");
  const [successSummary, setSuccessSummary] = useState<{ eventCount: number; reminderCount: number; payload: string; icsContent: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

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
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }

    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [parsedItems]);

  function updateItem(id: string, patch: Partial<ScheduleItem>) {
    const nextItems = parsedItems.map((item) => {
      if (item.id !== id) {
        return item;
      }
      const nextItem = { ...item, ...patch };
      if (patch.title !== undefined) {
        nextItem.emoji = extractEmoji(nextItem.title);
      }
      if (patch.type !== undefined) {
        nextItem.inferredType = patch.type;
      }
      return nextItem;
    });
    setParsedItems(nextItems);
    setActiveImport((current) => (current ? { ...current, items: nextItems } : current));

    const edited = nextItems.find((item) => item.id === id);
    if (edited) {
      setSettings((current) => learnItemRule(edited, current));
    }
  }

  function deleteItem(id: string) {
    const nextItems = parsedItems.filter((item) => item.id !== id);
    setParsedItems(nextItems);
    setEditingItemId((current) => (current === id ? null : current));
    setActiveImport((current) => (current ? { ...current, items: nextItems } : current));
  }

  function parseCurrentSchedule() {
    if (!scheduleText.trim()) {
      setStatusMessage("Paste some text first.");
      return;
    }

    const parsed = parseSchedule(scheduleText, settings);
    const nextItems = detectDuplicateItems(parsed);
    setParsedItems(nextItems);

    const session: ImportSession = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceText: scheduleText,
      items: nextItems,
      eventCount: nextItems.filter((item) => item.type === "calendar").length,
      reminderCount: nextItems.filter((item) => item.type === "reminder").length,
    };

    setActiveImport(session);
    setStatusMessage(`Parsed ${nextItems.length} items. Tap Download .ics to export them.`);
    setSuccessSummary(null);
    setEditingItemId(nextItems[0]?.id ?? null);
  }

  function handleExport() {
    if (!parsedItems.length) {
      setStatusMessage("Parse something first.");
      return;
    }

    setIsExporting(true);
    const exportableItems = resolveExportItems(parsedItems);
    const icsContent = buildIcsContent(exportableItems);
    const payload = buildShortcutJson(exportableItems);
    const now = new Date().toISOString();
    const session: ImportSession = {
      id: crypto.randomUUID(),
      createdAt: now,
      sourceText: scheduleText,
      items: parsedItems,
      exportDate: now,
      eventCount: exportableItems.filter((item) => item.type === "calendar").length,
      reminderCount: exportableItems.filter((item) => item.type === "reminder").length,
      notes: `Exported ${exportableItems.length} items`,
    };

    if (settings.saveImportHistory) {
      setHistory((current) => [session, ...current].slice(0, 20));
    }

    setActiveImport(session);
    setSuccessSummary({ eventCount: session.eventCount, reminderCount: session.reminderCount, payload, icsContent });
    setStatusMessage("ICS ready. Open the file on your iPhone to add it to Calendar.");
    window.setTimeout(() => setIsExporting(false), 220);
  }

  function downloadIcs() {
    if (!successSummary) {
      return;
    }

    const blob = new Blob([successSummary.icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "schedule-import.ics";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Downloaded. Open the file in Files and tap it to add to Calendar.");
  }

  function copyPayload() {
    if (!successSummary) {
      return;
    }
    void navigator.clipboard.writeText(successSummary.payload);
    setStatusMessage("Reminder JSON copied.");
  }

  function loadSample() {
    setScheduleText(SAMPLE_SCHEDULE);
    setStatusMessage("Sample schedule loaded.");
  }

  function clearInput() {
    setScheduleText("");
    setParsedItems([]);
    setActiveImport(null);
    setSuccessSummary(null);
    setEditingItemId(null);
  }

  return (
    <main className="min-h-screen bg-[#06070b] px-3 py-3 text-slate-100 sm:px-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header className="rounded-[32px] border border-white/10 bg-[rgba(10,14,24,0.92)] p-4 shadow-[0_28px_70px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5dd3c6]">Schedule Import</p>
              <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-white">Paste. Parse. Add to Calendar.</h1>
              <p className="text-sm leading-6 text-slate-400">Paste text from ChatGPT, convert it into calendar-ready items, and download an .ics file for Apple Calendar.</p>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/8 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Items</p>
              <p className="text-lg font-semibold text-white">{parsedItems.length}</p>
            </div>
          </div>
        </header>

        <section className="rounded-[30px] border border-white/10 bg-[rgba(12,18,31,0.92)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle title="Import" subtitle="Paste your schedule and get an .ics file." />
            <div className="flex gap-2">
              <button type="button" onClick={loadSample} className="rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">Sample</button>
              <button type="button" onClick={clearInput} className="rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">Clear</button>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-3 shadow-inner shadow-black/20">
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Paste your plan</span>
              <textarea
                value={scheduleText}
                onChange={(event) => setScheduleText(event.target.value)}
                className="min-h-[250px] w-full rounded-[22px] border border-white/10 bg-[#05070b]/70 p-4 text-sm leading-6 text-slate-100 outline-none"
                placeholder="Paste your ChatGPT schedule here…"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={parseCurrentSchedule} className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#05070b] shadow-lg shadow-white/10">
              Parse
            </button>
            {parsedItems.length > 0 ? (
              <button type="button" onClick={handleExport} className="rounded-full border border-[#5dd3c6]/20 bg-[#5dd3c6]/10 px-4 py-3 text-sm font-semibold text-[#5dd3c6]">
                {isExporting ? "Preparing…" : "Download .ics"}
              </button>
            ) : null}
          </div>

          <div className="mt-4 rounded-[24px] border border-white/10 bg-[#05070b]/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Status</p>
            <p className="mt-2 text-sm text-slate-300">{statusMessage}</p>
          </div>
        </section>

        {parsedItems.length > 0 ? (
          <section className="rounded-[30px] border border-white/10 bg-[rgba(12,18,31,0.92)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle title="Preview" subtitle="Review what will be exported." />
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                {parsedItems.length} items
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {groupedItems.map(([date, items]) => (
                <div key={date} className="space-y-2">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{formatDisplayDate(date)}</p>
                  {items.map((item) => (
                    <div key={item.id} className="rounded-[24px] border border-white/10 bg-[#05070b]/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{item.emoji}</span>
                            <p className="text-base font-semibold text-white">{item.title}</p>
                          </div>
                          <p className="mt-2 text-sm text-slate-400">
                            {item.type === "calendar"
                              ? `${item.startTime ? formatTimeLabel(item.startTime, settings.timeFormat) : "All day"}${item.endTime ? ` - ${formatTimeLabel(item.endTime, settings.timeFormat)}` : ""}`
                              : `Due ${item.dueTime ? formatTimeLabel(item.dueTime, settings.timeFormat) : "time"}`}
                          </p>
                          {item.notes ? <p className="mt-2 text-sm text-slate-500">{item.notes}</p> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setEditingItemId(item.id)} className="rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">Edit</button>
                          <button type="button" onClick={() => deleteItem(item.id)} className="rounded-full border border-rose-400/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-300">Delete</button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${item.type === "calendar" ? "bg-[#5dd3c6]/20 text-[#5dd3c6]" : "bg-amber-500/20 text-amber-300"}`}>
                          {item.type === "calendar" ? "Calendar" : "Reminder"}
                        </span>
                        {item.duplicateAction === "skip" ? <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-300">Possible duplicate</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {editingItemId ? (
          <section className="rounded-[30px] border border-white/10 bg-[rgba(12,18,31,0.92)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle title="Edit item" subtitle="Adjust the parsed details before exporting." />
              <button type="button" onClick={() => setEditingItemId(null)} className="rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">Close</button>
            </div>
            {renderEditor(parsedItems.find((item) => item.id === editingItemId), updateItem, settings)}
          </section>
        ) : null}

        {successSummary ? (
          <section className="rounded-[30px] border border-[#5dd3c6]/20 bg-[linear-gradient(135deg,rgba(93,211,198,0.16),rgba(16,24,39,0.95))] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5dd3c6]">Export ready</p>
                <p className="mt-2 text-base font-semibold text-white">{successSummary.eventCount} calendar items • {successSummary.reminderCount} reminders</p>
              </div>
              <div className="rounded-full border border-[#5dd3c6]/20 bg-[#5dd3c6]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#5dd3c6]">Ready</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={downloadIcs} className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#05070b]">Download .ics</button>
              <button type="button" onClick={copyPayload} className="rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">Copy JSON</button>
            </div>
            <p className="mt-3 text-sm text-slate-300">On iPhone, open the downloaded file in Files and tap it to add it to Apple Calendar.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function renderEditor(
  item: ScheduleItem | undefined,
  updateItem: (id: string, patch: Partial<ScheduleItem>) => void,
  settings: UserSettings
) {
  if (!item) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-sm text-slate-400">
        <span className="mb-2 block text-slate-200">Title</span>
        <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
      </label>
      <label className="text-sm text-slate-400">
        <span className="mb-2 block text-slate-200">Date</span>
        <input type="date" value={item.date} onChange={(event) => updateItem(item.id, { date: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
      </label>
      {item.type === "calendar" ? (
        <>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Start</span>
            <input value={item.startTime || ""} onChange={(event) => updateItem(item.id, { startTime: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">End</span>
            <input value={item.endTime || ""} onChange={(event) => updateItem(item.id, { endTime: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Location</span>
            <input value={item.location} onChange={(event) => updateItem(item.id, { location: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Calendar</span>
            <input value={item.calendar} onChange={(event) => updateItem(item.id, { calendar: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Alert</span>
            <input value={item.alert} onChange={(event) => updateItem(item.id, { alert: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Travel</span>
            <select value={item.travelTime} onChange={(event) => updateItem(item.id, { travelTime: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100">
              <option value="none">None</option>
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Due Time</span>
            <input value={item.dueTime || ""} onChange={(event) => updateItem(item.id, { dueTime: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Reminder List</span>
            <input value={item.reminderList} onChange={(event) => updateItem(item.id, { reminderList: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Reminder Column</span>
            <input value={item.reminderColumn} onChange={(event) => updateItem(item.id, { reminderColumn: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Priority</span>
            <select value={item.priority} onChange={(event) => updateItem(item.id, { priority: event.target.value as ScheduleItem["priority"] })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-slate-200">Alert</span>
            <input value={item.alert} onChange={(event) => updateItem(item.id, { alert: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
          </label>
        </>
      )}
      <label className="text-sm text-slate-400 md:col-span-2">
        <span className="mb-2 block text-slate-200">Notes</span>
        <textarea value={item.notes} onChange={(event) => updateItem(item.id, { notes: event.target.value })} className="min-h-24 w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
      </label>
      <label className="flex items-center justify-between rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-sm text-slate-400">
        <span>Type</span>
        <select value={item.type} onChange={(event) => updateItem(item.id, { type: event.target.value as ScheduleItem["type"] })} className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-slate-100">
          <option value="calendar">Calendar Event</option>
          <option value="reminder">Reminder</option>
        </select>
      </label>
      <label className="flex items-center justify-between rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-sm text-slate-400">
        <span>Completed</span>
        <input type="checkbox" checked={item.completed} onChange={(event) => updateItem(item.id, { completed: event.target.checked })} className="h-4 w-4 rounded border-white/10" />
      </label>
      <div className="md:col-span-2 rounded-xl border border-white/10 bg-[#05070b] p-3 text-sm text-slate-400">
        <p className="text-slate-200">Smart defaults</p>
        <p className="mt-1">Current defaults: {settings.defaultCalendar} / {settings.defaultReminderList}</p>
      </div>
    </div>
  );
}

function extractEmoji(title: string): string {
  const match = title.match(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu);
  return match?.[0] || "🗓️";
}
