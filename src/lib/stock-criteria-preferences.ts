"use client";

import { useSyncExternalStore } from "react";
import type { StockCriteriaPreferences } from "@/lib/stock-criteria-evaluation";

export const stockCriteriaPreferencesStorageKey =
  "investlab:analyses:stock-criteria:v1";
export const stockCriteriaPreferencesUpdatedEvent =
  "investlab:analyses:stock-criteria-updated";

export const defaultStockCriteriaPreferences: StockCriteriaPreferences = {
  maximumPe: 15,
  minimumRoePercent: 15,
};

let cachedPreferences = defaultStockCriteriaPreferences;
let cachedStorageValue: string | null | undefined;

export function parseStockCriteriaPreferences(
  raw: string | null,
): StockCriteriaPreferences {
  try {
    const stored: unknown = JSON.parse(raw ?? "null");
    if (typeof stored !== "object" || stored === null)
      return defaultStockCriteriaPreferences;
    const candidate = stored as Partial<StockCriteriaPreferences>;
    return {
      maximumPe:
        typeof candidate.maximumPe === "number" &&
        Number.isFinite(candidate.maximumPe) &&
        candidate.maximumPe > 0
          ? candidate.maximumPe
          : defaultStockCriteriaPreferences.maximumPe,
      minimumRoePercent:
        typeof candidate.minimumRoePercent === "number" &&
        Number.isFinite(candidate.minimumRoePercent) &&
        candidate.minimumRoePercent > 0
          ? candidate.minimumRoePercent
          : defaultStockCriteriaPreferences.minimumRoePercent,
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
