import { expect, test, vi } from "vitest";
import { startCaptureSession, startPaymentReminders } from "./capture-session";
import type { CaptureStatus } from "./types";

const active = (): CaptureStatus => ({
  available: true,
  granted: true,
  consent: true,
  paused: false,
  groupId: "trip",
  expiresAt: Date.now() + 60000,
});

test("reminders need no group or expiry and verify that prompts and access are enabled", async () => {
  const status = (): CaptureStatus => ({
    available: true,
    granted: true,
    consent: true,
    paused: false,
    promptsEnabled: true,
    remindersEnabled: true,
  });
  expect(
    (await startPaymentReminders({ startReminders() {}, status }, "alex"))
      .remindersEnabled,
  ).toBe(true);
  await expect(
    startPaymentReminders(
      {
        startReminders() {},
        status: () => ({ ...status(), promptsEnabled: false }),
      },
      "alex",
    ),
  ).rejects.toThrow("did not start");
  await expect(
    startPaymentReminders(
      { startReminders() {}, status: () => ({ ...status(), paused: true }) },
      "alex",
    ),
  ).rejects.toThrow("did not start");
});

test("activation awaits the native write and reads back the active group", async () => {
  let saved: CaptureStatus = { ...active(), paused: true };
  const activate = vi.fn(async () => {
    await Promise.resolve();
    saved = active();
  });
  const result = await startCaptureSession(
    { activate, status: () => saved },
    "alex",
    "trip",
    1800000,
  );
  expect(activate).toHaveBeenCalledWith("alex", "trip", 1800000);
  expect(result.paused).toBe(false);
});

test.each([
  { paused: true },
  { groupId: "other" },
  { expiresAt: 1 },
  { consent: false },
])(
  "silent or stale activation is reported as a failure: %j",
  async (change) => {
    await expect(
      startCaptureSession(
        { activate() {}, status: () => ({ ...active(), ...change }) },
        "alex",
        "trip",
        1800000,
      ),
    ).rejects.toThrow("did not keep Active mode running");
  },
);

test("revoked notification access and native exceptions surface to the user", async () => {
  await expect(
    startCaptureSession(
      { activate() {}, status: () => ({ ...active(), granted: false }) },
      "alex",
      "trip",
      1800000,
    ),
  ).rejects.toThrow("Notification access is off");
  await expect(
    startCaptureSession(
      {
        activate() {
          throw new Error("Consent missing");
        },
        status: active,
      },
      "alex",
      "trip",
      1800000,
    ),
  ).rejects.toThrow("Consent missing");
});
