import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { Expense, FinancialEvent } from "./core/types";
export type Routes = {
  Home: { tab?: "groups" | "overview" } | undefined;
  Group: { groupId: string };
  Expense: {
    groupId: string;
    draftId?: string;
    correction?: FinancialEvent;
    initial?: Expense;
  };
  Settlement: {
    groupId: string;
    draftId?: string;
    fromUserId?: string;
    toUserId?: string;
    amountPaise?: string;
  };
  Capture: undefined;
  Inbox: { draftId?: string } | undefined;
  Queue: undefined;
  Report: { groupId: string };
  Members: { groupId: string };
  Closeout: { groupId: string };
  Profile: undefined;
};
// Financial objects never enter URLs. Internal form/correction seeds are ephemeral capabilities.
const payloads = new Map<string, Record<string, unknown>>();
export function clearNavigationPayloads() {
  payloads.clear();
}
function href<T extends keyof Routes>(name: T, params?: Routes[T]): Href {
  const strings: Record<string, string> = {},
    privateValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (typeof value === "string") strings[key] = value;
    else if (value !== undefined) privateValues[key] = value;
  }
  if (Object.keys(privateValues).length) {
    const id = randomUUID();
    payloads.set(id, privateValues);
    strings.navigationKey = id;
  }
  return { pathname: `/${name}`, params: strings } as Href;
}
type Navigation = {
  navigate<T extends keyof Routes>(name: T, params?: Routes[T]): void;
  popTo<T extends keyof Routes>(name: T, params?: Routes[T]): void;
};
export type ScreenProps<T extends keyof Routes> = {
  route: { params: Routes[T] };
  navigation: Navigation;
};
export function useScreen<T extends keyof Routes>(): ScreenProps<T> {
  const router = useRouter(),
    input = useLocalSearchParams();
  const strings = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const privateValues = payloads.get(strings.navigationKey || "") || {};
  return {
    route: { params: { ...strings, ...privateValues } as Routes[T] },
    navigation: {
      navigate: (name, params) => router.navigate(href(name, params)),
      popTo: (name, params) => router.dismissTo(href(name, params)),
    },
  };
}
