import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Session } from "./types";
const key = "splix.mobile.session";
let previewSession: Session | null = null;
export async function readSession(): Promise<Session | null> {
  if (Platform.OS === "web") return previewSession;
  const value = await SecureStore.getItemAsync(key);
  return value ? JSON.parse(value) : null;
}
export async function saveSession(session: Session | null) {
  if (Platform.OS === "web") {
    previewSession = session;
    return;
  }
  if (session)
    await SecureStore.setItemAsync(key, JSON.stringify(session), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  else await SecureStore.deleteItemAsync(key);
}
