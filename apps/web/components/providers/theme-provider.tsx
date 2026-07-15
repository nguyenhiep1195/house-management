"use client";

import * as React from "react";

import {
  applyTheme,
  DEFAULT_THEME,
  loadTheme,
  saveTheme,
  type ThemeSettings,
} from "@/lib/theme";

// Minimal external store: localStorage is the source of truth, consumed via
// useSyncExternalStore so server render (DEFAULT_THEME) and client hydration
// stay consistent without setState-in-effect.
let snapshot: ThemeSettings | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): ThemeSettings {
  snapshot ??= loadTheme();
  return snapshot;
}

function getServerSnapshot(): ThemeSettings {
  return DEFAULT_THEME;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateTheme(next: ThemeSettings) {
  snapshot = next;
  applyTheme(next);
  saveTheme(next);
  listeners.forEach((listener) => listener());
}

interface ThemeContextValue {
  theme: ThemeSettings;
  setTheme: (patch: Partial<ThemeSettings>) => void;
  resetTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Follow OS color-scheme changes while in "system" mode.
  React.useEffect(() => {
    if (theme.mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(theme);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = React.useCallback((patch: Partial<ThemeSettings>) => {
    updateTheme({ ...getSnapshot(), ...patch });
  }, []);

  const resetTheme = React.useCallback(() => {
    updateTheme(DEFAULT_THEME);
  }, []);

  const value = React.useMemo(
    () => ({ theme, setTheme, resetTheme }),
    [theme, setTheme, resetTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
