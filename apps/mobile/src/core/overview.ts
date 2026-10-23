import type { Balance, Group, GroupSnapshot } from "./types";

export type SuggestedTransfer = {
  fromUserId: string;
  toUserId: string;
  amountPaise: string;
};
export type PersonBalance = {
  userId: string;
  name: string;
  owePaise: string;
  receivePaise: string;
  groups: {
    groupId: string;
    groupName: string;
    direction: "owe" | "receive";
    amountPaise: string;
  }[];
};
export type Overview = {
  owePaise: string;
  receivePaise: string;
  people: PersonBalance[];
  loadedGroups: number;
  totalGroups: number;
  oldestUpdate?: number;
};

/** A read-only payment plan, matching the server's largest-debt/credit ordering. */
export function suggestedTransfers(balances: Balance[]): SuggestedTransfer[] {
  if (new Set(balances.map((row) => row.userId)).size !== balances.length)
    throw new Error("Duplicate balance member.");
  const rows = balances.map((row) => ({
    id: row.userId,
    amount: BigInt(row.balancePaise),
  }));
  if (rows.reduce((sum, row) => sum + row.amount, 0n) !== 0n)
    throw new Error("Group balances do not reconcile.");
  const debtors = rows
    .filter((row) => row.amount < 0n)
    .map((row) => ({ ...row, amount: -row.amount }));
  const creditors = rows
    .filter((row) => row.amount > 0n)
    .map((row) => ({ ...row }));
  const order = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    a.amount === b.amount
      ? a.id < b.id
        ? -1
        : 1
      : a.amount > b.amount
        ? -1
        : 1;
  debtors.sort(order);
  creditors.sort(order);
  const result: SuggestedTransfer[] = [];
  let debtor = 0,
    creditor = 0;
  while (debtor < debtors.length && creditor < creditors.length) {
    const from = debtors[debtor],
      to = creditors[creditor];
    const amount = from.amount < to.amount ? from.amount : to.amount;
    result.push({
      fromUserId: from.id,
      toUserId: to.id,
      amountPaise: String(amount),
    });
    from.amount -= amount;
    to.amount -= amount;
    if (from.amount === 0n) debtor++;
    if (to.amount === 0n) creditor++;
  }
  return result;
}

export function overview(
  groups: Group[],
  snapshots: Record<string, GroupSnapshot>,
  userId: string,
): Overview {
  let owe = 0n,
    receive = 0n,
    loadedGroups = 0,
    oldestUpdate: number | undefined;
  const people = new Map<string, PersonBalance>();
  for (const group of groups) {
    const snapshot = snapshots[group.id];
    if (!snapshot || !group.members.some((member) => member.id === userId))
      continue;
    const own = snapshot.balances.find((row) => row.userId === userId);
    if (!own) continue;
    let transfers: SuggestedTransfer[];
    try {
      transfers = suggestedTransfers(snapshot.balances);
    } catch {
      continue;
    }
    loadedGroups++;
    oldestUpdate = Math.min(
      oldestUpdate ?? snapshot.fetchedAt,
      snapshot.fetchedAt,
    );
    const amount = BigInt(own.balancePaise);
    if (amount < 0n) owe -= amount;
    else receive += amount;
    for (const transfer of transfers) {
      if (transfer.fromUserId !== userId && transfer.toUserId !== userId)
        continue;
      const direction = transfer.fromUserId === userId ? "owe" : "receive";
      const otherId =
        direction === "owe" ? transfer.toUserId : transfer.fromUserId;
      const person = people.get(otherId) || {
        userId: otherId,
        name:
          group.members.find((member) => member.id === otherId)?.displayName ||
          "Member",
        owePaise: "0",
        receivePaise: "0",
        groups: [],
      };
      if (direction === "owe")
        person.owePaise = String(
          BigInt(person.owePaise) + BigInt(transfer.amountPaise),
        );
      else
        person.receivePaise = String(
          BigInt(person.receivePaise) + BigInt(transfer.amountPaise),
        );
      person.groups.push({
        groupId: group.id,
        groupName: group.name,
        direction,
        amountPaise: transfer.amountPaise,
      });
      people.set(otherId, person);
    }
  }
  return {
    owePaise: String(owe),
    receivePaise: String(receive),
    people: [...people.values()].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId),
    ),
    loadedGroups,
    totalGroups: groups.length,
    oldestUpdate,
  };
}
