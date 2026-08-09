import type { NextConfig } from "next";

// The Capacitor iOS shell needs a static `/out` bundle (output: "export"), but the
// Web Push backend (API routes + Vercel Cron) requires a server runtime. Set
// CAPACITOR_BUILD=1 for the native build (`npm run build:capacitor`); the default
// `npm run build` produces a normal server build suitable for hosting on Vercel.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild ? { output: "export" as const } : {}),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
