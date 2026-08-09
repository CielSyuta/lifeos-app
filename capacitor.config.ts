import type { CapacitorConfig } from "@capacitor/cli";

type LifeOSCapacitorConfig = CapacitorConfig & {
  bundledWebRuntime: boolean;
};

const config: LifeOSCapacitorConfig = {
  appId: "com.cielsyuta.lifeos",
  appName: "LifeOS",
  webDir: "out",
  bundledWebRuntime: false,
  server: {
    allowNavigation: [],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      showSpinner: false,
    },
  },
};

export default config;
