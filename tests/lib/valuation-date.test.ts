import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isFutureValuationDate,
  isValidValuationDate,
  todayInSaoPaulo,
} from "@/lib/valuation-date";

describe("valuation dates", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the Sao Paulo calendar date across the UTC day boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T01:00:00.000Z"));

    expect(todayInSaoPaulo()).toBe("2026-09-30");
  });

  it.each(["2026-02-29", "2026-13-01", "2026/09/30", ""])(
    "rejects invalid date %s",
    (value) => expect(isValidValuationDate(value)).toBe(false),
  );

  it("accepts a calendar date and rejects dates after today in Sao Paulo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T01:00:00.000Z"));

    expect(isValidValuationDate("2026-09-30")).toBe(true);
    expect(isFutureValuationDate("2026-09-30")).toBe(false);
    expect(isFutureValuationDate("2026-10-01")).toBe(true);
  });
});
