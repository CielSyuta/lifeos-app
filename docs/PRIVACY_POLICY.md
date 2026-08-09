# LifeOS Privacy Policy

**Effective date:** [INSERT DATE BEFORE PUBLICATION]  
**Hosted at:** [INSERT PRIVACY POLICY URL BEFORE SUBMISSION]

---

## Overview

LifeOS is a local-first schedule parsing utility. This policy explains what information is stored and what leaves your device.

---

## Information Stored on Your Device

LifeOS stores the following data **only on your device** using your device's local storage:

| Data | Where stored | Purpose |
|------|-------------|---------|
| Schedule text you paste | Device local storage | Preserves active import session between launches |
| Parsed schedule items (events and tasks) | Device local storage | Preserves active import session between launches |
| Import history | Device local storage | Allows you to reopen and review previous imports |
| App settings (default calendar, alert preferences, time format, dark mode, etc.) | Device local storage | Remembers your preferences |
| Onboarding completion flag | Device local storage | Prevents showing the introduction screen on subsequent launches |

---

## Information That Leaves Your Device

### When you add an event to Apple Calendar (web/PWA version)

When you tap **Add** on a calendar event, LifeOS generates an `.ics` file and prompts your browser to download it. The file is created entirely on your device. No data is sent to any LifeOS server.

### When you add a reminder (web/PWA version)

When you tap **Add** on a task, LifeOS opens a URL to an Apple Shortcut or Reminders URL scheme. The data is passed to iOS locally. No data is sent to any LifeOS server.

### Native iOS (when applicable)

When using the native iOS app, Calendar and Reminders access is requested **only when you explicitly tap Add** on an item. The EventKit APIs write data directly to Apple's on-device frameworks. No data is sent to any LifeOS server.

### No analytics, no advertising, no tracking

LifeOS does not collect:
- Analytics or usage telemetry
- Advertising identifiers
- Crash reports sent to third parties
- Device fingerprinting data
- Location data
- Contact data

---

## Apple Calendar and Reminders

LifeOS does not read your existing Calendar events or Reminders. LifeOS only writes new items when you explicitly request it. Previously created Calendar events and Reminders are not affected by resetting LifeOS data.

---

## Data Retention

All LifeOS data remains on your device until you:
- Tap **Settings → Reset LifeOS Data** (removes schedule data, history, and settings from LifeOS local storage)
- Uninstall the app

Resetting LifeOS data does **not** remove events or reminders you previously added to Apple Calendar or Apple Reminders.

---

## Children

LifeOS does not knowingly collect personal information from children under 13. The app contains no features designed to collect personal information.

---

## Changes to This Policy

This privacy policy may be updated before the app is published. Material changes will be noted at the top of this document.

---

## Contact

For questions about this privacy policy, contact:  
[INSERT SUPPORT EMAIL OR URL BEFORE SUBMISSION]

---

*This is a draft policy prepared for App Store submission. The final version must be reviewed by a qualified attorney and hosted at a public URL before submission.*
