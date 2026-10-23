import { describe, expect, test } from "vitest";
import { allocate, money, rupees, toPaise } from "./money";
import type { Expense } from "./types";
const base: Expense = {
  title: "Test",
  amountPaise: "10000",
  payerId: "c",
  effectiveDate: "2026-01-01",
  category: "Food",
  splitMethod: "equal",
  participantIds: ["c", "a", "b"],
};
describe("integer money and deterministic allocation", () => {
  test("rupees are parsed exactly without floating point rounding", () => {
    expect(toPaise("100.01")).toBe("10001");
    expect(toPaise("0.09")).toBe("9");
    expect(rupees("-9")).toBe("-0.09");
    expect(money("-125050")).toBe("₹-1,250.50");
    for (const value of ["1.005", "-5", "1e3", "0", "10000000.01", "NaN"])
      expect(() => toPaise(value)).toThrow();
  });
  test("tie breaks by user ID, independent of input order", () => {
    expect(allocate(base)).toEqual([
      { userId: "a", amountPaise: "3334" },
      { userId: "b", amountPaise: "3333" },
      { userId: "c", amountPaise: "3333" },
    ]);
    expect(allocate({ ...base, participantIds: ["b", "c", "a"] })).toEqual(
      allocate(base),
    );
  });
  test("percentage and weighted splits conserve paise across small remainders", () => {
    for (let amount = 1; amount <= 300; amount++) {
      for (const method of ["weighted", "percentage"] as const) {
        const shares = allocate({
          ...base,
          amountPaise: String(amount),
          splitMethod: method,
          weights: [
            { userId: "a", weight: 1 },
            { userId: "b", weight: 2 },
            { userId: "c", weight: 3 },
          ],
          percentages: [
            { userId: "a", basisPoints: 3333 },
            { userId: "b", basisPoints: 3333 },
            { userId: "c", basisPoints: 3334 },
          ],
        });
        expect(
          shares.reduce((sum, row) => sum + BigInt(row.amountPaise), 0n),
        ).toBe(BigInt(amount));
      }
    }
  });
  test("rejects mismatched exact totals, duplicate IDs, partial percentages and fractional weights", () => {
    expect(() => allocate({ ...base, participantIds: ["a", "a"] })).toThrow();
    expect(() =>
      allocate({
        ...base,
        splitMethod: "exact",
        shares: [{ userId: "a", amountPaise: "1" }],
      }),
    ).toThrow();
    expect(() =>
      allocate({
        ...base,
        splitMethod: "percentage",
        percentages: [{ userId: "a", basisPoints: 9000 }],
      }),
    ).toThrow();
    expect(() =>
      allocate({
        ...base,
        splitMethod: "weighted",
        weights: [
          { userId: "a", weight: 1.2 },
          { userId: "b", weight: 1 },
          { userId: "c", weight: 1 },
        ],
      }),
    ).toThrow();
  });
});
