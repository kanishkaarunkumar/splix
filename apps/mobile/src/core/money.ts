import type { Expense } from "./types";
export const MAX_PAISE = 1000000000n;
export function toPaise(value: string, allowZero = false): string {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter rupees with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result > MAX_PAISE || result < (allowZero ? 0n : 1n))
    throw new Error("Enter an amount within the supported range.");
  return result.toString();
}
export function rupees(paise: string): string {
  const n = BigInt(paise),
    abs = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export function money(paise: string): string {
  const [whole, fraction] = rupees(paise).split(".");
  return `₹${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
export function allocate(
  expense: Expense,
): { userId: string; amountPaise: string }[] {
  const total = BigInt(expense.amountPaise);
  if (total <= 0n || total > MAX_PAISE)
    throw new Error("Enter a positive expense amount.");
  const ids = [...expense.participantIds].sort();
  if (!ids.length || new Set(ids).size !== ids.length)
    throw new Error("Select at least one unique participant.");
  if (expense.splitMethod === "exact") {
    const rows = expense.shares || [];
    if (
      rows.length !== ids.length ||
      new Set(rows.map((x) => x.userId)).size !== ids.length ||
      rows.some((x) => !ids.includes(x.userId) || !/^\d+$/.test(x.amountPaise))
    )
      throw new Error("Enter an exact share for each participant.");
    if (rows.reduce((sum, x) => sum + BigInt(x.amountPaise), 0n) !== total)
      throw new Error("Exact shares must add up to the expense.");
    return rows;
  }
  let weights: { userId: string; weight: bigint }[];
  if (expense.splitMethod === "equal")
    weights = ids.map((userId) => ({ userId, weight: 1n }));
  else {
    const rows =
      expense.splitMethod === "percentage"
        ? (expense.percentages || []).map((x) => ({
            userId: x.userId,
            value: x.basisPoints,
          }))
        : (expense.weights || []).map((x) => ({
            userId: x.userId,
            value: x.weight,
          }));
    if (
      rows.length !== ids.length ||
      new Set(rows.map((x) => x.userId)).size !== ids.length ||
      rows.some(
        (x) =>
          !ids.includes(x.userId) ||
          !Number.isSafeInteger(x.value) ||
          x.value < (expense.splitMethod === "percentage" ? 0 : 1),
      )
    )
      throw new Error("Enter valid values for each participant.");
    if (
      expense.splitMethod === "percentage" &&
      rows.reduce((s, x) => s + x.value, 0) !== 10000
    )
      throw new Error("Percentages must add up to 100%.");
    weights = rows.map((x) => ({ userId: x.userId, weight: BigInt(x.value) }));
  }
  const denominator = weights.reduce((s, x) => s + x.weight, 0n);
  const rows = weights.map((x) => ({
    userId: x.userId,
    amount: (total * x.weight) / denominator,
    remainder: (total * x.weight) % denominator,
  }));
  const left = Number(total - rows.reduce((s, x) => s + x.amount, 0n));
  rows.sort((a, b) =>
    a.remainder === b.remainder
      ? a.userId < b.userId
        ? -1
        : 1
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  return rows
    .map((x, i) => ({
      userId: x.userId,
      amountPaise: String(x.amount + (i < left ? 1n : 0n)),
    }))
    .sort((a, b) => (a.userId < b.userId ? -1 : 1));
}
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
