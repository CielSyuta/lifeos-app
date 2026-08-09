import { afterEach, describe, expect, it, vi } from "vitest";
import { getNotificationClickTarget, isIos, isPushSupported, isStandalonePwa, needsIosInstallGuidance } from "./environment";

function stubUserAgent(userAgent: string, maxTouchPoints = 0) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("iOS detection", () => {
  it("detects iPhone user agents", () => {
    stubUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    expect(isIos()).toBe(true);
  });

  it("detects iPadOS 13+ reporting as Macintosh with multi-touch support", () => {
    stubUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15", 5);
    expect(isIos()).toBe(true);
  });

  it("does not flag desktop Safari as iOS", () => {
    stubUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15", 0);
    expect(isIos()).toBe(false);
  });

  it("does not flag Android as iOS", () => {
    stubUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36");
    expect(isIos()).toBe(false);
  });
});

describe("standalone / install guidance", () => {
  it("reports iOS install guidance needed when not running standalone", () => {
    stubUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    vi.stubGlobal("window", {
      navigator: { standalone: false },
      matchMedia: () => ({ matches: false }),
    });
    expect(isStandalonePwa()).toBe(false);
    expect(needsIosInstallGuidance()).toBe(true);
  });

  it("does not require install guidance once added to the Home Screen", () => {
    stubUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    vi.stubGlobal("window", {
      navigator: { standalone: true },
      matchMedia: () => ({ matches: false }),
    });
    expect(needsIosInstallGuidance()).toBe(false);
  });

  it("does not show iOS guidance on non-iOS platforms", () => {
    stubUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36");
    vi.stubGlobal("window", {
      navigator: { standalone: false },
      matchMedia: () => ({ matches: false }),
    });
    expect(needsIosInstallGuidance()).toBe(false);
  });
});

describe("push support detection", () => {
  it("reports unsupported when Push/Notification APIs are missing", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    expect(isPushSupported()).toBe(false);
  });
});

describe("notification click routing", () => {
  it("routes a daily planning reminder tap to the Import screen", () => {
    expect(getNotificationClickTarget({ type: "daily-planning-reminder" })).toBe("/?tab=import");
  });

  it("routes an unknown/future payload type to the Import screen as a safe default", () => {
    expect(getNotificationClickTarget({ type: "evening-planning-reminder" })).toBe("/?tab=import");
    expect(getNotificationClickTarget(undefined)).toBe("/?tab=import");
  });
});
