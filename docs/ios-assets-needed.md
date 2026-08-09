# iOS assets still needed

Before App Store submission, replace `ios/App/App/Assets.xcassets/AppIcon.appiconset/placeholder.png` with properly sized PNG assets for:

- iPhone: 40x40, 60x60, 58x58, 87x87, 80x80, 120x120, 120x120, 180x180
- iPad: 20x20, 40x40, 29x29, 58x58, 40x40, 80x80, 76x76, 152x152, 167x167
- App Store marketing: 1024x1024

The current `Contents.json` references a single placeholder file for every slot so the Capacitor/Xcode project has the expected app icon structure, but real size-specific icons are still required.
