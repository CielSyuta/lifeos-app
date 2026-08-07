"use client";

import { useEffect, useMemo, useState } from "react";
import { buildIcsContent } from "@/lib/calendar/ics";
import { buildShortcutJson, buildShortcutUrl } from "@/lib/reminders/shortcut";
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

type TabKey = "today" | "import" | "history" | "settings" | "shortcut";

type TabButtonProps = { active: boolean; label: string; onClick: () => void; };

function TabButton({ active, label, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-sm font-medium transition ${active ? "bg-[#5dd3c6] text-[#03111b]" : "bg-[#111827] text-slate-300"}`}
    >
      {label}
    </button>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("import");
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [scheduleText, setScheduleText] = useState(() => loadActiveImport()?.sourceText ?? SAMPLE_SCHEDULE);
  const [parsedItems, setParsedItems] = useState<ScheduleItem[]>(() => loadActiveImport()?.items ?? []);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => loadActiveImport()?.items.map((item) => item.id) ?? []);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportSession[]>(() => loadHistory());
  const [activeImport, setActiveImport] = useState<ImportSession | null>(() => loadActiveImport());
  const [statusMessage, setStatusMessage] = useState("Paste a schedule and tap Parse Schedule.");
  const [successSummary, setSuccessSummary] = useState<{ eventCount: number; reminderCount: number; payload: string; icsContent: string } | null>(null);

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

  const todaySummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const allItems = history.flatMap((session) => session.items);
    const todayEvents = allItems.filter((item) => item.date === today && item.type === "calendar");
    const todayReminders = allItems.filter((item) => item.date === today && item.type === "reminder");
    const completedTasks = allItems.filter((item) => item.completed);
    const upcomingEvents = allItems.filter((item) => item.date >= today && item.type === "calendar").slice(0, 4);
    return {
      todayEvents: todayEvents.length,
      todayReminders: todayReminders.length,
      completedTasks: completedTasks.length,
      upcomingEvents,
    };
  }, [history]);

  function updateSettings(patch: Partial<UserSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

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
      const learnedSettings = learnItemRule(edited, settings);
      setSettings(learnedSettings);
    }
  }

  function deleteItem(id: string) {
    const nextItems = parsedItems.filter((item) => item.id !== id);
    setParsedItems(nextItems);
    setSelectedIds((current) => current.filter((value) => value !== id));
    setEditingItemId((current) => (current === id ? null : current));
    setActiveImport((current) => (current ? { ...current, items: nextItems } : current));
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function selectAll() {
    setSelectedIds(parsedItems.map((item) => item.id));
  }

  function deselectAll() {
    setSelectedIds([]);
  }

  function convertSelected(type: ScheduleItem["type"]) {
    const nextItems = parsedItems.map((item) => {
      if (!selectedIds.includes(item.id)) {
        return item;
      }
      return { ...item, type, inferredType: type, edited: true };
    });
    setParsedItems(nextItems);
    setActiveImport((current) => (current ? { ...current, items: nextItems } : current));
  }

  function deleteSelected() {
    const nextItems = parsedItems.filter((item) => !selectedIds.includes(item.id));
    setParsedItems(nextItems);
    setSelectedIds([]);
    setActiveImport((current) => (current ? { ...current, items: nextItems } : current));
  }

  function parseCurrentSchedule() {
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
    setActiveTab("import");
    setStatusMessage(`Parsed ${nextItems.length} items. Review and then add them to your exports.`);
    setSuccessSummary(null);
    setEditingItemId(nextItems[0]?.id ?? null);
    if (settings.autoSelectAll) {
      setSelectedIds(nextItems.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  }

  function handleAddAll() {
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
    setStatusMessage(`Imported ${session.eventCount} calendar items and ${session.reminderCount} reminders.`);
    setActiveTab("import");
  }

  function copyPayload() {
    if (!successSummary) {
      return;
    }
    void navigator.clipboard.writeText(successSummary.payload);
    setStatusMessage("Shortcut payload copied to clipboard.");
  }

  function downloadIcs() {
    if (!successSummary) {
      return;
    }
    const blob = new Blob([successSummary.icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lifeos-events.ics";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("ICS export downloaded.");
  }

  function loadSample() {
    setScheduleText(SAMPLE_SCHEDULE);
    setStatusMessage("Loaded the sample schedule fixture.");
  }

  function clearInput() {
    setScheduleText("");
    setParsedItems([]);
    setSelectedIds([]);
    setActiveImport(null);
    setSuccessSummary(null);
  }

  const selectedItems = parsedItems.filter((item) => selectedIds.includes(item.id));

  return (
    <main className="min-h-screen bg-[#05070b] px-3 pb-28 pt-3 text-slate-100 sm:px-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="rounded-[28px] border border-white/10 bg-gradient-to-br from-[#111827] to-[#05070b] p-4 shadow-2xl shadow-black/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-[#5dd3c6]">LifeOS</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">Your AI schedule to Apple-ready exports</h1>
              <p className="mt-2 text-sm text-slate-400">Paste a schedule from ChatGPT, review it, and hand off calendar plus reminders with minimal effort.</p>
            </div>
            <div className="rounded-2xl border border-[#5dd3c6]/30 bg-[#0f172a] px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Today</p>
              <p className="text-xl font-semibold text-[#5dd3c6]">{todaySummary.todayEvents + todaySummary.todayReminders} items</p>
            </div>
          </div>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-[#0d1422] p-3">
          <div className="flex flex-wrap gap-2">
            <TabButton active={activeTab === "today"} label="Today" onClick={() => setActiveTab("today")} />
            <TabButton active={activeTab === "import"} label="Import" onClick={() => setActiveTab("import")} />
            <TabButton active={activeTab === "shortcut"} label="Shortcut" onClick={() => setActiveTab("shortcut")} />
            <TabButton active={activeTab === "history"} label="History" onClick={() => setActiveTab("history")} />
            <TabButton active={activeTab === "settings"} label="Settings" onClick={() => setActiveTab("settings")} />
          </div>
        </section>

        {activeTab === "today" ? (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-[#0d1422] p-4">
            <SectionTitle title="Today" subtitle="A quick snapshot from your imported history." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
                <p className="text-sm text-slate-400">Events</p>
                <p className="mt-2 text-3xl font-semibold text-white">{todaySummary.todayEvents}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
                <p className="text-sm text-slate-400">Tasks</p>
                <p className="mt-2 text-3xl font-semibold text-white">{todaySummary.todayReminders}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
                <p className="text-sm text-slate-400">Completed</p>
                <p className="mt-2 text-3xl font-semibold text-[#5dd3c6]">{todaySummary.completedTasks}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
                <p className="text-sm text-slate-400">Upcoming</p>
                <p className="mt-2 text-3xl font-semibold text-white">{todaySummary.upcomingEvents.length}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Upcoming events</h3>
              <div className="mt-3 space-y-2">
                {todaySummary.upcomingEvents.length === 0 ? (
                  <p className="text-sm text-slate-400">Nothing loaded yet. Parse a schedule to populate this screen.</p>
                ) : (
                  todaySummary.upcomingEvents.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div>
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="text-sm text-slate-400">{formatDisplayDate(item.date)}</p>
                      </div>
                      <p className="text-sm text-[#5dd3c6]">{item.startTime ? formatTimeLabel(item.startTime, settings.timeFormat) : "All day"}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "import" ? (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-[#0d1422] p-4">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle title="Paste Your Schedule" subtitle="Supports natural ChatGPT output and structured [EVENT]/[TASK] blocks." />
              <div className="flex gap-2">
                <button type="button" onClick={loadSample} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Load Sample</button>
                <button type="button" onClick={clearInput} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Clear</button>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">Paste your plan here</span>
              <textarea
                value={scheduleText}
                onChange={(event) => setScheduleText(event.target.value)}
                className="min-h-48 w-full rounded-[24px] border border-white/10 bg-[#05070b] p-4 text-sm text-slate-100 outline-none ring-0"
                placeholder="Paste your ChatGPT schedule."
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={parseCurrentSchedule} className="rounded-full bg-[#5dd3c6] px-4 py-3 font-semibold text-[#04141d]">Parse Schedule</button>
              <button type="button" onClick={() => setActiveTab("settings")} className="rounded-full border border-white/10 px-4 py-3 text-sm text-slate-300">Adjust Defaults</button>
            </div>

            {statusMessage ? <p className="rounded-2xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-slate-400">{statusMessage}</p> : null}

            {parsedItems.length > 0 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={selectAll} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Select All</button>
                  <button type="button" onClick={deselectAll} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Deselect All</button>
                  <button type="button" onClick={() => convertSelected("calendar")} className="rounded-full border border-[#5dd3c6]/30 px-3 py-2 text-sm text-[#5dd3c6]">Convert to Calendar</button>
                  <button type="button" onClick={() => convertSelected("reminder")} className="rounded-full border border-[#5dd3c6]/30 px-3 py-2 text-sm text-[#5dd3c6]">Convert to Reminder</button>
                  <button type="button" onClick={deleteSelected} className="rounded-full border border-rose-400/20 px-3 py-2 text-sm text-rose-300">Delete Selected</button>
                  <button type="button" onClick={handleAddAll} className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#05070b]">Add All</button>
                </div>

                {selectedItems.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-[#111827] p-3 text-sm text-slate-400">
                    <p>{selectedItems.length} selected</p>
                  </div>
                ) : null}

                {editingItemId ? (
                  <div className="rounded-[24px] border border-white/10 bg-[#111827] p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Edit selected item</h3>
                      <button type="button" onClick={() => setEditingItemId(null)} className="text-sm text-slate-400">Close</button>
                    </div>
                    {renderEditor(parsedItems.find((item) => item.id === editingItemId), updateItem, settings)}
                  </div>
                ) : null}

                {groupedItems.map(([date, items]) => (
                  <div key={date} className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#111827] px-3 py-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">{formatDisplayDate(date)}</p>
                      <p className="text-sm text-slate-400">{items.length} items</p>
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className="rounded-[24px] border border-white/10 bg-[#111827] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-start gap-3">
                            <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="mt-1 h-4 w-4 rounded border-white/10 bg-transparent" />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xl">{item.emoji}</span>
                                <p className="font-semibold text-white">{item.title}</p>
                                <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.25em] ${item.type === "calendar" ? "bg-[#5dd3c6]/20 text-[#5dd3c6]" : "bg-amber-500/20 text-amber-300"}`}>
                                  {item.type === "calendar" ? "Calendar" : "Reminder"}
                                </span>
                                {item.duplicateAction === "skip" ? <span className="rounded-full bg-rose-500/20 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-rose-300">Possible duplicate</span> : null}
                                {item.edited ? <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-slate-300">Edited</span> : null}
                              </div>
                              <p className="mt-1 text-sm text-slate-400">
                                {item.type === "calendar" ? `${item.startTime ? formatTimeLabel(item.startTime, settings.timeFormat) : "All day"}${item.endTime ? ` - ${formatTimeLabel(item.endTime, settings.timeFormat)}` : ""}` : `Due ${item.dueTime ? formatTimeLabel(item.dueTime, settings.timeFormat) : "time"}`}
                              </p>
                              {item.notes ? <p className="mt-2 text-sm text-slate-500">{item.notes}</p> : null}
                            </div>
                          </label>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setEditingItemId(item.id)} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Edit</button>
                            <button type="button" onClick={() => deleteItem(item.id)} className="rounded-full border border-rose-400/20 px-3 py-2 text-sm text-rose-300">Delete</button>
                          </div>
                        </div>
                        {item.duplicateAction === "skip" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => updateItem(item.id, { duplicateAction: "keep" })} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Keep</button>
                            <button type="button" onClick={() => updateItem(item.id, { duplicateAction: "replace" })} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Replace</button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}

            {successSummary ? (
              <div className="rounded-[24px] border border-[#5dd3c6]/20 bg-[#03111b] p-4">
                <h3 className="text-lg font-semibold text-white">Export ready</h3>
                <p className="mt-1 text-sm text-slate-400">{successSummary.eventCount} calendar events and {successSummary.reminderCount} reminders prepared.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={downloadIcs} className="rounded-full bg-[#5dd3c6] px-4 py-3 font-semibold text-[#04141d]">Download ICS</button>
                  <button type="button" onClick={copyPayload} className="rounded-full border border-white/10 px-4 py-3 text-sm text-slate-300">Copy Shortcut Payload</button>
                  <a href={buildShortcutUrl(JSON.parse(successSummary.payload))} className="rounded-full border border-white/10 px-4 py-3 text-sm text-slate-300">Open Shortcut URL</a>
                </div>
              </div>
            ) : null}

            <div className="rounded-[24px] border border-white/10 bg-[#111827] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Apple Shortcut Setup</h3>
              <p className="mt-2 text-sm text-slate-400">Use the payload from your export to build a shortcut that creates reminders in Apple Reminders. The payload is also copied when you tap Copy Shortcut Payload.</p>
            </div>
          </section>
        ) : null}

        {activeTab === "shortcut" ? (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-[#0d1422] p-4">
            <SectionTitle title="Apple Shortcut Setup" subtitle="Install a shortcut that accepts LifeOS JSON and creates reminders in Apple Reminders." />
            <div className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
              <p className="text-slate-200">How it works</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Parse a schedule and tap Add All.</li>
                <li>Use Copy Shortcut Payload to copy the reminder JSON.</li>
                <li>Create a Shortcut that accepts JSON input and creates reminders in the requested list.</li>
                <li>Optionally open the shortcut URL generated from your latest export.</li>
              </ol>
            </div>
            {successSummary ? (
              <div className="rounded-[24px] border border-[#5dd3c6]/20 bg-[#03111b] p-4">
                <p className="text-sm text-slate-400">Latest payload</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-xs text-slate-200">{successSummary.payload}</pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={copyPayload} className="rounded-full border border-white/10 px-4 py-3 text-sm text-slate-300">Copy Shortcut Payload</button>
                  <a href={buildShortcutUrl(JSON.parse(successSummary.payload))} className="rounded-full border border-white/10 px-4 py-3 text-sm text-slate-300">Open Shortcut URL</a>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">Run an export first to generate the payload.</p>
            )}
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-[#0d1422] p-4">
            <SectionTitle title="History" subtitle="Reopen prior imports and re-export them." />
            {history.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">No imports yet.</p>
            ) : (
              history.map((entry) => (
                <div key={entry.id} className="rounded-[24px] border border-white/10 bg-[#111827] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{new Date(entry.createdAt).toLocaleString()}</p>
                      <p className="text-sm text-slate-400">{entry.eventCount} calendar events • {entry.reminderCount} reminders</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => {
                        setScheduleText(entry.sourceText);
                        setParsedItems(entry.items);
                        setActiveImport(entry);
                        setActiveTab("import");
                      }} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Reopen</button>
                      <button type="button" onClick={() => {
                        const payload = buildShortcutJson(entry.items);
                        const icsContent = buildIcsContent(entry.items);
                        setSuccessSummary({ eventCount: entry.eventCount, reminderCount: entry.reminderCount, payload, icsContent });
                        setActiveTab("import");
                      }} className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">Re-export</button>
                      <button type="button" onClick={() => setHistory((current) => current.filter((item) => item.id !== entry.id))} className="rounded-full border border-rose-400/20 px-3 py-2 text-sm text-rose-300">Delete</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-[#0d1422] p-4">
            <SectionTitle title="Settings" subtitle="Default values and app behavior." />

            <div className="rounded-[24px] border border-white/10 bg-[#111827] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Account</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-400">
                <p><span className="text-slate-200">Username:</span> irazfromu@gmail.com</p>
                <p><span className="text-slate-200">Name:</span> JC Rivie Cartagena</p>
                <p><span className="text-slate-200">Nickname:</span> JC</p>
                <p className="text-xs text-slate-500">Registration is disabled for this version. Sign-in is not required.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                <span className="mb-2 block text-slate-200">Default Calendar</span>
                <input value={settings.defaultCalendar} onChange={(event) => updateSettings({ defaultCalendar: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
              </label>
              <label className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                <span className="mb-2 block text-slate-200">Default Reminder List</span>
                <input value={settings.defaultReminderList} onChange={(event) => updateSettings({ defaultReminderList: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
              </label>
              <label className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                <span className="mb-2 block text-slate-200">Default Reminder Column</span>
                <input value={settings.defaultReminderColumn} onChange={(event) => updateSettings({ defaultReminderColumn: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
              </label>
              <label className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                <span className="mb-2 block text-slate-200">Default Calendar Alert</span>
                <input value={settings.defaultCalendarAlert} onChange={(event) => updateSettings({ defaultCalendarAlert: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
              </label>
              <label className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                <span className="mb-2 block text-slate-200">Default Reminder Alert</span>
                <input value={settings.defaultReminderAlert} onChange={(event) => updateSettings({ defaultReminderAlert: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100" />
              </label>
              <label className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                <span className="mb-2 block text-slate-200">Travel Time</span>
                <select value={settings.defaultTravelTime} onChange={(event) => updateSettings({ defaultTravelTime: event.target.value as UserSettings["defaultTravelTime"] })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100">
                  <option value="none">None</option>
                  <option value="manual">Manual</option>
                  <option value="automatic">Automatic</option>
                </select>
              </label>
              <label className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                <span className="mb-2 block text-slate-200">Time format</span>
                <select value={settings.timeFormat} onChange={(event) => updateSettings({ timeFormat: event.target.value as UserSettings["timeFormat"] })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100">
                  <option value="12h">12-hour</option>
                  <option value="24h">24-hour</option>
                </select>
              </label>
              <label className="rounded-[24px] border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                <span className="mb-2 block text-slate-200">Theme</span>
                <select value={settings.theme} onChange={(event) => updateSettings({ theme: event.target.value as UserSettings["theme"] })} className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-slate-100">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </label>
            </div>

            <div className="space-y-2 rounded-[24px] border border-white/10 bg-[#111827] p-4">
              <label className="flex items-center justify-between text-sm text-slate-400">
                <span>Auto-detect event type</span>
                <input type="checkbox" checked={settings.autoDetectType} onChange={(event) => updateSettings({ autoDetectType: event.target.checked })} className="h-4 w-4 rounded border-white/10" />
              </label>
              <label className="flex items-center justify-between text-sm text-slate-400">
                <span>Auto-select all parsed items</span>
                <input type="checkbox" checked={settings.autoSelectAll} onChange={(event) => updateSettings({ autoSelectAll: event.target.checked })} className="h-4 w-4 rounded border-white/10" />
              </label>
              <label className="flex items-center justify-between text-sm text-slate-400">
                <span>Save import history</span>
                <input type="checkbox" checked={settings.saveImportHistory} onChange={(event) => updateSettings({ saveImportHistory: event.target.checked })} className="h-4 w-4 rounded border-white/10" />
              </label>
              <label className="flex items-center justify-between text-sm text-slate-400">
                <span>Compact mode</span>
                <input type="checkbox" checked={settings.compactMode} onChange={(event) => updateSettings({ compactMode: event.target.checked })} className="h-4 w-4 rounded border-white/10" />
              </label>
            </div>
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
        <span>Calendar / Reminder toggle</span>
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
