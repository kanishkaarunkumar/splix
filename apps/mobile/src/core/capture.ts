import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type { CaptureDraft, CaptureStatus, LocalState } from "./types";
export type CaptureModule = {
  setAccount(accountId: string | null): void;
  status(accountId: string): CaptureStatus;
  openPromptSettings(accountId: string): void;
  consent(accountId: string, sources: string[]): void;
  activate(accountId: string, groupId: string, durationMs: number): void;
  pause(accountId: string): void;
  stop(accountId: string): void;
  drafts(accountId: string): CaptureDraft[];
  disposition(
    accountId: string,
    id: string,
    state: "personal" | "dismissed" | "needs_review",
  ): void;
  readState(accountId: string): string | null;
  writeState(accountId: string, state: string): void;
  enqueue(accountId: string, mutation: string): void;
  deleteLocal(accountId: string): void;
};
export const nativeCapture =
  Platform.OS === "android"
    ? requireOptionalNativeModule<CaptureModule>("SplixCapture")
    : null;
export const captureSources = [
  { id: "com.phonepe.app", name: "PhonePe" },
  { id: "net.one97.paytm", name: "Paytm" },
  { id: "com.google.android.apps.nbu.paisa.user", name: "Google Pay" },
];
export function captureStatus(accountId: string): CaptureStatus {
  return (
    nativeCapture?.status(accountId) || {
      available: false,
      granted: false,
      consent: false,
      paused: true,
    }
  );
}
export function readNative(accountId: string): LocalState | undefined {
  const value = nativeCapture?.readState(accountId);
  return value ? JSON.parse(value) : undefined;
}
