// The Capacitor (native iOS shell) build uses `output: "export"`, which cannot include the
// Next.js API route handlers used by the Web Push backend (those require a server runtime).
// This script temporarily moves `src/app/api` aside, runs the static export build, then
// restores it — regardless of build success or failure — so the working tree is never left
// modified.
import { existsSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const apiDir = path.join(process.cwd(), "src", "app", "api");
const apiDirBackup = path.join(process.cwd(), "src", "app", "_api-disabled-for-capacitor");

const movedApiDir = existsSync(apiDir);
if (movedApiDir) {
  renameSync(apiDir, apiDirBackup);
}

let exitCode = 0;
try {
  const result = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: { ...process.env, CAPACITOR_BUILD: "1" },
    shell: process.platform === "win32",
  });
  exitCode = result.status ?? 1;
} finally {
  if (movedApiDir) {
    renameSync(apiDirBackup, apiDir);
  }
}

process.exit(exitCode);
