# Schedule Parser

Schedule Parser is a mobile-first Progressive Web App for importing schedules into Apple Calendar and Apple Reminders.

## Purpose

Paste a schedule → parse it → review each item → add individual events/tasks.

This app is an import utility, not a full calendar replacement UI.

## Import flow

1. **Paste** raw text, canonical blocks, or legacy blocks.
2. **Parse** into structured events and tasks.
3. **Review** each item (time, location, address, travel, alert, notes).
4. **Add** each item individually:
   - Event: Calendar handoff via single-event `.ics`
   - Task: Reminders handoff via Shortcut payload URL

## Canonical format

### EVENT

```text
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
```

Required fields: `Title`, `Date`, `Start`, `End`.

Optional fields: `Location`, `Address`, `Calendar`, `Alert`, `TravelTime`, `Repeat`, `URL`, `Notes`.

### TASK

```text
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
[/TASK]
```

Required field: `Title`.

Optional fields: `Date`, `Due`, `List`, `Column`, `Priority`, `Alert`, `Repeat`, `URL`, `Notes`.

## Parser behavior

Priority order:
1. Canonical `[EVENT]...[/EVENT]` and `[TASK]...[/TASK]`
2. Legacy structured blocks
3. Natural schedule text

Canonical blocks are parsed directly (not heuristically).

## Emoji + Unicode handling

Titles preserve full Unicode exactly, including emoji (for example `💪 Gym`, `🍟 McDonald's | Enfield`, `🌅 Morning Routine`).

## Location and Address

`Location` and `Address` stay separate.

- `Location` is the human-readable place name.
- `Address` is the navigable address.
- Explicit `Address` is preserved and shown separately.

When available, address links can open Apple Maps.

## Alerts and travel time

Supported alerts: `None`, `AtTime`, `AtDueTime`, `5m`, `10m`, `15m`, `30m`, `1h`, `2h`, `1d`.

Supported travel time: blank, `None`, `15m`, `30m`, `45m`, `1h`, `1h30m`.
Travel time is normalized to minutes internally.

## User defaults

Settings include:
- Default Calendar
- Default Event Alert
- Default Reminder List
- Default Reminder Column
- Default Reminder Alert
- Default Travel Time
- Default Repeat

Blank structured values use stored defaults.

## Safari/PWA limitations

Schedule Parser runs as a PWA and can generate handoff payloads, but iOS handoff behavior depends on Safari/OS capabilities.

- Event import via `.ics` works broadly.
- Reminder handoff depends on user Shortcut setup.
- Native Apple Calendar travel-time settings may not be directly writable in all handoff paths.
  Travel time is still preserved and displayed in the app before handoff.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```
