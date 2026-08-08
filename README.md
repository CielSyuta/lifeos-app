# LifeOS

LifeOS is a production-ready, mobile-first Progressive Web App for turning pasted schedules into calendar events, reminder tasks, ICS exports, and Apple Shortcut payloads.

## Features

- Mobile-first iPhone-style UI with bottom navigation
- **Canonical `[EVENT]` / `[TASK]` import format** — deterministic, structured parsing
- Natural-language and legacy structured schedule parsing (fallback)
- Address support — tap any address to open Apple Maps on iPhone
- Per-item `Add` button (exports single ICS / opens Apple Shortcut URL)
- Import progress indicator (`N of M added`)
- Inline edit sheet for all fields including Address
- Local-first persistence with localStorage
- ICS export for Apple Calendar (includes `LOCATION` from address)
- Apple Shortcut JSON export for Apple Reminders automation
- Duplicate detection and smart defaults
- PWA manifest, standalone mode, service worker, and Apple-friendly icons

## Canonical import format

LifeOS supports a structured import format that is reliable and easy for LLMs to generate.

### Event

```
[EVENT]
Title: 💪 Gym
Date: 2026-08-10
Start: 10:45 AM
End: 12:45 PM
Address: 123 Main St, Springfield, MA 01103
Notes: Pull day
[/EVENT]
```

### Task / Reminder

```
[TASK]
Title: 🧺 Start Laundry
Date: 2026-08-10
Due: 9:45 AM
Address:
List: Life General
Column: Laundry
Notes:
[/TASK]
```

### Rules

- `[EVENT]` … `[/EVENT]` — a calendar event
- `[TASK]` … `[/TASK]` — a reminder / task
- Each field on its own line: `Key: Value`
- Keys are case-insensitive; canonical keys are: `Title`, `Date`, `Start`, `End`, `Due`, `Address`, `Notes`, `List`, `Column`
- `Date` uses ISO format `YYYY-MM-DD`
- Times support `10:45 AM`, `4:00 PM`, `12:45 AM`
- Overnight events work automatically (end time < start time → end is next day)
- Empty `Address:` → no address (field is optional)
- `Address:` with a value → exact address, not modified or inferred

### Parsing priority

1. Canonical `[EVENT]` / `[TASK]` blocks (if detected)
2. Legacy structured format (Date: header + `MM/DD/YY HH:MM AM – HH:MM PM` lines)
3. Natural-language inference

### Validation

- Events require: `Title`, `Date`, `Start`, `End`
- Tasks require: `Title`
- Invalid items are shown individually with an error message — other items still parse

## Sample import file

See [`public/sample-import.txt`](public/sample-import.txt) for a copy-paste-ready example.

## Tech stack

- Next.js 16
- TypeScript
- Tailwind CSS v4
- PWA support
- Vitest

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```
3. Open http://localhost:3000

## Testing

Run the unit test suite:

```bash
npm test
```

## Lint and typecheck

```bash
npm run lint
npx tsc --noEmit
```

## Build

```bash
npm run build
```

## Deploy to Vercel

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Use the default Next.js settings.
4. Vercel will build and deploy automatically.

## Install on iPhone

1. Open the deployed app in Safari.
2. Tap Share → Add to Home Screen.
3. Launch the app from the home screen for the standalone PWA experience.

## iPhone address integration

When an item has an `Address:` field, tapping the address in the item list opens Apple Maps directly on iPhone (`maps.apple.com` URL scheme).

## Browser / iOS limitations

- **ICS download on iOS Safari**: tapping `Add` for a calendar event downloads a `.ics` file. iOS Safari may prompt to open it in Calendar directly. If not, open the Files app and tap the `.ics` file.
- **Apple Shortcuts**: the `Add` button for tasks opens the Shortcuts URL scheme. This requires an Apple Shortcut named `LifeOS Import` to be installed on the device.
- **Address maps**: uses `https://maps.apple.com/?q=...` which opens Apple Maps on iOS and Google Maps (or the default map app) on Android/desktop.
