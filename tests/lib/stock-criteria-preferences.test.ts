import { describe, expect, it } from "vitest";
import {
  defaultStockCriteriaPreferences,
  parseStockCriteriaPreferences,
} from "@/lib/stock-criteria-preferences";

describe("parseStockCriteriaPreferences", () => {
  it("migrates a balanced legacy preset with no P/VP limit", () => {
    expect(
      parseStockCriteriaPreferences(
        JSON.stringify({
          maximumPe: 15,
          maximumPb: null,
          minimumRoePercent: 15,
        }),
      ),
    ).toEqual(defaultStockCriteriaPreferences);
  });

  it("preserves a custom preset with no optional P/VP limit", () => {
    expect(
      parseStockCriteriaPreferences(
        JSON.stringify({
          preset: "custom",
          maximumPe: 12,
          maximumPb: null,
          minimumRoePercent: 9,
        }),
      ),
    ).toEqual({
      preset: "custom",
      maximumPe: 12,
      maximumPb: null,
      minimumRoePercent: 9,
    });
  });

  it("migrates missing invalid limits to the shared balanced defaults", () => {
    expect(
      parseStockCriteriaPreferences(
        JSON.stringify({
          preset: "unknown",
          maximumPe: "invalid",
          maximumPb: null,
          minimumRoePercent: "invalid",
        }),
      ),
    ).toEqual(defaultStockCriteriaPreferences);
  });

  it("uses the P/VP default for explicitly selected legacy presets", () => {
    expect(
      parseStockCriteriaPreferences(
        JSON.stringify({
          preset: "balanced",
          maximumPe: 15,
          maximumPb: null,
          minimumRoePercent: 15,
        }),
      ),
    ).toEqual(defaultStockCriteriaPreferences);
  });
});
