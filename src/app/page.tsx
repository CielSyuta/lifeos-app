"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildIcsContent } from "@/lib/calendar/ics";
import { buildShortcutJson, buildShortcutPayload, buildShortcutUrl } from "@/lib/reminders/shortcut";
import {
  detectDuplicateItems,
  formatDisplayDate,
  formatTimeLabel,
  learnItemRule,
  parseSchedule,
  resolveExportItems,
} from "@/lib/parser";
import { loadActiveImport, loadHistory, loadSettings, saveActiveImport, saveHistory, saveSettings } from "@/lib/storage";
import type { ImportSession, ScheduleItem, ScheduleItemType, UserSettings } from "@/lib/types";

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

const COMMON_COLUMNS = [
  "Morning Routine",
  "Fitness",
  "Home",
  "Laundry",
  "Food",
  "Before Leaving",
  "Night Routine",
  "Content",
  "Finance",
  "Shopping",
  "Planning",
  "Someday",
];

type AppTab = "today" | "import" | "history" | "settings";

type ExportSummary = {
  eventCount: number;
  reminderCount: number;
  payload: string;
  icsContent: string;
};

export default function Home() {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [scheduleText, setScheduleText] = useState(() => loadActiveImport()?.sourceText ?? SAMPLE_SCHEDULE);
  const [parsedItems, setParsedItems] = useState<ScheduleItem[]>(() => loadActiveImport()?.items ?? []);
  const [history, setHistory] = useState<ImportSession[]>(() => loadHistory());
  const [activeImport, setActiveImport] = useState<ImportSession | null>(() => loadActiveImport());
  const [activeTab, setActiveTab] = useState<AppTab>("import");
  const [statusMessage, setStatusMessage] = useState("Ready to parse your next schedule.");
  const [successSummary, setSuccessSummary] = useState<ExportSummary | null>(null);
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

  const exportableItems = useMemo(() => resolveExportItems(parsedItems), [parsedItems]);
  const eventCount = parsedItems.filter((item) => item.type === "calendar" && !item.skipped).length;
  const reminderCount = parsedItems.filter((item) => item.type === "reminder" && !item.skipped).length;
  const completedCount = parsedItems.filter((item) => item.completed).length;

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

      const nextItem: ScheduleItem = { ...item, ...patch, edited: true };
      if (patch.title !== undefined) {
        nextItem.emoji = extractEmoji(nextItem.title);
      }
      if (patch.type !== undefined) {
        nextItem.inferredType = patch.type;
        if (patch.type === "reminder" && !nextItem.dueTime) {
          nextItem.dueTime = nextItem.startTime;
        }
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

  function updateMany(ids: string[], patch: Partial<ScheduleItem>) {
    let nextItems = parsedItems.map((item) => (ids.includes(item.id) ? { ...item, ...patch, edited: true } : item));
    nextItems = detectDuplicateItems(nextItems);
    setParsedItems(nextItems);
    setActiveImport((current) => (current ? { ...current, items: nextItems } : current));
  }

  function deleteItem(id: string) {
    const nextItems = parsedItems.filter((item) => item.id !== id);
    setParsedItems(nextItems);
    setEditingItemId((current) => (current === id ? null : current));
    setActiveImport((current) => (current ? { ...current, items: nextItems } : current));
  }

  function parseCurrentSchedule() {
    if (!scheduleText.trim()) {
      setStatusMessage("Paste a schedule first.");
      return;
    }

    const nextItems = detectDuplicateItems(parseSchedule(scheduleText, settings));
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
    setSuccessSummary(null);
    setEditingItemId(nextItems[0]?.id ?? null);
    setStatusMessage(`Parsed ${nextItems.length} items. Review, edit, then export.`);
  }

  function handleExport() {
    if (!parsedItems.length) {
      setStatusMessage("Parse something first.");
      return;
    }

    const items = resolveExportItems(parsedItems);
    const icsContent = buildIcsContent(items);
    const payload = buildShortcutJson(items);
    const now = new Date().toISOString();
    const session: ImportSession = {
      id: crypto.randomUUID(),
      createdAt: now,
      sourceText: scheduleText,
      items: parsedItems,
      exportDate: now,
      eventCount: items.filter((item) => item.type === "calendar").length,
      reminderCount: items.filter((item) => item.type === "reminder").length,
      notes: `Exported ${items.length} items`,
    };

    if (settings.saveImportHistory) {
      setHistory((current) => [session, ...current].slice(0, 20));
    }

    setActiveImport(session);
    setSuccessSummary({ eventCount: session.eventCount, reminderCount: session.reminderCount, payload, icsContent });
    setStatusMessage("Export ready. Download Calendar events or copy the Shortcut payload.");
  }

  function downloadIcs() {
    if (!successSummary) {
      return;
    }

    const blob = new Blob([successSummary.icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lifeos-import.ics";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Downloaded .ics. Open it on iPhone to add events to Apple Calendar.");
  }

  function copyPayload() {
    if (!successSummary) {
      return;
    }
    void navigator.clipboard.writeText(successSummary.payload);
    setStatusMessage("Reminder JSON copied for Apple Shortcuts.");
  }

  function openShortcut() {
    const payload = buildShortcutPayload(resolveExportItems(parsedItems));
    window.location.href = buildShortcutUrl(payload);
  }

  function reopenSession(session: ImportSession) {
    setScheduleText(session.sourceText);
    setParsedItems(session.items);
    setActiveImport(session);
    setEditingItemId(session.items[0]?.id ?? null);
    setActiveTab("import");
    setStatusMessage("History import reopened.");
  }

  function deleteHistory(id: string) {
    setHistory((current) => current.filter((session) => session.id !== id));
  }

  return (
    <main className="min-h-screen bg-[#f4f4f8] text-[#111318] dark:bg-black dark:text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col overflow-hidden bg-[#f7f7fb] shadow-2xl shadow-black/20 dark:bg-black">
        <StatusBar />
        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-2">
          {activeTab === "today" ? (
            <TodayView
              eventCount={eventCount}
              reminderCount={reminderCount}
              completedCount={completedCount}
              items={exportableItems}
              settings={settings}
              onEdit={(id) => {
                setEditingItemId(id);
                setActiveTab("import");
              }}
            />
          ) : null}

          {activeTab === "import" ? (
            <ImportView
              scheduleText={scheduleText}
              setScheduleText={setScheduleText}
              parsedItems={parsedItems}
              groupedItems={groupedItems}
              settings={settings}
              statusMessage={statusMessage}
              successSummary={successSummary}
              editingItemId={editingItemId}
              setEditingItemId={setEditingItemId}
              updateItem={updateItem}
              updateMany={updateMany}
              deleteItem={deleteItem}
              deleteAll={() => {
                setParsedItems([]);
                setActiveImport(null);
                setSuccessSummary(null);
                setEditingItemId(null);
              }}
              parseCurrentSchedule={parseCurrentSchedule}
              handleExport={handleExport}
              downloadIcs={downloadIcs}
              copyPayload={copyPayload}
              openShortcut={openShortcut}
              loadSample={() => {
                setScheduleText(SAMPLE_SCHEDULE);
                setStatusMessage("Sample schedule loaded.");
              }}
              clearInput={() => {
                setScheduleText("");
                setParsedItems([]);
                setActiveImport(null);
                setSuccessSummary(null);
                setEditingItemId(null);
              }}
            />
          ) : null}

          {activeTab === "history" ? (
            <HistoryView history={history} onReopen={reopenSession} onDelete={deleteHistory} />
          ) : null}

          {activeTab === "settings" ? (
            <SettingsView settings={settings} setSettings={setSettings} />
          ) : null}
        </div>
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>
    </main>
  );
}

function StatusBar() {
  return (
    <div className="sticky top-0 z-20 bg-[#f7f7fb]/85 px-5 pb-2 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl dark:bg-black/80">
      <div className="flex items-center justify-between text-[13px] font-semibold">
        <span>9:41</span>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-current" />
          <span className="h-2.5 w-2 rounded-sm bg-current" />
        </div>
      </div>
    </div>
  );
}

function ScreenTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      {eyebrow ? <p className="text-[13px] font-semibold text-[#007aff] dark:text-[#64d2ff]">{eyebrow}</p> : null}
      <h1 className="mt-1 text-[34px] font-bold leading-tight tracking-[-0.02em] text-[#111318] dark:text-white">{title}</h1>
      {subtitle ? <p className="mt-2 text-[15px] leading-6 text-[#6d6d72] dark:text-[#9b9ba1]">{subtitle}</p> : null}
    </header>
  );
}

function TodayView({
  eventCount,
  reminderCount,
  completedCount,
  items,
  settings,
  onEdit,
}: {
  eventCount: number;
  reminderCount: number;
  completedCount: number;
  items: ScheduleItem[];
  settings: UserSettings;
  onEdit: (id: string) => void;
}) {
  const upcoming = items.slice(0, 4);

  return (
    <section>
      <ScreenTitle eyebrow="LifeOS" title="Today" subtitle="A local dashboard from your latest imports and exports." />
      <div className="grid grid-cols-2 gap-3">
        <MetricCard color="blue" label="Events" value={eventCount} />
        <MetricCard color="orange" label="Tasks" value={reminderCount} />
        <MetricCard color="green" label="Completed" value={completedCount} />
        <MetricCard color="purple" label="Upcoming" value={Math.max(items.length - completedCount, 0)} />
      </div>

      <div className="mt-6">
        <IosGroupTitle title="Up Next" />
        <div className="ios-list">
          {upcoming.length ? (
            upcoming.map((item) => <CompactRow key={item.id} item={item} settings={settings} onEdit={() => onEdit(item.id)} />)
          ) : (
            <EmptyState title="No imported items yet" text="Paste a schedule on the Import tab to build your day." />
          )}
        </div>
      </div>
    </section>
  );
}

function ImportView(props: {
  scheduleText: string;
  setScheduleText: (value: string) => void;
  parsedItems: ScheduleItem[];
  groupedItems: [string, ScheduleItem[]][];
  settings: UserSettings;
  statusMessage: string;
  successSummary: ExportSummary | null;
  editingItemId: string | null;
  setEditingItemId: (id: string | null) => void;
  updateItem: (id: string, patch: Partial<ScheduleItem>) => void;
  updateMany: (ids: string[], patch: Partial<ScheduleItem>) => void;
  deleteItem: (id: string) => void;
  deleteAll: () => void;
  parseCurrentSchedule: () => void;
  handleExport: () => void;
  downloadIcs: () => void;
  copyPayload: () => void;
  openShortcut: () => void;
  loadSample: () => void;
  clearInput: () => void;
}) {
  const selectedIds = props.parsedItems.filter((item) => !item.skipped).map((item) => item.id);
  const editingItem = props.parsedItems.find((item) => item.id === props.editingItemId);

  return (
    <section>
      <ScreenTitle eyebrow="Import" title="Paste Your Schedule" subtitle="Review parsed events and reminders before handing them to Apple apps." />
      <div className="rounded-[28px] bg-white p-3 shadow-sm ring-1 ring-black/5 dark:bg-[#1c1c1e] dark:ring-white/10">
        <textarea
          value={props.scheduleText}
          onChange={(event) => props.setScheduleText(event.target.value)}
          className="min-h-[220px] w-full resize-none rounded-[22px] bg-[#f2f2f7] p-4 text-[16px] leading-6 text-[#111318] outline-none placeholder:text-[#8e8e93] dark:bg-[#2c2c2e] dark:text-white"
          placeholder="Paste a ChatGPT schedule..."
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <IosButton tone="secondary" label="Sample" onClick={props.loadSample} />
          <IosButton tone="secondary" label="Clear" onClick={props.clearInput} />
          <IosButton tone="primary" label="Parse" onClick={props.parseCurrentSchedule} />
        </div>
      </div>

      <p className="mt-3 rounded-2xl bg-[#e8f2ff] px-4 py-3 text-[14px] text-[#0057b7] dark:bg-[#0b2b45] dark:text-[#8bd4ff]">{props.statusMessage}</p>

      {props.parsedItems.length ? (
        <>
          <div className="mt-6 flex items-center justify-between">
            <IosGroupTitle title="Preview" />
            <span className="text-[13px] font-semibold text-[#8e8e93]">{props.parsedItems.length} items</span>
          </div>

          <BulkBar
            onSelectAll={() => props.updateMany(props.parsedItems.map((item) => item.id), { skipped: false })}
            onDeselectAll={() => props.updateMany(props.parsedItems.map((item) => item.id), { skipped: true })}
            onCalendar={() => props.updateMany(selectedIds, { type: "calendar" })}
            onReminder={() => props.updateMany(selectedIds, { type: "reminder" })}
            onDeleteAll={props.deleteAll}
          />

          <div className="mt-3 space-y-5">
            {props.groupedItems.map(([date, items]) => (
              <div key={date}>
                <IosGroupTitle title={formatDisplayDate(date)} />
                <div className="ios-list">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      settings={props.settings}
                      active={props.editingItemId === item.id}
                      onEdit={() => props.setEditingItemId(item.id)}
                      onDelete={() => props.deleteItem(item.id)}
                      onUpdate={(patch) => props.updateItem(item.id, patch)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {editingItem ? (
            <EditorPanel
              item={editingItem}
              settings={props.settings}
              updateItem={props.updateItem}
              onClose={() => props.setEditingItemId(null)}
            />
          ) : null}

          <div className="mt-6 rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-[#1c1c1e] dark:ring-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[17px] font-semibold">Add to Apple</p>
                <p className="mt-1 text-[13px] text-[#6d6d72] dark:text-[#a1a1a6]">Calendar uses .ics. Reminders use Shortcut JSON.</p>
              </div>
              <IosButton tone="primary" label="Add All" onClick={props.handleExport} />
            </div>
            {props.successSummary ? (
              <div className="mt-4 grid gap-2">
                <IosButton tone="primary" label={`Download ${props.successSummary.eventCount} Events`} onClick={props.downloadIcs} />
                <IosButton tone="secondary" label={`Copy ${props.successSummary.reminderCount} Tasks`} onClick={props.copyPayload} />
                <IosButton tone="secondary" label="Open Shortcut" onClick={props.openShortcut} />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function HistoryView({ history, onReopen, onDelete }: { history: ImportSession[]; onReopen: (session: ImportSession) => void; onDelete: (id: string) => void }) {
  return (
    <section>
      <ScreenTitle eyebrow="Archive" title="History" subtitle="Reopen previous imports, make edits, and export them again." />
      <div className="ios-list">
        {history.length ? (
          history.map((session) => (
            <div key={session.id} className="ios-row">
              <button type="button" onClick={() => onReopen(session)} className="flex flex-1 items-center gap-3 text-left">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#34c759]/15 text-[#34c759]">H</span>
                <span>
                  <span className="block text-[16px] font-semibold">{new Date(session.createdAt).toLocaleDateString()}</span>
                  <span className="text-[13px] text-[#6d6d72] dark:text-[#a1a1a6]">{session.eventCount} events, {session.reminderCount} reminders</span>
                </span>
              </button>
              <button type="button" onClick={() => onDelete(session.id)} className="text-[14px] font-semibold text-[#ff3b30]">Delete</button>
            </div>
          ))
        ) : (
          <EmptyState title="No history yet" text="Exports will appear here when import history is enabled." />
        )}
      </div>
    </section>
  );
}

function SettingsView({ settings, setSettings }: { settings: UserSettings; setSettings: (updater: (settings: UserSettings) => UserSettings) => void }) {
  return (
    <section>
      <ScreenTitle eyebrow="Preferences" title="Settings" subtitle="Defaults are saved locally on this device." />
      <div className="space-y-6">
        <SettingsGroup title="Defaults">
          <TextSetting label="Calendar" value={settings.defaultCalendar} onChange={(value) => setSettings((current) => ({ ...current, defaultCalendar: value }))} />
          <TextSetting label="Reminder List" value={settings.defaultReminderList} onChange={(value) => setSettings((current) => ({ ...current, defaultReminderList: value }))} />
          <SelectSetting label="Column" value={settings.defaultReminderColumn} options={COMMON_COLUMNS} onChange={(value) => setSettings((current) => ({ ...current, defaultReminderColumn: value }))} />
          <TextSetting label="Calendar Alert" value={settings.defaultCalendarAlert} onChange={(value) => setSettings((current) => ({ ...current, defaultCalendarAlert: value }))} />
          <SelectSetting label="Travel Time" value={String(settings.defaultTravelTime)} options={["none", "manual", "automatic"]} onChange={(value) => setSettings((current) => ({ ...current, defaultTravelTime: value }))} />
        </SettingsGroup>

        <SettingsGroup title="Display">
          <SelectSetting label="Time Format" value={settings.timeFormat} options={["12h", "24h"]} onChange={(value) => setSettings((current) => ({ ...current, timeFormat: value as UserSettings["timeFormat"] }))} />
          <SwitchSetting label="Dark Mode" checked={settings.darkMode} onChange={(value) => setSettings((current) => ({ ...current, darkMode: value }))} />
          <SwitchSetting label="Compact Mode" checked={settings.compactMode} onChange={(value) => setSettings((current) => ({ ...current, compactMode: value }))} />
        </SettingsGroup>

        <SettingsGroup title="Automation">
          <SwitchSetting label="Auto-detect Type" checked={settings.autoDetectType} onChange={(value) => setSettings((current) => ({ ...current, autoDetectType: value }))} />
          <SwitchSetting label="Auto-select Parsed Items" checked={settings.autoSelectAll} onChange={(value) => setSettings((current) => ({ ...current, autoSelectAll: value }))} />
          <SwitchSetting label="Save Import History" checked={settings.saveImportHistory} onChange={(value) => setSettings((current) => ({ ...current, saveImportHistory: value }))} />
        </SettingsGroup>
      </div>
    </section>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: "blue" | "orange" | "green" | "purple" }) {
  const colors = {
    blue: "bg-[#007aff]",
    orange: "bg-[#ff9500]",
    green: "bg-[#34c759]",
    purple: "bg-[#af52de]",
  };

  return (
    <div className="rounded-[26px] bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-[#1c1c1e] dark:ring-white/10">
      <span className={`block h-3 w-3 rounded-full ${colors[color]}`} />
      <p className="mt-5 text-[32px] font-bold tracking-[-0.03em]">{value}</p>
      <p className="text-[14px] font-medium text-[#6d6d72] dark:text-[#a1a1a6]">{label}</p>
    </div>
  );
}

function CompactRow({ item, settings, onEdit }: { item: ScheduleItem; settings: UserSettings; onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className="ios-row w-full text-left">
      <ItemGlyph type={item.type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold">{item.title}</span>
        <span className="text-[13px] text-[#6d6d72] dark:text-[#a1a1a6]">{timeSummary(item, settings)}</span>
      </span>
      <span className="text-[20px] text-[#c7c7cc]">›</span>
    </button>
  );
}

function ItemRow({
  item,
  settings,
  active,
  onEdit,
  onDelete,
  onUpdate,
}: {
  item: ScheduleItem;
  settings: UserSettings;
  active: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<ScheduleItem>) => void;
}) {
  return (
    <div className={`ios-row ${active ? "bg-[#e8f2ff] dark:bg-[#12314a]" : ""} ${item.skipped ? "opacity-45" : ""}`}>
      <button type="button" onClick={() => onUpdate({ skipped: !item.skipped })} className={`h-6 w-6 rounded-full border-2 ${item.skipped ? "border-[#c7c7cc]" : "border-[#007aff] bg-[#007aff]"}`} aria-label="Toggle selected" />
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <ItemGlyph type={item.type} />
          <span className="truncate text-[16px] font-semibold">{item.title}</span>
        </span>
        <span className="mt-1 block text-[13px] text-[#6d6d72] dark:text-[#a1a1a6]">{timeSummary(item, settings)}</span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={item.type === "calendar" ? "blue" : "orange"} label={item.type === "calendar" ? "Calendar" : "Reminder"} />
          {item.duplicateAction === "skip" ? <Badge tone="red" label="Duplicate" /> : null}
          {item.edited ? <Badge tone="gray" label="Edited" /> : null}
        </span>
      </button>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => onUpdate({ type: item.type === "calendar" ? "reminder" : "calendar" })} className="text-[13px] font-semibold text-[#007aff]">Switch</button>
        <button type="button" onClick={onDelete} className="text-[13px] font-semibold text-[#ff3b30]">Delete</button>
      </div>
    </div>
  );
}

function EditorPanel({ item, settings, updateItem, onClose }: { item: ScheduleItem; settings: UserSettings; updateItem: (id: string, patch: Partial<ScheduleItem>) => void; onClose: () => void }) {
  return (
    <div className="mt-5 rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-[#1c1c1e] dark:ring-white/10">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[20px] font-bold tracking-[-0.01em]">Edit Item</p>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-[#f2f2f7] text-[#007aff] dark:bg-[#2c2c2e]">x</button>
      </div>
      <div className="grid gap-3">
        <TextField label="Title" value={item.title} onChange={(value) => updateItem(item.id, { title: value })} />
        <TextField label="Date" type="date" value={item.date} onChange={(value) => updateItem(item.id, { date: value })} />
        <SelectField label="Type" value={item.type} options={["calendar", "reminder"]} onChange={(value) => updateItem(item.id, { type: value as ScheduleItemType })} />
        {item.type === "calendar" ? (
          <>
            <TextField label="Start" value={item.startTime || ""} onChange={(value) => updateItem(item.id, { startTime: value })} />
            <TextField label="End" value={item.endTime || ""} onChange={(value) => updateItem(item.id, { endTime: value })} />
            <TextField label="Location" value={item.location} onChange={(value) => updateItem(item.id, { location: value })} />
            <TextField label="Calendar" value={item.calendar || settings.defaultCalendar} onChange={(value) => updateItem(item.id, { calendar: value })} />
            <TextField label="Alert" value={item.alert} onChange={(value) => updateItem(item.id, { alert: value })} />
            <SelectField label="Travel" value={String(item.travelTime)} options={["none", "manual", "automatic"]} onChange={(value) => updateItem(item.id, { travelTime: value })} />
          </>
        ) : (
          <>
            <TextField label="Due Time" value={item.dueTime || ""} onChange={(value) => updateItem(item.id, { dueTime: value })} />
            <TextField label="List" value={item.reminderList || settings.defaultReminderList} onChange={(value) => updateItem(item.id, { reminderList: value })} />
            <SelectField label="Column" value={item.reminderColumn || settings.defaultReminderColumn} options={COMMON_COLUMNS} onChange={(value) => updateItem(item.id, { reminderColumn: value })} />
            <SelectField label="Priority" value={item.priority} options={["low", "medium", "high"]} onChange={(value) => updateItem(item.id, { priority: value as ScheduleItem["priority"] })} />
            <TextField label="Alert" value={item.alert} onChange={(value) => updateItem(item.id, { alert: value })} />
          </>
        )}
        <TextAreaField label="Notes" value={item.notes} onChange={(value) => updateItem(item.id, { notes: value })} />
        <SwitchSetting label="Completed" checked={item.completed} onChange={(value) => updateItem(item.id, { completed: value })} />
      </div>
    </div>
  );
}

function BulkBar({ onSelectAll, onDeselectAll, onCalendar, onReminder, onDeleteAll }: { onSelectAll: () => void; onDeselectAll: () => void; onCalendar: () => void; onReminder: () => void; onDeleteAll: () => void }) {
  return (
    <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
      <ChipButton label="Select All" onClick={onSelectAll} />
      <ChipButton label="Deselect" onClick={onDeselectAll} />
      <ChipButton label="To Calendar" onClick={onCalendar} />
      <ChipButton label="To Reminder" onClick={onReminder} />
      <ChipButton label="Delete All" danger onClick={onDeleteAll} />
    </div>
  );
}

function BottomNav({ activeTab, setActiveTab }: { activeTab: AppTab; setActiveTab: (tab: AppTab) => void }) {
  const tabs: { id: AppTab; label: string; icon: string }[] = [
    { id: "today", label: "Today", icon: "T" },
    { id: "import", label: "Import", icon: "+" },
    { id: "history", label: "History", icon: "H" },
    { id: "settings", label: "Settings", icon: "S" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] border-t border-black/10 bg-[#fbfbfd]/90 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl dark:border-white/10 dark:bg-[#101012]/90">
      <div className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-semibold ${active ? "text-[#007aff]" : "text-[#8e8e93]"}`}>
              <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] ${active ? "bg-[#007aff] text-white" : "bg-[#f2f2f7] dark:bg-[#2c2c2e]"}`}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function IosButton({ label, onClick, tone }: { label: string; onClick: () => void; tone: "primary" | "secondary" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-[15px] px-4 text-[15px] font-semibold transition active:scale-[0.98] ${
        tone === "primary" ? "bg-[#007aff] text-white" : "bg-[#f2f2f7] text-[#007aff] dark:bg-[#2c2c2e] dark:text-[#64d2ff]"
      }`}
    >
      {label}
    </button>
  );
}

function ChipButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold ${danger ? "bg-[#ffe8e6] text-[#ff3b30] dark:bg-[#3a1715]" : "bg-white text-[#007aff] shadow-sm ring-1 ring-black/5 dark:bg-[#1c1c1e] dark:text-[#64d2ff] dark:ring-white/10"}`}>
      {label}
    </button>
  );
}

function IosGroupTitle({ title }: { title: string }) {
  return <p className="mb-2 px-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#8e8e93]">{title}</p>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="p-5 text-center">
      <p className="text-[16px] font-semibold">{title}</p>
      <p className="mt-1 text-[14px] leading-5 text-[#6d6d72] dark:text-[#a1a1a6]">{text}</p>
    </div>
  );
}

function Badge({ tone, label }: { tone: "blue" | "orange" | "red" | "gray"; label: string }) {
  const colors = {
    blue: "bg-[#e8f2ff] text-[#007aff] dark:bg-[#113457] dark:text-[#64d2ff]",
    orange: "bg-[#fff3df] text-[#c66a00] dark:bg-[#3a2812] dark:text-[#ffd28a]",
    red: "bg-[#ffe8e6] text-[#ff3b30] dark:bg-[#3a1715] dark:text-[#ff9f98]",
    gray: "bg-[#f2f2f7] text-[#6d6d72] dark:bg-[#2c2c2e] dark:text-[#d1d1d6]",
  };

  return <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${colors[tone]}`}>{label}</span>;
}

function ItemGlyph({ type }: { type: ScheduleItemType }) {
  return <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white ${type === "calendar" ? "bg-[#007aff]" : "bg-[#ff9500]"}`}>{type === "calendar" ? "C" : "R"}</span>;
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <IosGroupTitle title={title} />
      <div className="ios-list">{children}</div>
    </div>
  );
}

function TextSetting({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="ios-row">
      <span className="text-[16px]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-36 bg-transparent text-right text-[16px] text-[#6d6d72] outline-none dark:text-[#d1d1d6]" />
    </label>
  );
}

function SelectSetting({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="ios-row">
      <span className="text-[16px]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="max-w-44 bg-transparent text-right text-[16px] text-[#6d6d72] outline-none dark:text-[#d1d1d6]">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SwitchSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="ios-row">
      <span className="text-[16px]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="ios-switch" />
    </label>
  );
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label>
      <span className="mb-1 block px-1 text-[13px] font-semibold text-[#8e8e93]">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-[14px] bg-[#f2f2f7] px-3 text-[16px] outline-none dark:bg-[#2c2c2e]" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block px-1 text-[13px] font-semibold text-[#8e8e93]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-[14px] bg-[#f2f2f7] px-3 text-[16px] outline-none dark:bg-[#2c2c2e]">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block px-1 text-[13px] font-semibold text-[#8e8e93]">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 w-full resize-none rounded-[14px] bg-[#f2f2f7] p-3 text-[16px] outline-none dark:bg-[#2c2c2e]" />
    </label>
  );
}

function timeSummary(item: ScheduleItem, settings: UserSettings): string {
  if (item.type === "calendar") {
    const start = item.startTime ? formatTimeLabel(item.startTime, settings.timeFormat) : "All day";
    const end = item.endTime ? ` - ${formatTimeLabel(item.endTime, settings.timeFormat)}` : "";
    return `${formatDisplayDate(item.date)} · ${start}${end}`;
  }

  const due = item.dueTime ? formatTimeLabel(item.dueTime, settings.timeFormat) : "No time";
  return `${formatDisplayDate(item.date)} · Due ${due}`;
}

function extractEmoji(title: string): string {
  const match = title.match(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu);
  return match?.[0] || "";
}
