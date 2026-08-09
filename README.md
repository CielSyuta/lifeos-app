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

```
Next.js (static export → /out)
    ↓ npx cap sync
Capacitor iOS shell (ios/App/)
    ↓ native bridges
EventKit (Calendar + Reminders)
```

- **Web/PWA layer:** Next.js with static export (`output: "export"`), output to `/out`
- **Native shell:** Capacitor wrapping the static bundle
- **Native plugins:**
  - `LifeOSCalendarPlugin.swift` — EventKit calendar integration
  - `LifeOSRemindersPlugin.swift` — EventKit reminders integration
- **TypeScript bridges:** `src/lib/native/calendar.ts`, `src/lib/native/reminders.ts`
- **Haptics:** `src/lib/native/haptics.ts` wraps `@capacitor/haptics`
- **Environment detection:** `src/lib/native/environment.ts`

## iOS requirements

- macOS with Xcode 26 or newer
- Apple Developer account for device/distribution builds
- CocoaPods or Swift Package Manager (Capacitor uses SPM by default in recent versions)

## Running on iOS Simulator

```bash
# 1. Install dependencies
npm install

# 2. Build the static web bundle
npm run build

# 3. Sync web bundle into the Xcode project
npx cap sync ios

# 4. Open in Xcode
npx cap open ios

# 5. Select a Simulator target in Xcode and run
```

> **Note:** The static web bundle (`/out`) must be built before syncing. Run `npm run build` before `npx cap sync ios`.

## Web / PWA development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:3000`. Capacitor native features are not available in the browser; the app falls back to ICS download (Calendar) and Shortcut URL (Reminders) on web.

## Syncing web changes into the native project

```bash
npm run build        # rebuilds /out
npx cap sync ios     # copies /out into ios/App/App/public and updates native plugins
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

All data is stored on-device only. Nothing is sent to any server.

| Data | Storage |
|------|---------|
| Schedule text | localStorage |
| Parsed items | localStorage |
| Import history | localStorage |
| Settings/preferences | localStorage |
| Onboarding state | localStorage |

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

## Validation

```bash
npm install
npm run lint
npx tsc --noEmit
npm test
npm run build
npx cap sync ios
```

## Production build instructions

1. `npm run build` — produces static export in `/out`
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
