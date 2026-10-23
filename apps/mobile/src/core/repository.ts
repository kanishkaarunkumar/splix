import { Platform } from "react-native";
import { nativeCapture } from "./capture";
import { emptyLocal, type LocalState } from "./types";
import type { Repository } from "./queue";
// Browser preview uses IndexedDB; credentials stay in memory. Android uses the listener's SQLite writer.
let database: Promise<IDBDatabase> | undefined;
function db() {
  database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("splix-private-preview", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("accounts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
async function webTransaction<T>(
  accountId: string,
  change?: (state: LocalState) => LocalState,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      "accounts",
      change ? "readwrite" : "readonly",
    );
    const store = transaction.objectStore("accounts"),
      request = store.get(accountId);
    let result: LocalState;
    request.onsuccess = () => {
      try {
        result = request.result || emptyLocal();
        if (change) {
          result = change(result);
          store.put(result, accountId);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => resolve(result as T);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("Local transaction was aborted."));
  });
}
export const repository: Repository & {
  delete(accountId: string): Promise<void>;
} = {
  async read(accountId) {
    if (nativeCapture)
      return JSON.parse(
        nativeCapture.readState(accountId) || JSON.stringify(emptyLocal()),
      );
    if (Platform.OS === "web") return webTransaction<LocalState>(accountId);
    throw new Error(
      "Install the Splix Android development build to use private local storage.",
    );
  },
  async write(accountId, state) {
    if (nativeCapture) {
      nativeCapture.writeState(accountId, JSON.stringify(state));
      return;
    }
    await webTransaction(accountId, () => state);
  },
  async update(accountId, change) {
    if (nativeCapture) {
      const state = JSON.parse(
        nativeCapture.readState(accountId) || JSON.stringify(emptyLocal()),
      );
      change(state);
      nativeCapture.writeState(accountId, JSON.stringify(state));
      return;
    }
    await webTransaction(accountId, (state) => {
      change(state);
      return state;
    });
  },
  async enqueue(accountId, mutation) {
    if (accountId !== mutation.accountId)
      throw new Error("Account changed. Sign in again before confirming.");
    if (nativeCapture) {
      nativeCapture.enqueue(accountId, JSON.stringify(mutation));
      return;
    }
    await webTransaction(accountId, (state) => {
      if (
        mutation.draftId &&
        state.queue.some((x) => x.draftId === mutation.draftId)
      )
        throw new Error("This suggestion has already been confirmed.");
      if (!state.queue.some((x) => x.id === mutation.id))
        state.queue.push(mutation);
      return state;
    });
  },
  async delete(accountId) {
    if (nativeCapture) {
      nativeCapture.deleteLocal(accountId);
      return;
    }
    const database = await db();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("accounts", "readwrite");
      transaction.objectStore("accounts").delete(accountId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },
};
