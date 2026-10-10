"use client";

import { useSyncExternalStore } from "react";
import type {
  StockCriteriaPreferences,
  StockCriteriaPreset,
} from "@/lib/stock-criteria-evaluation";

export const stockCriteriaPreferencesStorageKey =
  "investlab:analyses:stock-criteria:v1";
export const stockCriteriaPreferencesUpdatedEvent =
  "investlab:analyses:stock-criteria-updated";

export const stockCriteriaPresets: Record<
  Exclude<StockCriteriaPreset, "custom">,
  StockCriteriaPreferences
> = {
  conservative: {
    preset: "conservative",
    maximumPe: 10,
    maximumPb: null,
    minimumRoePercent: 20,
  },
  balanced: {
    preset: "balanced",
    maximumPe: 15,
    maximumPb: null,
    minimumRoePercent: 15,
  },
};

export const defaultStockCriteriaPreferences = stockCriteriaPresets.balanced;

let cachedPreferences = defaultStockCriteriaPreferences;
let cachedStorageValue: string | null | undefined;

function inferPreset(
  values: Omit<StockCriteriaPreferences, "preset">,
): StockCriteriaPreset {
  if (
    values.maximumPe === stockCriteriaPresets.conservative.maximumPe &&
    values.maximumPb === stockCriteriaPresets.conservative.maximumPb &&
    values.minimumRoePercent ===
      stockCriteriaPresets.conservative.minimumRoePercent
  )
    return "conservative";
  if (
    values.maximumPe === defaultStockCriteriaPreferences.maximumPe &&
    values.maximumPb === defaultStockCriteriaPreferences.maximumPb &&
    values.minimumRoePercent ===
      defaultStockCriteriaPreferences.minimumRoePercent
  )
    return "balanced";
  return "custom";
}

export function parseStockCriteriaPreferences(
  raw: string | null,
): StockCriteriaPreferences {
  try {
    const stored: unknown = JSON.parse(raw ?? "null");
    if (typeof stored !== "object" || stored === null)
      return defaultStockCriteriaPreferences;
    const candidate = stored as Partial<StockCriteriaPreferences>;
    const values = {
      maximumPe:
        typeof candidate.maximumPe === "number" &&
        Number.isFinite(candidate.maximumPe) &&
        candidate.maximumPe > 0
          ? candidate.maximumPe
          : defaultStockCriteriaPreferences.maximumPe,
      maximumPb:
        candidate.maximumPb === null
          ? null
          : typeof candidate.maximumPb === "number" &&
              Number.isFinite(candidate.maximumPb) &&
              candidate.maximumPb > 0
            ? candidate.maximumPb
            : defaultStockCriteriaPreferences.maximumPb,
      minimumRoePercent:
        typeof candidate.minimumRoePercent === "number" &&
        Number.isFinite(candidate.minimumRoePercent) &&
        candidate.minimumRoePercent > 0
          ? candidate.minimumRoePercent
          : defaultStockCriteriaPreferences.minimumRoePercent,
    };
    return {
      ...values,
      preset:
        candidate.preset === "conservative" ||
        candidate.preset === "balanced" ||
        candidate.preset === "custom"
          ? candidate.preset
          : inferPreset(values),
    };
  } catch {
    return defaultStockCriteriaPreferences;
  }
}

function getPreferencesSnapshot() {
  try {
    const value = window.localStorage.getItem(
      stockCriteriaPreferencesStorageKey,
    );
    if (value !== cachedStorageValue) {
      cachedStorageValue = value;
      cachedPreferences = parseStockCriteriaPreferences(value);
    }
  } catch {
    cachedStorageValue = null;
    cachedPreferences = defaultStockCriteriaPreferences;
  }
  return cachedPreferences;
}

function subscribeToPreferences(onStoreChange: () => void) {
  const refresh = () => {
    cachedStorageValue = undefined;
    onStoreChange();
  };
  window.addEventListener("storage", refresh);
  window.addEventListener(stockCriteriaPreferencesUpdatedEvent, refresh);
  return () => {
    window.removeEventListener("storage", refresh);
    window.removeEventListener(stockCriteriaPreferencesUpdatedEvent, refresh);
  };
}

export function useStockCriteriaPreferences() {
  return useSyncExternalStore(
    subscribeToPreferences,
    getPreferencesSnapshot,
    () => defaultStockCriteriaPreferences,
  );
}
