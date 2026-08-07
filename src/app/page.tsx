"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildIcsContent } from "@/lib/calendar/ics";
import {
  detectDuplicateItems,
  formatDisplayDate,
  formatTimeLabel,
  learnItemRule,
  parseSchedule,
  resolveExportItems,
} from "@/lib/parser";
import { loadActiveImport, loadHistory, loadSettings, saveActiveImport, saveHistory, saveSettings } from "@/lib/storage";
import type { ImportSession, ScheduleItem, UserSettings } from "@/lib/types";

const SAMPLE_SCHEDULE = `Date: Saturday, August 8, 2026

8/8/26 7:30 AM - 8:00 AM
Morning Routine

8/8/26 8:00 AM - 8:30 AM
Breakfast

8/8/26 9:30 AM - 11:30 AM
Gym

8/8/26 1:00 PM
Clean Bathroom

8/8/26 3:30 PM
Pack Work Bag

8/8/26 5:00 PM - 1:45 AM
McDonald's Enfield`;

type AppTab = "import" | "history" | "settings";

type ExportSummary = {
  eventCount: number;
  icsContent: string;
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [scheduleText, setScheduleText] = useState(() => loadActiveImport()?.sourceText ?? SAMPLE_SCHEDULE);
  const [parsedItems, setParsedItems] = useState<ScheduleItem[]>(() => loadActiveImport()?.items ?? []);
  const [history, setHistory] = useState<ImportSession[]>(() => loadHistory());
  const [activeImport, setActiveImport] = useState<ImportSession | null>(() => loadActiveImport());
  const [activeTab, setActiveTab] = useState<AppTab>("import");
  const [statusMessage, setStatusMessage] = useState("Ready to parse your next schedule.");
  const [successSummary, setSuccessSummary] = useState<ExportSummary | null>(null);

  /* Resolve dark mode: use system preference as initial value, override with settings */
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const isDark = settings.darkMode ?? systemDark;

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { saveHistory(history); }, [history]);
  useEffect(() => { saveActiveImport(activeImport); }, [activeImport]);

  const eventCount = parsedItems.filter((item) => item.type === "calendar" && !item.skipped).length;

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    for (const item of parsedItems) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [parsedItems]);

  function updateItem(id: string, patch: Partial<ScheduleItem>) {
    const nextItems = parsedItems.map((item) => {
      if (item.id !== id) return item;
      const nextItem: ScheduleItem = { ...item, ...patch, edited: true };
      if (patch.title !== undefined) nextItem.emoji = extractEmoji(nextItem.title);
      if (patch.type !== undefined) nextItem.inferredType = patch.type;
      return nextItem;
    });
    setParsedItems(nextItems);
    setActiveImport((cur) => (cur ? { ...cur, items: nextItems } : cur));
    const edited = nextItems.find((item) => item.id === id);
    if (edited) setSettings((cur) => learnItemRule(edited, cur));
  }

  function updateMany(ids: string[], patch: Partial<ScheduleItem>) {
    const nextItems = detectDuplicateItems(
      parsedItems.map((item) => {
        if (!ids.includes(item.id)) return item;
        const nextItem = { ...item, ...patch, edited: true };
        if (patch.type !== undefined) nextItem.inferredType = patch.type;
        return nextItem;
      })
    );
    setParsedItems(nextItems);
    setActiveImport((cur) => (cur ? { ...cur, items: nextItems } : cur));
  }

  function deleteItem(id: string) {
    const nextItems = parsedItems.filter((item) => item.id !== id);
    setParsedItems(nextItems);
    setActiveImport((cur) => (cur ? { ...cur, items: nextItems } : cur));
  }

  function parseCurrentSchedule() {
    if (!scheduleText.trim()) { setStatusMessage("Paste a schedule first."); return; }
    const nextItems = detectDuplicateItems(parseSchedule(scheduleText, settings));
    setParsedItems(nextItems);
    const session: ImportSession = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceText: scheduleText,
      items: nextItems,
      eventCount: nextItems.filter((i) => i.type === "calendar").length,
      reminderCount: 0,
    };
    setActiveImport(session);
    setSuccessSummary(null);
    setStatusMessage(`Parsed ${nextItems.length} items. Review, then export.`);
  }

  function handleExport() {
    if (!parsedItems.length) { setStatusMessage("Parse something first."); return; }
    const items = resolveExportItems(parsedItems);
    const icsContent = buildIcsContent(items);
    const now = new Date().toISOString();
    const session: ImportSession = {
      id: crypto.randomUUID(),
      createdAt: now,
      sourceText: scheduleText,
      items: parsedItems,
      exportDate: now,
      eventCount: items.filter((i) => i.type === "calendar").length,
      reminderCount: 0,
      notes: `Exported ${items.length} items`,
    };
    if (settings.saveImportHistory) setHistory((cur) => [session, ...cur].slice(0, 20));
    setActiveImport(session);
    setSuccessSummary({ eventCount: session.eventCount, icsContent });
    setStatusMessage("Export ready — download your .ics file.");
  }

  function downloadIcs() {
    if (!successSummary) return;
    const blob = new Blob([successSummary.icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lifeos-import.ics"; a.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Downloaded .ics — open it on iPhone to add to Apple Calendar.");
  }

  function reopenSession(session: ImportSession) {
    setScheduleText(session.sourceText);
    setParsedItems(session.items);
    setActiveImport(session);
    setActiveTab("import");
    setStatusMessage("History import reopened.");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07080d]">
        <div className="animate-fade-in flex flex-col items-center gap-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-blue-500/20 blur-2xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#3b82f6] to-[#6366f1] shadow-2xl shadow-blue-500/30">
              <span className="text-3xl font-black text-white tracking-tight">L</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight text-white">LifeOS</p>
            <p className="mt-1 text-sm text-white/40">Loading your schedule…</p>
          </div>
          <div className="h-0.5 w-32 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className={isDark ? "dark" : ""}>
      <main className="min-h-screen bg-[#f0f2f7] text-[#0a0e1a] transition-colors duration-300 dark:bg-[#07080d] dark:text-[#eef0f8]">
        <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#f0f2f7] shadow-2xl shadow-black/30 transition-colors duration-300 dark:bg-[#07080d]">
          <StatusBar timeFormat={settings.timeFormat} />
          <div className="flex-1 overflow-y-auto px-4 pb-32 pt-3">
            {activeTab === "import" && (
              <div className="animate-fade-up">
                <ImportView
                  scheduleText={scheduleText}
                  setScheduleText={setScheduleText}
                  parsedItems={parsedItems}
                  groupedItems={groupedItems}
                  settings={settings}
                  statusMessage={statusMessage}
                  successSummary={successSummary}
                  eventCount={eventCount}
                  updateItem={updateItem}
                  updateMany={updateMany}
                  deleteItem={deleteItem}
                  deleteAll={() => { setParsedItems([]); setActiveImport(null); setSuccessSummary(null); }}
                  parseCurrentSchedule={parseCurrentSchedule}
                  handleExport={handleExport}
                  downloadIcs={downloadIcs}
                  loadSample={() => { setScheduleText(SAMPLE_SCHEDULE); setStatusMessage("Sample schedule loaded."); }}
                  clearInput={() => { setScheduleText(""); setParsedItems([]); setActiveImport(null); setSuccessSummary(null); }}
                />
              </div>
            )}
            {activeTab === "history" && (
              <div className="animate-fade-up">
                <HistoryView history={history} onReopen={reopenSession} onDelete={(id) => setHistory((cur) => cur.filter((s) => s.id !== id))} />
              </div>
            )}
            {activeTab === "settings" && (
              <div className="animate-fade-up">
                <SettingsView settings={settings} setSettings={setSettings} />
              </div>
            )}
          </div>
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      </main>
    </div>
  );
}

/* ── StatusBar ── */
function StatusBar({ timeFormat }: { timeFormat: "12h" | "24h" }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: timeFormat === "12h" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="sticky top-0 z-20 border-b border-black/5 bg-[#f0f2f7]/80 px-5 pb-2.5 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-xl transition-colors dark:border-white/5 dark:bg-[#07080d]/80">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[13px] font-semibold tabular-nums text-[#0a0e1a] dark:text-[#eef0f8]">{timeStr}</span>
        <span className="text-[12px] font-medium text-[#5c6478] dark:text-[#8892a4]">{dateStr}</span>
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-[18px] rounded-sm border-[1.5px] border-current opacity-50" />
          <div className="h-2 w-1 rounded-[1px] bg-current opacity-50" />
        </div>
      </div>
    </div>
  );
}

/* ── Page header ── */
function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-6 pt-1">
      {eyebrow && <p className="mb-1 text-[12px] font-semibold uppercase tracking-widest text-[#007aff] dark:text-[#60a5fa]">{eyebrow}</p>}
      <h1 className="text-[32px] font-bold leading-tight tracking-[-0.025em] text-[#0a0e1a] dark:text-[#eef0f8]">{title}</h1>
      {subtitle && <p className="mt-2 text-[14px] leading-5 text-[#5c6478] dark:text-[#8892a4]">{subtitle}</p>}
    </header>
  );
}

/* ── ImportView ── */
function ImportView(props: {
  scheduleText: string;
  setScheduleText: (v: string) => void;
  parsedItems: ScheduleItem[];
  groupedItems: [string, ScheduleItem[]][];
  settings: UserSettings;
  statusMessage: string;
  successSummary: ExportSummary | null;
  eventCount: number;
  updateItem: (id: string, patch: Partial<ScheduleItem>) => void;
  updateMany: (ids: string[], patch: Partial<ScheduleItem>) => void;
  deleteItem: (id: string) => void;
  deleteAll: () => void;
  parseCurrentSchedule: () => void;
  handleExport: () => void;
  downloadIcs: () => void;
  loadSample: () => void;
  clearInput: () => void;
}) {
  const [inputOpen, setInputOpen] = useState(false);
  const selectedIds = props.parsedItems.filter((i) => !i.skipped).map((i) => i.id);

  return (
    <section>
      <PageHeader eyebrow="Import" title="Your Schedule" subtitle="Paste, parse, and export events to Apple Calendar." />

      {/* Input card */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all dark:bg-[#0f1117] dark:ring-white/6">
        <button
          type="button"
          onClick={() => setInputOpen((p) => !p)}
          className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors active:bg-black/5 dark:active:bg-white/5"
        >
          <span className="text-[14px] font-semibold text-[#0a0e1a] dark:text-[#eef0f8]">Schedule Input</span>
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#007aff] dark:text-[#60a5fa]">
            {inputOpen ? "Hide" : "Show"}
            <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${inputOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" /></svg>
          </span>
        </button>
        <div className={`transition-all duration-300 ease-out ${inputOpen ? "max-h-[400px] opacity-100" : "max-h-0 overflow-hidden opacity-0"}`}>
          <div className="px-4 pb-2">
            <textarea
              value={props.scheduleText}
              onChange={(e) => props.setScheduleText(e.target.value)}
              className="min-h-[130px] w-full resize-none rounded-xl bg-[#f0f2f7] p-3 text-[15px] leading-6 text-[#0a0e1a] outline-none placeholder:text-[#9ca3af] dark:bg-[#161820] dark:text-[#eef0f8] dark:placeholder:text-[#5c6478]"
              placeholder="Paste a ChatGPT schedule here…"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-black/5 p-3 dark:border-white/5">
          <ActionButton tone="ghost" label="Sample" onClick={props.loadSample} />
          <ActionButton tone="ghost" label="Clear" onClick={props.clearInput} />
          <ActionButton tone="primary" label="Parse" onClick={props.parseCurrentSchedule} />
        </div>
      </div>

      {/* Status pill */}
      <p className="mt-3 rounded-xl bg-[#e8f2ff] px-4 py-2.5 text-[13px] font-medium text-[#0057b7] dark:bg-[#0c1e38] dark:text-[#93c5fd]">
        {props.statusMessage}
      </p>

      {props.parsedItems.length > 0 && (
        <>
          {/* Preview header */}
          <div className="mt-6 flex items-center justify-between">
            <SectionLabel label="Preview" />
            <span className="rounded-full bg-[#007aff]/10 px-2.5 py-1 text-[12px] font-semibold text-[#007aff] dark:bg-[#60a5fa]/10 dark:text-[#60a5fa]">
              {props.parsedItems.length} items
            </span>
          </div>

          {/* Bulk actions */}
          <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
            <PillButton label="Select All" onClick={() => props.updateMany(props.parsedItems.map((i) => i.id), { skipped: false })} />
            <PillButton label="Deselect" onClick={() => props.updateMany(props.parsedItems.map((i) => i.id), { skipped: true })} />
            <PillButton label="Delete All" danger onClick={props.deleteAll} />
          </div>

          {/* Item groups */}
          <div className="mt-3 space-y-5">
            {props.groupedItems.map(([date, items], gi) => (
              <div key={date} style={{ animationDelay: `${gi * 60}ms` }} className="animate-fade-up">
                <SectionLabel label={formatDisplayDate(date)} />
                <div className="card-list mt-2">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      settings={props.settings}
                      onDelete={() => props.deleteItem(item.id)}
                      onUpdate={(patch) => props.updateItem(item.id, patch)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Export card */}
          <div className="mt-6 animate-scale-in overflow-hidden rounded-2xl bg-gradient-to-br from-[#007aff] to-[#5b5ef4] p-4 shadow-lg shadow-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[16px] font-bold text-white">Export to Calendar</p>
                <p className="mt-0.5 text-[13px] text-white/70">
                  {props.eventCount} event{props.eventCount !== 1 ? "s" : ""} selected
                </p>
              </div>
              <button
                type="button"
                onClick={props.handleExport}
                className="rounded-xl bg-white/20 px-4 py-2 text-[14px] font-semibold text-white backdrop-blur-sm transition active:scale-95 active:bg-white/30"
              >
                Export
              </button>
            </div>
            {props.successSummary && (
              <button
                type="button"
                onClick={props.downloadIcs}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14px] font-semibold text-[#007aff] transition active:scale-[0.98] active:opacity-90"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4-4 4m0 0-4-4m4 4V4" /></svg>
                Download {props.successSummary.eventCount} Events (.ics)
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ── HistoryView ── */
function HistoryView({ history, onReopen, onDelete }: { history: ImportSession[]; onReopen: (s: ImportSession) => void; onDelete: (id: string) => void }) {
  return (
    <section>
      <PageHeader eyebrow="Archive" title="History" subtitle="Reopen previous imports and export again." />
      {history.length ? (
        <div className="card-list">
          {history.map((session, i) => (
            <div key={session.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-fade-up card-row gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#34c759] to-[#2ecc71] text-white shadow-sm">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <button type="button" onClick={() => onReopen(session)} className="min-w-0 flex-1 text-left">
                <span className="block text-[15px] font-semibold text-[#0a0e1a] dark:text-[#eef0f8]">
                  {new Date(session.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="text-[13px] text-[#5c6478] dark:text-[#8892a4]">
                  {session.eventCount} event{session.eventCount !== 1 ? "s" : ""}
                  {session.exportDate ? " · Exported" : ""}
                </span>
              </button>
              <button type="button" onClick={() => onDelete(session.id)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-[#ef4444] transition active:opacity-70 dark:text-[#f87171]">
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="🗂️" title="No history yet" text="Exports will appear here when history is enabled." />
      )}
    </section>
  );
}

/* ── SettingsView ── */
function SettingsView({ settings, setSettings }: { settings: UserSettings; setSettings: (fn: (s: UserSettings) => UserSettings) => void }) {
  return (
    <section>
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Defaults saved locally on this device." />
      <div className="space-y-5">
        <SettingsGroup title="Calendar Defaults">
          <TextSetting label="Default Calendar" value={settings.defaultCalendar} onChange={(v) => setSettings((s) => ({ ...s, defaultCalendar: v }))} />
          <TextSetting label="Default Alert" value={settings.defaultCalendarAlert} onChange={(v) => setSettings((s) => ({ ...s, defaultCalendarAlert: v }))} />
          <SelectSetting label="Travel Time" value={String(settings.defaultTravelTime)} options={["none", "manual", "automatic"]} onChange={(v) => setSettings((s) => ({ ...s, defaultTravelTime: v }))} />
        </SettingsGroup>
        <SettingsGroup title="Display">
          <SelectSetting label="Time Format" value={settings.timeFormat} options={["12h", "24h"]} onChange={(v) => setSettings((s) => ({ ...s, timeFormat: v as UserSettings["timeFormat"] }))} />
          <SwitchSetting label="Dark Mode" checked={settings.darkMode} onChange={(v) => setSettings((s) => ({ ...s, darkMode: v }))} />
        </SettingsGroup>
        <SettingsGroup title="Automation">
          <SwitchSetting label="Auto-detect Type" checked={settings.autoDetectType} onChange={(v) => setSettings((s) => ({ ...s, autoDetectType: v }))} />
          <SwitchSetting label="Auto-select Items" checked={settings.autoSelectAll} onChange={(v) => setSettings((s) => ({ ...s, autoSelectAll: v }))} />
          <SwitchSetting label="Save Import History" checked={settings.saveImportHistory} onChange={(v) => setSettings((s) => ({ ...s, saveImportHistory: v }))} />
        </SettingsGroup>
      </div>
    </section>
  );
}

/* ── ItemRow ── */
function ItemRow({ item, settings, onDelete, onUpdate }: {
  item: ScheduleItem;
  settings: UserSettings;
  onDelete: () => void;
  onUpdate: (patch: Partial<ScheduleItem>) => void;
}) {
  const summary = timeSummary(item, settings);
  return (
    <div className={`card-row transition-opacity ${item.skipped ? "opacity-40" : ""}`}>
      <button
        type="button"
        onClick={() => onUpdate({ skipped: !item.skipped })}
        aria-label="Toggle selected"
        className={`h-6 w-6 shrink-0 rounded-full border-2 transition-all duration-200 ${item.skipped ? "border-[#d1d5db] dark:border-[#374151]" : "border-[#007aff] bg-[#007aff] dark:border-[#3b82f6] dark:bg-[#3b82f6]"}`}
      >
        {!item.skipped && (
          <svg className="mx-auto h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#007aff]/10 text-[11px] font-bold text-[#007aff] dark:bg-[#3b82f6]/15 dark:text-[#60a5fa]">
            {item.emoji || "📅"}
          </span>
          <span className="truncate text-[15px] font-semibold text-[#0a0e1a] dark:text-[#eef0f8]">{item.title}</span>
        </div>
        <p className="mt-1 pl-9 text-[12px] text-[#5c6478] dark:text-[#8892a4]">{summary}</p>
        {(item.duplicateAction === "skip" || item.edited) && (
          <div className="mt-1.5 flex gap-1.5 pl-9">
            {item.duplicateAction === "skip" && <MiniTag label="Duplicate" color="red" />}
            {item.edited && <MiniTag label="Edited" color="gray" />}
          </div>
        )}
      </div>
      <button type="button" onClick={onDelete} className="shrink-0 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#ef4444] transition active:opacity-70 dark:text-[#f87171]">
        ✕
      </button>
    </div>
  );
}

/* ── BottomNav ── */
function BottomNav({ activeTab, setActiveTab }: { activeTab: AppTab; setActiveTab: (tab: AppTab) => void }) {
  const tabs: { id: AppTab; label: string; icon: ReactNode }[] = [
    {
      id: "import", label: "Import",
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" /></svg>,
    },
    {
      id: "history", label: "History",
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      id: "settings", label: "Settings",
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] border-t border-black/6 bg-[#f0f2f7]/85 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl transition-colors dark:border-white/6 dark:bg-[#07080d]/85">
      <div className="grid grid-cols-3 gap-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition-all duration-200 ${
                active
                  ? "text-[#007aff] dark:text-[#60a5fa]"
                  : "text-[#9ca3af] dark:text-[#4b5563]"
              }`}
            >
              <span className={`rounded-xl p-1.5 transition-all duration-200 ${active ? "bg-[#007aff]/10 dark:bg-[#60a5fa]/10" : ""}`}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Primitives ── */
function ActionButton({ label, onClick, tone }: { label: string; onClick: () => void; tone: "primary" | "ghost" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-xl px-3 text-[14px] font-semibold transition-all active:scale-[0.97] ${
        tone === "primary"
          ? "bg-[#007aff] text-white shadow-sm shadow-blue-500/30 dark:bg-[#3b82f6]"
          : "bg-[#f0f2f7] text-[#007aff] dark:bg-[#161820] dark:text-[#60a5fa]"
      }`}
    >
      {label}
    </button>
  );
}

function PillButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-all active:scale-[0.97] ${
        danger
          ? "bg-[#fee2e2] text-[#ef4444] dark:bg-[#2d0f0f] dark:text-[#f87171]"
          : "bg-white text-[#007aff] shadow-sm ring-1 ring-black/5 dark:bg-[#0f1117] dark:text-[#60a5fa] dark:ring-white/6"
      }`}
    >
      {label}
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <p className="px-1 text-[12px] font-semibold uppercase tracking-widest text-[#9ca3af] dark:text-[#4b5563]">{label}</p>;
}

function MiniTag({ label, color }: { label: string; color: "red" | "gray" }) {
  const cls = color === "red"
    ? "bg-[#fee2e2] text-[#ef4444] dark:bg-[#2d0f0f] dark:text-[#f87171]"
    : "bg-[#f3f4f6] text-[#6b7280] dark:bg-[#1f2937] dark:text-[#9ca3af]";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function EmptyState({ icon, title, text }: { icon?: string; title: string; text: string }) {
  return (
    <div className="py-10 text-center">
      {icon && <p className="mb-3 text-4xl">{icon}</p>}
      <p className="text-[16px] font-semibold text-[#0a0e1a] dark:text-[#eef0f8]">{title}</p>
      <p className="mt-1 text-[13px] leading-5 text-[#5c6478] dark:text-[#8892a4]">{text}</p>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <SectionLabel label={title} />
      <div className="card-list mt-2">{children}</div>
    </div>
  );
}

function TextSetting({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="card-row">
      <span className="text-[15px] text-[#0a0e1a] dark:text-[#eef0f8]">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-36 bg-transparent text-right text-[15px] text-[#5c6478] outline-none dark:text-[#8892a4]" />
    </label>
  );
}

function SelectSetting({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="card-row">
      <span className="text-[15px] text-[#0a0e1a] dark:text-[#eef0f8]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-44 bg-transparent text-right text-[15px] text-[#5c6478] outline-none dark:text-[#8892a4]">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function SwitchSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="card-row">
      <span className="text-[15px] text-[#0a0e1a] dark:text-[#eef0f8]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="ios-switch" />
    </label>
  );
}

/* ── Helpers ── */
function timeSummary(item: ScheduleItem, settings: UserSettings): string {
  if (item.type === "calendar") {
    const start = item.startTime ? formatTimeLabel(item.startTime, settings.timeFormat) : "All day";
    const end = item.endTime ? ` – ${formatTimeLabel(item.endTime, settings.timeFormat)}` : "";
    return `${formatDisplayDate(item.date)} · ${start}${end}`;
  }
  const due = item.dueTime ? formatTimeLabel(item.dueTime, settings.timeFormat) : "No time";
  return `${formatDisplayDate(item.date)} · Due ${due}`;
}

function extractEmoji(title: string): string {
  return title.match(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu)?.[0] ?? "";
}
