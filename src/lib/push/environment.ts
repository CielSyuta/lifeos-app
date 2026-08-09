/** Detects iOS/iPadOS Safari, where Web Push requires the app to be installed to the Home Screen. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as "Macintosh" but exposes multi-touch support.
  const isIpadOs13Plus = ua.includes("Macintosh") && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIpadOs13Plus;
}

/** Detects whether the PWA is currently running installed to the Home Screen (standalone display mode). */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const navigatorStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  const mediaStandalone = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return Boolean(navigatorStandalone) || mediaStandalone;
}

/** Web Push (Push API + Notifications API + Service Worker) support check. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** On iOS, Web Push only works once the PWA has been added to the Home Screen. */
export function needsIosInstallGuidance(): boolean {
  return isIos() && !isStandalonePwa();
}

/**
 * Resolves the URL Schedule Parser should open when a push notification is tapped.
 * Kept as a pure, testable function; the service worker (public/sw.js) uses the same
 * "/?tab=import" target so tapping any notification lands on the Import screen.
 */
export function getNotificationClickTarget(notificationData?: { type?: string }): string {
  if (notificationData?.type === "daily-planning-reminder") {
    return "/?tab=import";
  }
  return "/?tab=import";
}
