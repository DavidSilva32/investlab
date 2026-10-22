"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { isThemePaletteId, type ThemePaletteId } from "@/lib/theme-palettes";

const PALETTE_STORAGE_KEY = "investlab-palette";

type ThemePaletteContextValue = {
  palette: ThemePaletteId;
  setPalette: (palette: string) => void;
};

const ThemePaletteContext = createContext<ThemePaletteContextValue>({
  palette: "blue",
  setPalette: () => {},
});

function ThemePaletteState({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<ThemePaletteId>("blue");

  const applyPalette = useCallback((value: string) => {
    if (!isThemePaletteId(value)) return;
    setPaletteState(value);
    document.documentElement.dataset.palette = value;
    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, value);
    } catch {
      // The palette remains active for this page even if storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const applyStoredPalette = (value: string | null) => {
      const nextPalette = value && isThemePaletteId(value) ? value : "blue";
      setPaletteState(nextPalette);
      document.documentElement.dataset.palette = nextPalette;
    };

    try {
      applyStoredPalette(window.localStorage.getItem(PALETTE_STORAGE_KEY));
    } catch {
      document.documentElement.dataset.palette = "blue";
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === PALETTE_STORAGE_KEY || event.key === null) {
        applyStoredPalette(event.key === null ? null : event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <ThemePaletteContext.Provider value={{ palette, setPalette: applyPalette }}>
      {children}
    </ThemePaletteContext.Provider>
  );
}

export function useThemePalette() {
  return useContext(ThemePaletteContext);
}

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemePaletteState>{children}</ThemePaletteState>
    </NextThemesProvider>
  );
}
