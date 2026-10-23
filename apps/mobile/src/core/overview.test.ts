import { expect, test } from "vitest";
import { overview, suggestedTransfers } from "./overview";
import type { Group, GroupSnapshot } from "./types";
const members = [
  { id: "a", displayName: "Alex", email: "a@test.invalid" },
  { id: "b", displayName: "Sam", email: "b@test.invalid" },
];
const group = (id: string): Group => ({
  id,
  name: id,
  ownerId: "a",
  members,
  version: 1,
  archived: false,
});
const snapshot = (id: string, own: string): GroupSnapshot => ({
  group: group(id),
  balances: [
    { userId: "a", balancePaise: own },
    { userId: "b", balancePaise: String(-BigInt(own)) },
  ],
  history: [],
  fetchedAt: 100,
});
test("one person is combined across groups using integer paise", () => {
  const result = overview(
    [group("trip"), group("flat")],
    { trip: snapshot("trip", "-10001"), flat: snapshot("flat", "-5000") },
    "a",
  );
  expect(result.owePaise).toBe("15001");
  expect(result.people).toHaveLength(1);
  expect(result.people[0].owePaise).toBe("15001");
  expect(result.people[0].groups.map((row) => row.groupId)).toEqual([
    "trip",
    "flat",
  ]);
});
test("opposite debts stay separate instead of silently netting different groups", () => {
  const result = overview(
    [group("trip"), group("flat")],
    { trip: snapshot("trip", "-10000"), flat: snapshot("flat", "3000") },
    "a",
  );
  expect(result.owePaise).toBe("10000");
  expect(result.receivePaise).toBe("3000");
  expect(result.people[0].owePaise).toBe("10000");
  expect(result.people[0].receivePaise).toBe("3000");
});
test("missing and unreconciled snapshots are visibly incomplete", () => {
  const invalid = snapshot("flat", "-5000");
  invalid.balances[1].balancePaise = "4000";
  const result = overview(
    [group("trip"), group("flat"), group("missing")],
    { trip: snapshot("trip", "0"), flat: invalid },
    "a",
  );
  expect(result.loadedGroups).toBe(1);
  expect(result.totalGroups).toBe(3);
  expect(result.people).toEqual([]);
});
test("payment plan conserves group debt and is independent of balance order", () => {
  const balances = [
    { userId: "b", balancePaise: "-7000" },
    { userId: "c", balancePaise: "-3000" },
    { userId: "a", balancePaise: "10000" },
  ];
  const result = suggestedTransfers(balances);
  expect(result).toEqual([
    { fromUserId: "b", toUserId: "a", amountPaise: "7000" },
    { fromUserId: "c", toUserId: "a", amountPaise: "3000" },
  ]);
  expect(suggestedTransfers([...balances].reverse())).toEqual(result);
});
