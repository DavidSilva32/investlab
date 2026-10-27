import { describe, expect, it } from "vitest";
import { getRecurringExpenseOccurrenceDates } from "@/backend/services/recurring-expense-schedule";

describe("getRecurringExpenseOccurrenceDates", () => {
  it("rejects invalid dates, frequencies, years, and months", () => {
    expect(
      getRecurringExpenseOccurrenceDates("2026-02-30", "MONTHLY", 2026, 1),
    ).toEqual([]);
    expect(
      getRecurringExpenseOccurrenceDates("invalid", "MONTHLY", 2026, 1),
    ).toEqual([]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-02-10", "UNKNOWN", 2026, 1),
    ).toEqual([]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-02-10", "MONTHLY", 1899, 1),
    ).toEqual([]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-02-10", "MONTHLY", 9999, 1),
    ).toEqual([]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-02-10", "MONTHLY", 2026, -1),
    ).toEqual([]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-02-10", "MONTHLY", 2026, 12),
    ).toEqual([]);
  });

  it("keeps monthly cadences anchored to the original due day", () => {
    expect(
      getRecurringExpenseOccurrenceDates("2026-01-31", "MONTHLY", 2026, 1),
    ).toEqual(["2026-02-28"]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-01-31", "MONTHLY", 2026, 2),
    ).toEqual(["2026-03-31"]);
    expect(
      getRecurringExpenseOccurrenceDates("2024-01-31", "MONTHLY", 2024, 1),
    ).toEqual(["2024-02-29"]);
  });

  it("respects each longer monthly interval and excludes dates before the start", () => {
    expect(
      getRecurringExpenseOccurrenceDates("2026-01-12", "BIMONTHLY", 2026, 1),
    ).toEqual([]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-01-12", "BIMONTHLY", 2026, 2),
    ).toEqual(["2026-03-12"]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-01-12", "QUARTERLY", 2026, 3),
    ).toEqual(["2026-04-12"]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-01-12", "SEMIANNUALLY", 2026, 6),
    ).toEqual(["2026-07-12"]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-01-12", "YEARLY", 2027, 0),
    ).toEqual(["2027-01-12"]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-03-12", "MONTHLY", 2026, 1),
    ).toEqual([]);
  });

  it("generates weekly and biweekly dates without duplicates", () => {
    expect(
      getRecurringExpenseOccurrenceDates("2026-10-01", "WEEKLY", 2026, 9),
    ).toEqual([
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
    ]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-10-02", "BIWEEKLY", 2026, 9),
    ).toEqual(["2026-10-02", "2026-10-16", "2026-10-30"]);
    expect(
      getRecurringExpenseOccurrenceDates("2026-10-31", "WEEKLY", 2026, 9),
    ).toEqual(["2026-10-31"]);
  });
});
