"use client";

import { useState } from "react";

interface Props {
  onDone: () => void;
}

type Step = 0 | 1 | 2 | 3;

const STEPS = [
  {
    icon: "📋",
    title: "Paste Your Schedule",
    body: "Copy any schedule text — shift rosters, appointment lists, or structured blocks — and paste it into LifeOS.",
  },
  {
    icon: "⚡️",
    title: "Parse Into Events & Tasks",
    body: "LifeOS reads your schedule and creates structured events and reminders you can review, edit, and correct before adding anything.",
  },
  {
    icon: "📅",
    title: "Add to Calendar & Reminders",
    body: "Tap Add on any item to save it directly to Apple Calendar or Apple Reminders. Each item is added individually — nothing is created without your review.",
  },
  {
    icon: "🔒",
    title: "Private by Default",
    body: "Your schedule text and parsed items are stored only on this device. Calendar and Reminders access is requested only when you choose to add an item.",
  },
];

export function OnboardingScreen({ onDone }: Props) {
  const [step, setStep] = useState<Step>(0);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step]!;

  function advance() {
    if (isLast) {
      onDone();
    } else {
      setStep((s) => (s + 1) as Step);
    }
  }

  return (
    <div className="onboarding-root" role="dialog" aria-modal="true" aria-label="Welcome to LifeOS">
      <div className="onboarding-card">
        {/* Step dots */}
        <div className="onboarding-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`} role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          {STEPS.map((_, i) => (
            <span key={i} className={`onboarding-dot${i === step ? " onboarding-dot--active" : ""}`} />
          ))}
        </div>

        {/* Content */}
        <div className="onboarding-content" key={step} aria-live="polite">
          <span className="onboarding-icon" aria-hidden="true">{current.icon}</span>
          <h1 className="onboarding-title">{current.title}</h1>
          <p className="onboarding-body">{current.body}</p>
        </div>

        {/* Navigation */}
        <div className="onboarding-actions">
          <button
            type="button"
            className="onboarding-primary-btn"
            onClick={advance}
            aria-label={isLast ? "Get started with LifeOS" : `Next: ${STEPS[step + 1]?.title ?? ""}`}
          >
            {isLast ? "Get Started" : "Next"}
          </button>
          {!isLast && (
            <button
              type="button"
              className="onboarding-skip-btn"
              onClick={onDone}
              aria-label="Skip onboarding"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
