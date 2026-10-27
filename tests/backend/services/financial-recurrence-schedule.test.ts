import { describe, expect, it } from "vitest";
import {
  getFinancialRecurrenceDates,
  isProjectionMonth,
} from "@/backend/services/financial-recurrence-schedule";

describe("getFinancialRecurrenceDates", () => {
  it("projects only in the current or a future financial month", () => {
    const now = new Date("2026-10-27T12:00:00.000Z");
    expect(isProjectionMonth("2026-09", now)).toBe(false);
    expect(isProjectionMonth("2026-10", now)).toBe(true);
    expect(isProjectionMonth("2026-11", now)).toBe(true);
  });
  it("rejects invalid dates, frequencies, years, and months", () => {
    expect(
      getFinancialRecurrenceDates("2026-02-30", "MONTHLY", 2026, 1),
    ).toEqual([]);
    expect(getFinancialRecurrenceDates("invalid", "MONTHLY", 2026, 1)).toEqual(
      [],
    );
    expect(
      getFinancialRecurrenceDates("2026-02-10", "UNKNOWN", 2026, 1),
    ).toEqual([]);
    expect(
      getFinancialRecurrenceDates("2026-02-10", "MONTHLY", 1899, 1),
    ).toEqual([]);
    expect(
      getFinancialRecurrenceDates("2026-02-10", "MONTHLY", 9999, 1),
    ).toEqual([]);
    expect(
      getFinancialRecurrenceDates("2026-02-10", "MONTHLY", 2026, -1),
    ).toEqual([]);
    expect(
      getFinancialRecurrenceDates("2026-02-10", "MONTHLY", 2026, 12),
    ).toEqual([]);
  });

  it("keeps monthly cadences anchored to the original due day", () => {
    expect(
      getFinancialRecurrenceDates("2026-01-31", "MONTHLY", 2026, 1),
    ).toEqual(["2026-02-28"]);
    expect(
      getFinancialRecurrenceDates("2026-01-31", "MONTHLY", 2026, 2),
    ).toEqual(["2026-03-31"]);
    expect(
      getFinancialRecurrenceDates("2024-01-31", "MONTHLY", 2024, 1),
    ).toEqual(["2024-02-29"]);
  });

  it("respects each longer monthly interval and excludes dates before the start", () => {
    expect(
      getFinancialRecurrenceDates("2026-01-12", "BIMONTHLY", 2026, 1),
    ).toEqual([]);
    expect(
      getFinancialRecurrenceDates("2026-01-12", "BIMONTHLY", 2026, 2),
    ).toEqual(["2026-03-12"]);
    expect(
      getFinancialRecurrenceDates("2026-01-12", "QUARTERLY", 2026, 3),
    ).toEqual(["2026-04-12"]);
    expect(
      getFinancialRecurrenceDates("2026-01-12", "SEMIANNUALLY", 2026, 6),
    ).toEqual(["2026-07-12"]);
    expect(
      getFinancialRecurrenceDates("2026-01-12", "YEARLY", 2027, 0),
    ).toEqual(["2027-01-12"]);
    expect(
      getFinancialRecurrenceDates("2026-03-12", "MONTHLY", 2026, 1),
    ).toEqual([]);
  });

  it("generates weekly and biweekly dates without duplicates", () => {
    expect(
      getFinancialRecurrenceDates("2026-10-01", "WEEKLY", 2026, 9),
    ).toEqual([
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
    ]);
    expect(
      getFinancialRecurrenceDates("2026-10-02", "BIWEEKLY", 2026, 9),
    ).toEqual(["2026-10-02", "2026-10-16", "2026-10-30"]);
    expect(
      getFinancialRecurrenceDates("2026-10-31", "WEEKLY", 2026, 9),
    ).toEqual(["2026-10-31"]);
  });
});
