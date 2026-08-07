# LifeOS

LifeOS is a production-ready, mobile-first Progressive Web App for turning pasted schedules into calendar events, reminder tasks, ICS exports, and Apple Shortcut payloads.

## Features

- Mobile-first iPhone-style UI with bottom navigation
- Natural-language and structured schedule parsing
- Editable preview cards with calendar/reminder toggles
- Bulk actions for selecting, converting, deleting, and exporting items
- Local-first persistence with localStorage
- ICS export for Apple Calendar
- Apple Shortcut JSON export for Apple Reminders automation
- Duplicate detection and smart defaults
- PWA manifest, standalone mode, service worker, and Apple-friendly icons

## Tech stack

- Next.js
- TypeScript
- Tailwind CSS
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
2. Tap Share.
3. Choose Add to Home Screen.
4. Confirm the name and tap Add.
5. Launch the app from the home screen for the standalone PWA experience.

## Apple Shortcut flow

1. Parse a schedule and tap Add All.
2. Use the Copy Shortcut Payload button to copy the JSON payload.
3. In Apple Shortcuts, create or install a shortcut that accepts JSON input and creates reminders in the desired list.
4. Use the generated payload to populate the reminder tasks.
