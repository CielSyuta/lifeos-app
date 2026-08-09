"use client";

import { useEffect, useState } from "react";

interface LoadingScreenProps {
  onDone?: () => void;
}

export function LoadingScreen({ onDone }: LoadingScreenProps) {
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");

  useEffect(() => {
    // Brief enter phase, then show for a moment, then exit
    const enterTimer = setTimeout(() => setPhase("visible"), 100);
    const exitTimer = setTimeout(() => setPhase("exit"), 1600);
    const doneTimer = setTimeout(() => onDone?.(), 2000);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div className={`loading-screen ${phase}`} aria-label="Loading" role="status">
      {/* Ambient gradient orbs — iOS 26 "liquid" background */}
      <div className="loading-orb loading-orb-1" />
      <div className="loading-orb loading-orb-2" />
      <div className="loading-orb loading-orb-3" />

      {/* Frosted glass card */}
      <div className="loading-card">
        {/* App icon */}
        <div className="loading-icon-wrap">
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect width="64" height="64" rx="16" fill="url(#iconGrad)" />
            <defs>
              <linearGradient id="iconGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
            {/* Calendar grid icon */}
            <rect x="14" y="18" width="36" height="30" rx="5" fill="white" fillOpacity="0.18" />
            <rect x="14" y="18" width="36" height="10" rx="5" fill="white" fillOpacity="0.35" />
            <rect x="14" y="26" width="36" height="2" fill="white" fillOpacity="0.2" />
            <circle cx="23" cy="37" r="3" fill="white" fillOpacity="0.8" />
            <circle cx="32" cy="37" r="3" fill="white" fillOpacity="0.8" />
            <circle cx="41" cy="37" r="3" fill="white" fillOpacity="0.4" />
            <circle cx="23" cy="44" r="3" fill="white" fillOpacity="0.5" />
            <circle cx="32" cy="44" r="3" fill="white" fillOpacity="0.3" />
          </svg>
        </div>

        {/* App name */}
        <p className="loading-title">Schedule Parser</p>

        {/* Progress pill */}
        <div className="loading-pill-track">
          <div className="loading-pill-fill" />
        </div>
      </div>
    </div>
  );
}
