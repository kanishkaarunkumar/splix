import type { CaptureStatus } from "./types";

type CaptureControl = {
  activate(
    account: string,
    group: string,
    durationMs: number,
  ): void | Promise<void>;
  status(account: string): CaptureStatus;
};

/** Do not report success just because the native activation call returned. */
export async function startCaptureSession(
  control: CaptureControl,
  account: string,
  group: string,
  durationMs: number,
): Promise<CaptureStatus> {
  await control.activate(account, group, durationMs);
  const saved = control.status(account);
  if (!saved.granted)
    throw new Error(
      "Notification access is off. Enable it in Android settings and try again.",
    );
  if (
    !saved.available ||
    !saved.consent ||
    saved.paused ||
    saved.groupId !== group ||
    !saved.expiresAt ||
    saved.expiresAt <= Date.now()
  )
    throw new Error(
      "Android did not keep Active mode running. Check notification access and try again.",
    );
  return saved;
}
