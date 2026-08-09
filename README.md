# LifeOS — Schedule Parser

LifeOS is a local-first, native iOS schedule parsing utility that turns pasted schedule text into Apple Calendar events and Apple Reminders — without copying and typing each item manually.

## Product identity

**App name:** LifeOS  
**Subtitle:** Schedule Parser  
**Bundle ID:** com.cielsyuta.lifeos  
**Primary use:** Paste schedule text → parse → review → add to Calendar/Reminders

## How it works

1. **Paste** any schedule text — shift rosters, appointment lists, or canonical `[EVENT]`/`[TASK]` blocks.
2. **Parse** into structured events and tasks.
3. **Review** each item: time, location, address, travel time, alert, notes.
4. **Add** each item individually to Apple Calendar or Apple Reminders.

Nothing is added automatically. You approve every item.

## Architecture

This is a dual-purpose codebase: a **mobile-first PWA** (primary target: iPhone Safari + "Add to Home Screen") and a Capacitor-wrapped native iOS shell built from the same source.

```
Next.js (server build, Vercel)              Next.js (static export → /out)
    ↓ served directly as a PWA                   ↓ npx cap sync
Safari "Add to Home Screen"                  Capacitor iOS shell (ios/App/)
    ↓ Web Push + Notifications API               ↓ native bridges
Service worker (public/sw.js)                EventKit (Calendar + Reminders)
```

- **Web/PWA layer:** `npm run build` produces a normal Next.js server build (Vercel-hosted), including the API routes used for Web Push.
- **Capacitor/native layer:** `npm run build:capacitor` produces the static export (`output: "export"`, `/out`) that Capacitor consumes. The API routes are not part of this build — the native shell never talks to the Web Push backend, since it uses EventKit directly instead.
- **Native shell:** Capacitor wrapping the static bundle
- **Native plugins:**
  - `LifeOSCalendarPlugin.swift` — EventKit calendar integration
  - `LifeOSRemindersPlugin.swift` — EventKit reminders integration
- **TypeScript bridges:** `src/lib/native/calendar.ts`, `src/lib/native/reminders.ts`
- **Haptics:** `src/lib/native/haptics.ts` wraps `@capacitor/haptics`
- **Environment detection:** `src/lib/native/environment.ts`, `src/lib/push/environment.ts` (iOS/standalone/push-support detection for the PWA)

### PWA calendar routing (not native)

On the web/PWA, calendar assignment is **name-based routing only** — it cannot query EventKit, iCloud, or native Calendar accounts. See "Calendar routing rules" below.

### Web Push daily reminders

- `src/lib/push/client.ts` — client-side subscribe/enable/disable/test flow
- `public/sw.js` — service worker `push` and `notificationclick` handlers
- `src/app/api/push/subscribe`, `.../unsubscribe`, `.../test` — subscription endpoints
- `src/app/api/cron/daily-reminder` — polled by Vercel Cron (`vercel.json`) to send due reminders
- `src/lib/server/subscriptionStore.ts` — Upstash/Vercel KV-backed store (falls back to a local JSON file in dev)
- `src/lib/server/webPush.ts`, `src/lib/server/schedule.ts` — Web Push sending + timezone-aware "is it time yet" logic

See `.env.example` for the required environment variables (VAPID keys, optional KV credentials, optional cron secret).

## iOS requirements

- macOS with Xcode 26 or newer
- Apple Developer account for device/distribution builds
- CocoaPods or Swift Package Manager (Capacitor uses SPM by default in recent versions)

## Running on iOS Simulator

```bash
# 1. Install dependencies
npm install

# 2. Build the static web bundle
npm run build:capacitor

# 3. Sync web bundle into the Xcode project
npx cap sync ios

# 4. Open in Xcode
npx cap open ios

# 5. Select a Simulator target in Xcode and run
```

> **Note:** The static web bundle (`/out`) must be built before syncing. Run `npm run build:capacitor` before `npx cap sync ios`.

## Web / PWA development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:3000`. Capacitor native features are not available in the browser; the app falls back to ICS download (Calendar) and Shortcut URL (Reminders) on web.

## Syncing web changes into the native project

```bash
npm run build:capacitor  # rebuilds /out (static export, API routes excluded)
npx cap sync ios         # copies /out into ios/App/App/public and updates native plugins
```

## Native Calendar and Reminders architecture

### Calendar (EventKit)

`LifeOSCalendarPlugin.swift` implements `CAPPlugin`:
- Requests `EKEntityType.event` authorization using `requestFullAccessToEvents` on iOS 17+, falling back to `requestAccess` for earlier targets
- Permissions are requested **only when the user taps Add** on a calendar item — never at launch
- Creates `EKEvent` with: title, start/end date, location, notes, URL, alarm offset, calendar selection
- Handles midnight-crossing events and all-day events
- Returns `{success: true, eventId}` or `{success: false, error}`

### Reminders (EventKit)

`LifeOSRemindersPlugin.swift` implements `CAPPlugin`:
- Requests `EKEntityType.reminder` authorization
- Permissions requested only when user taps Add on a reminder item
- Creates `EKReminder` with: title, due date components, notes, URL, priority, alarm, list selection

### Permission behavior

- Calendar permission: not requested until user taps Add on a calendar event
- Reminders permission: not requested until user taps Add on a reminder
- App remains fully functional for parsing and reviewing if either permission is denied

## Privacy model

All schedule and settings data is stored on-device only (localStorage). The only thing ever sent to a server is Web Push subscription/scheduling metadata for the optional daily planning reminder — never pasted schedule text or parsed items.

| Data | Storage |
|------|---------|
| Schedule text | localStorage |
| Parsed items | localStorage |
| Import history | localStorage |
| Settings/preferences (including calendar defaults/routing rules) | localStorage |
| Onboarding state | localStorage |
| Push subscription, reminder time, timezone, enabled state, message, device id | Server-side store (KV or local file), used only to send the daily reminder |

See `docs/PRIVACY_POLICY.md` for the full draft privacy policy.

## Settings

- Default Calendar
- Default Event Alert (`none`, `5m`, `10m`, `15m`, `30m`, `1h`, `2h`, `1d`, `at_time`)
- Default Reminder List
- Default Reminder Column
- Default Reminder Alert
- Default Travel Time
- Default Repeat
- Time format (12h / 24h)
- Dark mode
- Save import history
- **Calendar Defaults** — Personal/Work/Other calendar names, default calendar
- **Calendar Routing Rules** — case-insensitive title-match → target calendar rules
- **Notifications** — daily (and future evening) planning reminder enable/time/message, Enable/Test buttons

## Calendar routing rules (PWA)

The web app **cannot** read native Apple Calendar accounts, query EventKit, or guarantee which calendar Apple's Calendar app ultimately imports an event into — that always depends on Apple's own import UI. Instead, calendar assignment is a purely name-based routing convenience:

1. An explicit `Calendar:` value in a structured `[EVENT]` block always wins.
2. Otherwise, the first matching routing rule (case-insensitive substring match on the title) is used.
3. Otherwise, the configured default calendar is used.

The resolved calendar name is shown on each parsed row and is editable per-event before Add.

## Daily planning reminder (Web Push)

- Notification permission is never requested on load — only when the user taps **Enable Daily Reminder** in Settings.
- On iOS, Web Push only works once the PWA is added to the Home Screen; the app detects this and shows install instructions instead of a broken permission prompt.
- Reminders are sent by a server-side scheduled job (Vercel Cron, see `vercel.json`), **not** by client-side timers — this is required for reliability when the PWA isn't open.
- The reminder time is stored per-subscriber alongside `Intl.DateTimeFormat().resolvedOptions().timeZone`, so it fires at the configured local time regardless of server timezone.
- Tapping the notification opens the app directly to the Import screen.

## Canonical schedule format

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

Required: `Title`, `Date`, `Start`, `End`  
Optional: `Location`, `Address`, `Calendar`, `Alert`, `TravelTime`, `Repeat`, `URL`, `Notes`

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

Required: `Title`  
Optional: `Date`, `Due`, `List`, `Column`, `Priority`, `Alert`, `Repeat`, `URL`, `Notes`

## Parser behavior

Priority order:
1. Canonical `[EVENT]...[/EVENT]` and `[TASK]...[/TASK]` blocks
2. Legacy structured blocks
3. Natural schedule text (heuristic)

Canonical blocks are parsed directly, not heuristically. Emoji and Unicode are preserved exactly.

## Tests

```bash
npm test
```

Tests cover:
- Canonical EVENT and TASK parsing
- Emoji and Unicode handling
- Location vs address separation
- Alert normalization
- Travel time parsing
- Recurrence fields
- Malformed/empty schedules
- Duplicate detection
- ICS generation
- Shortcut payload generation
- Local storage: onboarding state, settings migration, data reset
- Calendar routing rule matching (case-insensitive, explicit override, default fallback)
- Notification/calendar settings persistence and timezone storage
- Push subscription registration logic (unsupported browser, permission denied, success, server error)
- Notification click routing
- iOS install guidance detection

## Validation

```bash
npm install
npm run lint
npx tsc --noEmit
npm test
npm run build             # server build (Vercel/PWA), includes API routes
npm run build:capacitor   # static export for Capacitor (no API routes)
npx cap sync ios
```

## Production build instructions

### Web / PWA (Vercel)

1. Set the environment variables in `.env.example` in the Vercel project.
2. `npm run build` — produces a standard Next.js server build, including the Web Push API routes.
3. Deploy to Vercel; `vercel.json` configures the scheduled cron job that sends daily reminders.

### Native iOS (Capacitor)

1. `npm run build:capacitor` — produces static export in `/out` (API routes excluded)
2. `npx cap sync ios` — copies bundle into `ios/App/App/public`
3. Open `ios/App/App.xcodeproj` in Xcode
4. Select Release build configuration
5. Archive → distribute via App Store Connect

See `docs/APP_STORE_READINESS.md` for the full checklist.

## Documentation

| File | Contents |
|------|----------|
| `docs/PRIVACY_POLICY.md` | Draft privacy policy |
| `docs/APP_STORE_READINESS.md` | Submission checklist |
| `docs/APP_STORE_METADATA.md` | Draft App Store listing copy |
| `docs/ios-assets-needed.md` | Required Xcode asset catalog artwork |
| `docs/ios-plist-additions.xml` | Required Info.plist permission strings |
