"use client";

import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────
   Bogus-account generation
   (nothing is ever sent anywhere)
───────────────────────────────────────────── */
const FIRST = ["Alex", "Jordan", "Morgan", "Riley", "Casey", "Avery", "Quinn", "Sage", "Drew", "Reese"];
const LAST = ["Schedule", "Planner", "Calendar", "Keeper", "Tracker", "Organizer", "Minder", "Wrangler"];

function rnd(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAccount(): MockAccount {
  const firstName = rnd(FIRST);
  const lastName = rnd(LAST);
  const suffix = Math.random().toString(36).slice(2, 7);
  const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}`;
  const email = `${username}@scheduleparser.app`;
  return { firstName, lastName, username, email, createdAt: new Date().toISOString() };
}

/* ─────────────────────────────────────────────
   Persistence
───────────────────────────────────────────── */
const ACCOUNT_KEY = "sp_mock_account";

export interface MockAccount {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: string;
}

export function loadMockAccount(): MockAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as MockAccount) : null;
  } catch {
    return null;
  }
}

function saveMockAccount(account: MockAccount): void {
  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // ignore quota errors
  }
}

export function clearMockAccount(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCOUNT_KEY);
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
type Step = "welcome" | "creating" | "verifying" | "verified";

interface Props {
  onAuthenticated: (account: MockAccount) => void;
}

export function MockAuthScreen({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [account, setAccount] = useState<MockAccount | null>(null);
  const [progress, setProgress] = useState(0);
  const [verifyCode] = useState(() => Math.floor(100000 + Math.random() * 900000).toString());
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Auto-sign-in if account already exists */
  useEffect(() => {
    const existing = loadMockAccount();
    if (existing) {
      onAuthenticated(existing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startProgress(from: number, to: number, durationMs: number, onComplete?: () => void) {
    if (progressRef.current) clearInterval(progressRef.current);
    const STEPS = 40;
    const interval = durationMs / STEPS;
    const delta = (to - from) / STEPS;
    let current = from;
    progressRef.current = setInterval(() => {
      current = Math.min(current + delta, to);
      setProgress(Math.round(current));
      if (current >= to) {
        clearInterval(progressRef.current!);
        onComplete?.();
      }
    }, interval);
  }

  function handleSignUp() {
    const newAccount = generateAccount();
    setAccount(newAccount);
    saveMockAccount(newAccount);
    setStep("creating");
    setProgress(0);

    startProgress(0, 60, 1000, () => {
      setStep("verifying");
      startProgress(60, 100, 1600, () => {
        setStep("verified");
        setTimeout(() => onAuthenticated(newAccount), 800);
      });
    });
  }

  /* Step index for the Jotform-style step bar */
  const stepIndex = { welcome: 0, creating: 1, verifying: 2, verified: 3 }[step];
  const STEPS_META = ["Account", "Profile", "Verify", "Done"];

  return (
    <div className="auth-root">
      {/* ── Jotform-style full-bleed header strip ── */}
      <div className="auth-header-strip">
        <div className="auth-header-inner">
          <AppIcon />
          <span className="auth-header-title">Schedule Parser</span>
        </div>
      </div>

      {/* ── Form card — Jotform uses a centred, padded card with clear sections ── */}
      <div className="auth-page">
        <div className="auth-form-card">

          {/* Step indicator (Jotform pattern: numbered steps above the form) */}
          {step !== "welcome" && (
            <div className="auth-steps-bar" aria-label="Progress">
              {STEPS_META.map((label, i) => (
                <div key={label} className="auth-step-item">
                  <div className={`auth-step-circle ${i < stepIndex ? "auth-step-circle--done" : i === stepIndex ? "auth-step-circle--active" : ""}`}>
                    {i < stepIndex ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <span className={`auth-step-label ${i === stepIndex ? "auth-step-label--active" : ""}`}>{label}</span>
                  {i < STEPS_META.length - 1 && <span className={`auth-step-connector ${i < stepIndex ? "auth-step-connector--done" : ""}`} />}
                </div>
              ))}
            </div>
          )}

          {/* ── Welcome ── */}
          {step === "welcome" && (
            <div className="auth-body">
              {/* Form header (Jotform always has a clear h1 + subtitle at top of card) */}
              <div className="auth-form-header">
                <AppIcon size={56} />
                <h1 className="auth-form-title">Get Started Free</h1>
                <p className="auth-form-subtitle">
                  Your private schedule hub — paste, parse, and push to Apple Calendar & Reminders.
                </p>
              </div>

              {/* Feature list (Jotform shows benefits before the CTA) */}
              <ul className="auth-feature-list">
                <FeatureRow icon="📅" text="Export events straight to Apple Calendar" />
                <FeatureRow icon="✅" text="Hand off tasks to Reminders in one tap" />
                <FeatureRow icon="🔒" text="Everything stays on your device — no server" />
              </ul>

              {/* Account info field — read-only display, Jotform style (label + value box) */}
              <div className="auth-field-group">
                <label className="auth-field-label">Your account will be</label>
                <div className="auth-field-readonly">
                  <span className="auth-field-readonly-icon">🤖</span>
                  Auto-generated, private &amp; anonymous
                </div>
              </div>

              {/* Primary action */}
              <button type="button" className="auth-submit-btn" onClick={handleSignUp}>
                Create My Account
              </button>

              <p className="auth-helper-text">
                No email or password required. Your data never leaves this device.
              </p>

              {/* Sign-in link (Jotform puts secondary action below the primary) */}
              <div className="auth-secondary-row">
                <span className="auth-secondary-text">Already signed up on this device?</span>
                <button type="button" className="auth-link-btn" onClick={handleSignUp}>
                  Sign In
                </button>
              </div>
            </div>
          )}

          {/* ── Creating ── */}
          {step === "creating" && (
            <div className="auth-body auth-body--center">
              <div className="auth-form-header">
                <h2 className="auth-form-title">Setting up…</h2>
                <p className="auth-form-subtitle">Creating your private profile</p>
              </div>

              <div className="auth-progress-section">
                {/* Jotform-style labelled progress bar */}
                <div className="auth-progress-label-row">
                  <span className="auth-progress-label">Building account</span>
                  <span className="auth-progress-pct">{progress}%</span>
                </div>
                <div className="auth-progress-track">
                  <div className="auth-progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Verifying ── */}
          {step === "verifying" && account && (
            <div className="auth-body">
              <div className="auth-form-header">
                <h2 className="auth-form-title">Verifying Identity</h2>
                <p className="auth-form-subtitle">A one-time code was sent to your account address</p>
              </div>

              {/* Email display field */}
              <div className="auth-field-group">
                <label className="auth-field-label">Account email</label>
                <div className="auth-field-readonly">
                  <span className="auth-field-readonly-icon">✉️</span>
                  {account.email}
                </div>
              </div>

              {/* Verification code (read-only, Jotform style OTP row) */}
              <div className="auth-field-group">
                <label className="auth-field-label">Verification code</label>
                <div className="auth-otp-row">
                  {verifyCode.split("").map((digit, i) => (
                    <div key={i} className="auth-otp-cell">{digit}</div>
                  ))}
                </div>
                <p className="auth-field-hint">Auto-verifying — no action needed</p>
              </div>

              <div className="auth-progress-section">
                <div className="auth-progress-label-row">
                  <span className="auth-progress-label">Verifying</span>
                  <span className="auth-progress-pct">{progress}%</span>
                </div>
                <div className="auth-progress-track">
                  <div className="auth-progress-fill auth-progress-fill--accent2" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Verified ── */}
          {step === "verified" && account && (
            <div className="auth-body auth-body--center">
              <div className="auth-success-icon" aria-hidden="true">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="22" fill="var(--accent)" fillOpacity="0.12" />
                  <circle cx="22" cy="22" r="16" fill="var(--accent)" />
                  <polyline
                    points="14,23 20,29 30,15"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </div>
              <h2 className="auth-form-title">All done!</h2>
              <p className="auth-form-subtitle">Welcome, {account.firstName}. Your account is ready.</p>

              {/* Summary field (Jotform shows a confirmation row) */}
              <div className="auth-field-group" style={{ marginTop: 24 }}>
                <label className="auth-field-label">Signed in as</label>
                <div className="auth-field-readonly">
                  <span className="auth-field-readonly-icon">👤</span>
                  {account.firstName} {account.lastName}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="auth-footer-note">Private · On-device · No tracking</p>
      </div>
    </div>
  );
}

/* ── Small reusable sub-components ── */

function AppIcon({ size = 40 }: { size?: number }) {
  const r = size * 0.27;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ borderRadius: r, flexShrink: 0 }}>
      <rect width="48" height="48" rx={r} fill="var(--accent)" />
      <rect x="10" y="13" width="28" height="22" rx="4" fill="white" fillOpacity="0.2" />
      <rect x="10" y="13" width="28" height="8" rx="4" fill="white" fillOpacity="0.35" />
      <circle cx="17" cy="28" r="2.5" fill="white" fillOpacity="0.85" />
      <circle cx="24" cy="28" r="2.5" fill="white" fillOpacity="0.85" />
      <circle cx="31" cy="28" r="2.5" fill="white" fillOpacity="0.4" />
      <circle cx="17" cy="33" r="2.5" fill="white" fillOpacity="0.5" />
      <circle cx="24" cy="33" r="2.5" fill="white" fillOpacity="0.3" />
    </svg>
  );
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="auth-feature-row">
      <span className="auth-feature-icon" aria-hidden="true">{icon}</span>
      <span className="auth-feature-text">{text}</span>
    </li>
  );
}
