import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

import { isNative } from "./environment";

export async function hapticSuccess(): Promise<void> {
  if (!isNative()) {
    return;
  }

  await Haptics.notification({ type: NotificationType.Success });
}

export async function hapticError(): Promise<void> {
  if (!isNative()) {
    return;
  }

  await Haptics.notification({ type: NotificationType.Error });
}

export async function hapticLight(): Promise<void> {
  if (!isNative()) {
    return;
  }

  await Haptics.impact({ style: ImpactStyle.Light });
}
