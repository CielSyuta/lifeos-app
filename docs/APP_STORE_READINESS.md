# App Store Readiness Checklist

This document tracks what must be completed before submitting LifeOS to the Apple App Store.

---

## Build

- [ ] Xcode 26 or newer installed
- [ ] Current required iOS SDK selected in Xcode
- [ ] Release configuration selected
- [ ] Bundle identifier set to `com.cielsyuta.lifeos` (or chosen identifier)
- [ ] Version number set (currently `1.0.0`)
- [ ] Build number set (currently `1`)
- [ ] Signing certificate and provisioning profile configured (do not commit credentials)
- [ ] Archive builds successfully with Release configuration
- [ ] No development URLs in production build
- [ ] No mock features active
- [ ] No placeholder secrets or test credentials in code
- [ ] No debug menus exposed in Release build
- [ ] `npm run build` passes without errors
- [ ] `npx cap sync` completes without errors
- [ ] Static web bundle (`/out`) present and complete
- [ ] Capacitor iOS project compiles without warnings

---

## Native iOS Configuration

**MANUAL APP STORE STEP — requires Xcode and Apple Developer account**

- [ ] `capacitor.config.ts` `appId` matches App Store Connect bundle ID
- [ ] `Info.plist` contains `NSCalendarsFullAccessUsageDescription`
- [ ] `Info.plist` contains `NSRemindersFullAccessUsageDescription`
- [ ] Privacy usage descriptions are accurate and specific (not generic)
- [ ] Deployment target set appropriately (iOS 16 minimum recommended)
- [ ] Supported interface orientations configured
- [ ] App transport security configured (no arbitrary loads unless justified)

**Required Info.plist additions:**

```xml
<key>NSCalendarsFullAccessUsageDescription</key>
<string>LifeOS uses Calendar access only when you choose to add a parsed event to one of your calendars.</string>

<key>NSRemindersFullAccessUsageDescription</key>
<string>LifeOS uses Reminders access only when you choose to add a parsed task to one of your reminder lists.</string>
```

---

## App Icon and Splash Screen

**MANUAL APP STORE STEP — requires production artwork**

- [ ] AppIcon.appiconset populated with all required sizes:
  - 20×20 @1x, @2x, @3x
  - 29×29 @1x, @2x, @3x
  - 40×40 @1x, @2x, @3x
  - 60×60 @2x, @3x
  - 76×76 @1x, @2x (iPad)
  - 83.5×83.5 @2x (iPad Pro)
  - 1024×1024 @1x (App Store)
- [ ] No alpha channel in App Store icon (1024×1024)
- [ ] LaunchScreen.storyboard or Info.plist splash configured
- [ ] App display name is "LifeOS" (confirmed in Info.plist and Xcode target settings)

See `docs/ios-assets-needed.md` for details.

---

## App Store Connect

**MANUAL APP STORE STEP — requires App Store Connect access**

- [ ] App record created in App Store Connect
- [ ] App name: **LifeOS**
- [ ] Subtitle: **Schedule Parser**
- [ ] Description: see `docs/APP_STORE_METADATA.md`
- [ ] Keywords: see `docs/APP_STORE_METADATA.md`
- [ ] Primary category: **Productivity**
- [ ] Secondary category: **Utilities** (optional)
- [ ] Age rating questionnaire completed (should be 4+)
- [ ] Copyright field: © [YEAR] [DEVELOPER NAME]
- [ ] Support URL: [INSERT REAL URL BEFORE SUBMISSION]
- [ ] Privacy policy URL: [INSERT REAL URL BEFORE SUBMISSION]
- [ ] App Privacy responses completed:
  - Data Not Collected (if accurate after final review)
- [ ] Screenshots uploaded for required device sizes:
  - iPhone 6.9" (required)
  - iPhone 6.7" (required)
  - iPhone 5.5" (required for older devices)
  - iPad if submitting for iPad
- [ ] App preview video (optional but recommended)
- [ ] App icon uploaded (1024×1024, no alpha)
- [ ] Review contact information (name, phone, email)
- [ ] Review notes: see App Review Notes section below
- [ ] Export compliance (likely "No" for standard encryption)
- [ ] Pricing: Free
- [ ] Distribution: App Store (worldwide or selected territories)

---

## TestFlight

**MANUAL APP STORE STEP**

- [ ] At least one internal tester has reviewed the build
- [ ] Core flows tested on physical device:
  - [ ] Parse a schedule from paste
  - [ ] Add an event to Calendar (permission request appears only on Add tap)
  - [ ] Add a task to Reminders (permission request appears only on Add tap)
  - [ ] App works fully with Calendar permission denied
  - [ ] App works fully with Reminders permission denied
  - [ ] App launches offline with no network
  - [ ] Onboarding appears on first launch, not on subsequent launches
  - [ ] Reset LifeOS Data works and shows confirmation warning
- [ ] No crashes on supported devices

---

## App Review Notes

Prepare these notes for the App Review submission form:

> **App name:** LifeOS — Schedule Parser
>
> **What this app does:**
> LifeOS is a local-first schedule parsing utility. Users paste or import schedule text (such as shift rosters, appointment lists, or structured event blocks). LifeOS parses the text into structured events and tasks. Users review each item individually before anything is created.
>
> **Calendar and Reminders permissions:**
> - Calendar access is requested only when the user explicitly taps "Add" on a parsed calendar event.
> - Reminders access is requested only when the user explicitly taps "Add" on a parsed task.
> - No calendar event or reminder is created without deliberate user action.
> - The app remains fully functional for parsing if either permission is denied.
>
> **Network requirements:**
> - The app does not require a network connection to launch or use its core features.
> - Parsing, reviewing, and editing items works entirely offline.
> - External links (Apple Maps addresses, privacy policy, support) open in Safari if tapped.
>
> **No account or server:**
> - LifeOS is local-first. No account, login, or registration is required.
> - No data is transmitted to any server.

---

## Security Audit Results

The following were checked and found clean:
- No hardcoded API keys, tokens, or secrets
- No eval() usage
- External URLs (Apple Maps) use `encodeURIComponent` before construction
- No innerHTML injection
- No unsafe random generation (uses `crypto.getRandomValues` where randomness is needed)

---

## Known Remaining Items Before Submission

1. **Production artwork** — App icon and launch screen require final design assets
2. **Public URLs** — Privacy policy and support URLs must be live before submission
3. **Xcode project** — Must be opened and built on a Mac with Xcode to produce a signed archive
4. **Physical device testing** — EventKit permission flows must be verified on a real device
5. **Developer account** — Apple Developer Program membership required for distribution
