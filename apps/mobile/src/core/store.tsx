import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import { randomUUID } from "expo-crypto";
import { clearNavigationPayloads } from "../navigation";
import { Api, ApiError } from "./api";
import { nativeCapture } from "./capture";
import { readSession, saveSession } from "./credentials";
import { repository } from "./repository";
import { Queue } from "./queue";
import {
  emptyLocal,
  type Session,
  type Group,
  type LocalState,
  type Mutation,
  type Balance,
  type FinancialEvent,
} from "./types";

type Store = {
  api: Api | null;
  configError: string;
  ready: boolean;
  session: Session | null;
  groups: Group[];
  local: LocalState;
  offline: boolean;
  message: string;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshGroup: (groupId: string) => Promise<void>;
  confirm: (
    mutation: Omit<Mutation, "id" | "accountId" | "createdAt" | "state">,
  ) => Promise<void>;
  flush: () => Promise<void>;
  reloadLocal: () => Promise<void>;
  updateLocal: (change: (state: LocalState) => void) => Promise<void>;
};
const Context = createContext<Store>(null!);
export function useStore() {
  return useContext(Context);
}
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    sessionRef = useRef<Session | null>(null);
  const [ready, setReady] = useState(false),
    [groups, setGroups] = useState<Group[]>([]),
    [local, setLocal] = useState<LocalState>(emptyLocal),
    [offline, setOffline] = useState(false),
    [message, setMessage] = useState("");
  const queue = useRef<Queue | null>(null);
  const observedPosts = useRef(new Set<string>());
  const [client] = useState(() => {
    try {
      return { api: new Api(process.env.EXPO_PUBLIC_API_URL || ""), error: "" };
    } catch (error) {
      return { api: null, error: (error as Error).message };
    }
  });
  const api = client.api;
  const reloadLocal = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const data = await repository.read(current.id);
    if (sessionRef.current?.id === current.id) setLocal(data);
  }, []);
  const signOut = useCallback(async () => {
    const old = sessionRef.current;
    queue.current?.stop();
    queue.current = null;
    clearNavigationPayloads();
    const revoke =
      old && api
        ? api.request("/api/v1/auth/logout", { method: "POST" }).catch(() => {})
        : Promise.resolve();
    // Capture and credentials are stopped even if the server cannot be reached.
    nativeCapture?.setAccount(null);
    api?.setToken(undefined);
    sessionRef.current = null;
    setSession(null);
    setGroups([]);
    setLocal(emptyLocal());
    await saveSession(null);
    await revoke;
  }, [api]);
  const expire = useCallback(() => {
    setMessage(
      "Your session expired. Sign in again to resume your saved queue.",
    );
    void signOut();
  }, [signOut]);
  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || !api) return;
    try {
      const result = await api.request<Group[]>("/api/v1/groups");
      if (sessionRef.current?.id !== current.id) return;
      setGroups(result);
      // Fetch at most four group balances at once; the home overview works before opening a group.
      const fetched: {
        group: Group;
        balances: Balance[];
        fetchedAt: number;
      }[] = [];
      for (let index = 0; index < result.length; index += 4) {
        const batch = await Promise.all(
          result.slice(index, index + 4).map(async (group) => ({
            group,
            balances: await api.request<Balance[]>(
              `/api/v1/groups/${group.id}/balances`,
            ),
            fetchedAt: Date.now(),
          })),
        );
        fetched.push(...batch);
      }
      if (sessionRef.current?.id !== current.id) return;
      await repository.update(current.id, (state) => {
        for (const value of fetched)
          state.snapshots[value.group.id] = {
            ...value,
            history: state.snapshots[value.group.id]?.history || [],
          };
      });
      await reloadLocal();
      setOffline(false);
      setMessage("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        expire();
        return;
      }
      setOffline(true);
      setMessage(
        "You’re offline. Saved groups are available; confirmed writes will wait on this device.",
      );
    }
  }, [api, expire, reloadLocal]);
  const refreshGroup = useCallback(
    async (groupId: string) => {
      const current = sessionRef.current;
      if (!current || !api) return;
      try {
        const [allGroups, balances, history] = await Promise.all([
          api.request<Group[]>("/api/v1/groups"),
          api.request<Balance[]>(`/api/v1/groups/${groupId}/balances`),
          api.request<{ items: FinancialEvent[] }>(
            `/api/v1/groups/${groupId}/history?limit=25`,
          ),
        ]);
        if (sessionRef.current?.id !== current.id) return;
        const group = allGroups.find((g) => g.id === groupId);
        if (!group) throw new Error("Group is no longer available.");
        await repository.update(current.id, (state) => {
          state.snapshots[groupId] = {
            group,
            balances,
            history: history.items,
            fetchedAt: Date.now(),
          };
        });
        setGroups(allGroups);
        setOffline(false);
        await reloadLocal();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) expire();
        else if (!(error instanceof ApiError)) setOffline(true);
        else throw error;
      }
    },
    [api, reloadLocal, expire],
  );
  const signIn = useCallback(
    async (value: Session) => {
      queue.current?.stop();
      await saveSession(value);
      nativeCapture?.setAccount(value.id);
      api?.setToken(value.sessionToken);
      sessionRef.current = value;
      setSession(value);
      const data = await repository.read(value.id);
      setLocal(data);
      setGroups(Object.values(data.snapshots).map((x) => x.group));
      queue.current = new Queue(
        value.id,
        repository,
        (mutation) => {
          if (sessionRef.current?.id !== value.id || !api)
            throw new Error("Account changed.");
          return api.request(mutation.path, {
            method: "POST",
            body: mutation.body,
            key: mutation.id,
          });
        },
        () => {
          void reloadLocal();
        },
        expire,
      );
    },
    [api, reloadLocal, expire],
  );
  useEffect(() => {
    let mounted = true;
    readSession()
      .then(async (saved) => {
        if (mounted && saved) await signIn(saved);
      })
      .catch((error) => setMessage(error.message))
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [signIn]);
  useEffect(() => {
    if (!session?.id) return;
    void Promise.resolve().then(refresh);
    void queue.current?.flush();
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void queue.current?.flush();
    }, 20000);
    const focus = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
        void queue.current?.flush();
      }
    });
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void queue.current?.flush();
      }
    });
    return () => {
      clearInterval(interval);
      focus.remove();
      network.remove();
    };
  }, [session, refresh]);
  useEffect(() => {
    for (const row of local.queue) {
      if (row.state === "posted" && !observedPosts.current.has(row.id)) {
        observedPosts.current.add(row.id);
        void refreshGroup(row.groupId).catch((error) =>
          setMessage(error.message),
        );
      }
    }
  }, [local.queue, refreshGroup]);
  async function updateLocal(change: (state: LocalState) => void) {
    const id = sessionRef.current?.id;
    if (!id) return;
    await repository.update(id, change);
    await reloadLocal();
  }
  async function confirm(
    mutation: Omit<Mutation, "id" | "accountId" | "createdAt" | "state">,
  ) {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in before confirming.");
    await repository.enqueue(current.id, {
      ...mutation,
      id: randomUUID(),
      accountId: current.id,
      createdAt: Date.now(),
      state: "pending",
    });
    await reloadLocal();
    void queue.current?.flush();
  }
  const flush = async () => {
    await queue.current?.flush();
    await reloadLocal();
    await refresh();
  };
  return (
    <Context.Provider
      value={{
        api,
        configError: client.error,
        ready,
        session,
        groups,
        local,
        offline,
        message,
        signIn,
        signOut,
        refresh,
        refreshGroup,
        confirm,
        flush,
        reloadLocal,
        updateLocal,
      }}
    >
      {children}
    </Context.Provider>
  );
}
