"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildIcsContent } from "@/lib/calendar/ics";
import {
  detectDuplicateItems,
  formatDisplayDate,
  formatTimeLabel,
  learnItemRule,
  normalizeTime,
  parseSchedule,
} from "@/lib/parser";
import { buildShortcutPayload, buildShortcutUrl } from "@/lib/reminders/shortcut";
import { clearAllData, loadActiveImport, loadHistory, loadSettings, saveActiveImport, saveHistory, saveSettings } from "@/lib/storage";
import type { ImportSession, ScheduleItem, UserSettings } from "@/lib/types";

const SAMPLE_SCHEDULE = `[EVENT]
Title: 💪 Gym
Date: 2026-08-10
Start: 10:45 AM
End: 12:45 PM
Address: 123 Main St, Springfield, MA 01103
Notes: Pull day
[/EVENT]

[TASK]
Title: 🧺 Start Laundry
Date: 2026-08-10
Due: 9:45 AM
Address:
List: Life General
Column: Laundry
Notes:
[/TASK]

[EVENT]
Title: 🍟 McDonald's | Enfield
Date: 2026-08-10
Start: 4:00 PM
End: 12:45 AM
Address: 34 Hazard Ave, Enfield, CT 06082
Notes: Work
[/EVENT]`;

type AppTab = "import" | "history" | "settings";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [scheduleText, setScheduleText] = useState(() => loadActiveImport()?.sourceText ?? SAMPLE_SCHEDULE);
  const [parsedItems, setParsedItems] = useState<ScheduleItem[]>(() => loadActiveImport()?.items ?? []);
  const [history, setHistory] = useState<ImportSession[]>(() => loadHistory());
  const [activeImport, setActiveImport] = useState<ImportSession | null>(() => loadActiveImport());
  const [activeTab, setActiveTab] = useState<AppTab>("import");
  const [statusMessage, setStatusMessage] = useState("Ready to parse your next schedule.");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
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

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    for (const item of parsedItems) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [parsedItems]);

  const addedCount = parsedItems.filter((i) => i.added).length;
  const validCount = parsedItems.filter((i) => !i.validationError).length;

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
    const invalidCount = nextItems.filter((i) => i.validationError).length;
    const msg = invalidCount > 0
      ? `Parsed ${nextItems.length} items — ${invalidCount} need attention.`
      : `Parsed ${nextItems.length} items. Tap Add to import each one.`;
    setStatusMessage(msg);
  }

  function addSingleItem(item: ScheduleItem) {
    if (item.type === "calendar") {
      const ics = buildIcsContent([item]);
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.title || "event"}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const payload = buildShortcutPayload([item]);
      window.open(buildShortcutUrl(payload), "_blank");
    }
    updateItem(item.id, { added: true });
  }

  function reopenSession(session: ImportSession) {
    setScheduleText(session.sourceText);
    setParsedItems(session.items);
    setActiveImport(session);
    setActiveTab("import");
    setStatusMessage("History import reopened.");
  }

  const editingItem = editingId ? parsedItems.find((i) => i.id === editingId) ?? null : null;

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
                  addedCount={addedCount}
                  validCount={validCount}
                  updateItem={updateItem}
                  deleteItem={deleteItem}
                  deleteAll={() => { setParsedItems([]); setActiveImport(null); }}
                  parseCurrentSchedule={parseCurrentSchedule}
                  addSingleItem={addSingleItem}
                  onEdit={(id) => setEditingId(id)}
                  loadSample={() => { setScheduleText(SAMPLE_SCHEDULE); setStatusMessage("Sample schedule loaded."); }}
                  clearInput={() => { setScheduleText(""); setParsedItems([]); setActiveImport(null); }}
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
      {editingItem && (
        <EditModal
          item={editingItem}
          onSave={(patch) => updateItem(editingItem.id, patch)}
          onClose={() => setEditingId(null)}
        />
      )}
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

/* ── PageHeader ── */
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
  addedCount: number;
  validCount: number;
  updateItem: (id: string, patch: Partial<ScheduleItem>) => void;
  deleteItem: (id: string) => void;
  deleteAll: () => void;
  parseCurrentSchedule: () => void;
  addSingleItem: (item: ScheduleItem) => void;
  onEdit: (id: string) => void;
  loadSample: () => void;
  clearInput: () => void;
}) {
  const [inputOpen, setInputOpen] = useState(false);

  return (
    <section>
      <PageHeader eyebrow="Import" title="Your Schedule" subtitle="Paste, parse, and add events to Apple Calendar." />

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
              placeholder="Paste a ChatGPT schedule or use the canonical [EVENT]/[TASK] format…"
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
          {/* Preview header + progress */}
          <div className="mt-6 flex items-center justify-between">
            <SectionLabel label="Preview" />
            <div className="flex items-center gap-2">
              {props.validCount > 0 && (
                <span className="text-[12px] font-medium text-[#5c6478] dark:text-[#8892a4]">
                  {props.addedCount} of {props.validCount} added
                </span>
              )}
              <span className="rounded-full bg-[#007aff]/10 px-2.5 py-1 text-[12px] font-semibold text-[#007aff] dark:bg-[#60a5fa]/10 dark:text-[#60a5fa]">
                {props.parsedItems.length} items
              </span>
            </div>
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
                      onEdit={() => props.onEdit(item.id)}
                      onAdd={() => props.addSingleItem(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Delete all */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={props.deleteAll}
              className="text-[13px] font-medium text-[#ef4444] dark:text-[#f87171]"
            >
              Clear all items
            </button>
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
  function handleDeleteAllData() {
    if (!window.confirm("Delete all saved data? This cannot be undone.")) return;
    clearAllData();
    window.location.reload();
  }

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
        <SettingsGroup title="Debug">
          <ButtonSetting label="Reload Page" onClick={() => window.location.reload()} />
          <ButtonSetting label="Delete All Data" destructive onClick={handleDeleteAllData} />
        </SettingsGroup>
      </div>
    </section>
  );
}

/* ── ItemRow ── */
function ItemRow({ item, settings, onDelete, onUpdate, onEdit, onAdd }: {
  item: ScheduleItem;
  settings: UserSettings;
  onDelete: () => void;
  onUpdate: (patch: Partial<ScheduleItem>) => void;
  onEdit: () => void;
  onAdd: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  const timeStr = timeSummary(item, settings);
  const mapsUrl = item.address
    ? `https://maps.apple.com/?q=${encodeURIComponent(item.address)}`
    : null;

  return (
    <div className="card-row items-start py-3">
      <div className="min-w-0 flex-1">
        {/* Title */}
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] leading-none">{item.emoji || "🗓️"}</span>
          <span className="text-[15px] font-semibold text-[#0a0e1a] dark:text-[#eef0f8]">{item.title}</span>
        </div>
        {/* Time */}
        <p className="mt-1 text-[13px] text-[#5c6478] dark:text-[#8892a4]">{timeStr}</p>
        {/* Address (tappable) */}
        {item.address && mapsUrl && (
          <a
            href={mapsUrl}
            className="mt-0.5 block text-[12px] text-[#007aff] underline dark:text-[#60a5fa]"
          >
            {item.address}
          </a>
        )}
        {/* Validation error */}
        {item.validationError && (
          <p className="mt-1 text-[12px] font-medium text-[#ef4444] dark:text-[#f87171]">
            ⚠ {item.validationError}
          </p>
        )}
        {/* Duplicate tag */}
        {item.duplicateAction === "skip" && (
          <span className="mt-1 inline-block rounded-full bg-[#fee2e2] px-2 py-0.5 text-[10px] font-semibold text-[#ef4444] dark:bg-[#2d0f0f] dark:text-[#f87171]">Duplicate</span>
        )}
      </div>

      {/* Right side: Add + menu */}
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        {!item.validationError && (
          <button
            type="button"
            onClick={onAdd}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition active:scale-[0.97] ${
              item.added
                ? "bg-[#e9fbe9] text-[#16a34a] dark:bg-[#0a2e0a] dark:text-[#4ade80]"
                : "bg-[#007aff] text-white shadow-sm dark:bg-[#3b82f6]"
            }`}
          >
            {item.added ? "✓ Added" : "Add"}
          </button>
        )}

        {/* ⋯ menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5c6478] transition active:bg-black/5 dark:text-[#8892a4] dark:active:bg-white/5"
            aria-label="More options"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" /></svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/8 dark:bg-[#1c1f2e] dark:ring-white/8">
              <MenuButton label="Edit" onClick={() => { onEdit(); setMenuOpen(false); }} />
              <MenuButton label="Mark Added" onClick={() => { onUpdate({ added: true }); setMenuOpen(false); }} />
              <MenuButton label="Reset Added State" onClick={() => { onUpdate({ added: false }); setMenuOpen(false); }} />
              <MenuButton label="Delete" danger onClick={() => { onDelete(); setMenuOpen(false); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── EditModal ── */
function EditModal({ item, onSave, onClose }: {
  item: ScheduleItem;
  onSave: (patch: Partial<ScheduleItem>) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState({
    title: `${item.emoji} ${item.title}`.trim(),
    date: item.date,
    startTime: item.startTime ? formatTimeLabel(item.startTime, "12h") : "",
    endTime: item.endTime ? formatTimeLabel(item.endTime, "12h") : "",
    dueTime: item.dueTime ? formatTimeLabel(item.dueTime, "12h") : "",
    address: item.address ?? "",
    notes: item.notes,
    calendar: item.calendar,
    reminderList: item.reminderList,
    reminderColumn: item.reminderColumn,
  });

  function save() {
    const rawTitle = fields.title.trim();
    onSave({
      title: stripEmoji(rawTitle),
      emoji: extractEmoji(rawTitle) || item.emoji,
      date: fields.date,
      startTime: fields.startTime.trim() ? normalizeTime(fields.startTime.trim()) : undefined,
      endTime: fields.endTime.trim() ? normalizeTime(fields.endTime.trim()) : undefined,
      dueTime: fields.dueTime.trim() ? normalizeTime(fields.dueTime.trim()) : undefined,
      address: fields.address.trim() || undefined,
      notes: fields.notes,
      calendar: fields.calendar,
      reminderList: fields.reminderList,
      reminderColumn: fields.reminderColumn,
    });
    onClose();
  }

  const inputCls = "w-full bg-transparent text-right text-[15px] text-[#5c6478] outline-none dark:text-[#8892a4]";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[430px] animate-scale-in rounded-t-3xl bg-[#f0f2f7] pb-8 shadow-2xl dark:bg-[#0f1117]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-black/10 dark:bg-white/10" />
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[17px] font-bold text-[#0a0e1a] dark:text-[#eef0f8]">Edit {item.type === "calendar" ? "Event" : "Task"}</h2>
          <button type="button" onClick={save} className="text-[15px] font-semibold text-[#007aff] dark:text-[#60a5fa]">Done</button>
        </div>
        {/* Fields */}
        <div className="px-4">
          <div className="card-list">
            <EditFieldRow label="Title">
              <input value={fields.title} onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
            </EditFieldRow>
            <EditFieldRow label="Date">
              <input type="date" value={fields.date} onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))} className={`${inputCls} max-w-[160px]`} />
            </EditFieldRow>
            {item.type === "calendar" && (
              <>
                <EditFieldRow label="Start">
                  <input value={fields.startTime} onChange={(e) => setFields((f) => ({ ...f, startTime: e.target.value }))} placeholder="10:45 AM" className={inputCls} />
                </EditFieldRow>
                <EditFieldRow label="End">
                  <input value={fields.endTime} onChange={(e) => setFields((f) => ({ ...f, endTime: e.target.value }))} placeholder="12:45 PM" className={inputCls} />
                </EditFieldRow>
              </>
            )}
            {item.type === "reminder" && (
              <>
                <EditFieldRow label="Due">
                  <input value={fields.dueTime} onChange={(e) => setFields((f) => ({ ...f, dueTime: e.target.value }))} placeholder="1:00 PM" className={inputCls} />
                </EditFieldRow>
                <EditFieldRow label="List">
                  <input value={fields.reminderList} onChange={(e) => setFields((f) => ({ ...f, reminderList: e.target.value }))} className={inputCls} />
                </EditFieldRow>
                <EditFieldRow label="Column">
                  <input value={fields.reminderColumn} onChange={(e) => setFields((f) => ({ ...f, reminderColumn: e.target.value }))} className={inputCls} />
                </EditFieldRow>
              </>
            )}
            <EditFieldRow label="Address">
              <input value={fields.address} onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))} placeholder="Street address, city, state" className={inputCls} />
            </EditFieldRow>
            <EditFieldRow label="Notes">
              <input value={fields.notes} onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={inputCls} />
            </EditFieldRow>
            {item.type === "calendar" && (
              <EditFieldRow label="Calendar">
                <input value={fields.calendar} onChange={(e) => setFields((f) => ({ ...f, calendar: e.target.value }))} className={inputCls} />
              </EditFieldRow>
            )}
          </div>
        </div>
      </div>
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

function SectionLabel({ label }: { label: string }) {
  return <p className="px-1 text-[12px] font-semibold uppercase tracking-widest text-[#9ca3af] dark:text-[#4b5563]">{label}</p>;
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

function ButtonSetting({ label, onClick, destructive }: { label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="card-row w-full justify-between">
      <span className={`text-[15px] ${destructive ? "text-[#ef4444] dark:text-[#f87171]" : "text-[#007aff] dark:text-[#60a5fa]"}`}>{label}</span>
    </button>
  );
}

function EditFieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="card-row gap-3">
      <span className="w-16 shrink-0 text-[15px] text-[#0a0e1a] dark:text-[#eef0f8]">{label}</span>
      {children}
    </label>
  );
}

function MenuButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-4 py-3 text-left text-[14px] font-medium transition-colors active:bg-black/5 dark:active:bg-white/5 ${
        danger ? "text-[#ef4444] dark:text-[#f87171]" : "text-[#0a0e1a] dark:text-[#eef0f8]"
      }`}
    >
      {label}
    </button>
  );
}

/* ── Helpers ── */
function timeSummary(item: ScheduleItem, settings: UserSettings): string {
  if (item.type === "calendar") {
    const start = item.startTime ? formatTimeLabel(item.startTime, settings.timeFormat) : "All day";
    const end = item.endTime ? ` – ${formatTimeLabel(item.endTime, settings.timeFormat)}` : "";
    return `${start}${end}`;
  }
  const due = item.dueTime ? `Due ${formatTimeLabel(item.dueTime, settings.timeFormat)}` : "No due time";
  return due;
}

function extractEmoji(title: string): string {
  return title.match(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu)?.[0] ?? "";
}

function stripEmoji(title: string): string {
  return title.replace(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu, "").trim();
}
