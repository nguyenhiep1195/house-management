export type ThemeMode = "light" | "dark" | "system";
export type ThemeAccent =
  | "neutral"
  | "blue"
  | "green"
  | "violet"
  | "orange"
  | "rose";
export type ThemeFontSize = "sm" | "md" | "lg";

export interface ThemeSettings {
  mode: ThemeMode;
  accent: ThemeAccent;
  fontSize: ThemeFontSize;
}

export const THEME_STORAGE_KEY = "house-management:theme";

export const DEFAULT_THEME: ThemeSettings = {
  mode: "system",
  accent: "neutral",
  fontSize: "md",
};

export const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Sáng" },
  { value: "dark", label: "Tối" },
  { value: "system", label: "Theo hệ thống" },
];

export const THEME_ACCENTS: {
  value: ThemeAccent;
  label: string;
  /** Swatch color shown in the accent picker. */
  swatch: string;
}[] = [
  { value: "neutral", label: "Trung tính", swatch: "oklch(0.205 0 0)" },
  { value: "blue", label: "Xanh dương", swatch: "oklch(0.546 0.245 262.881)" },
  { value: "green", label: "Xanh lá", swatch: "oklch(0.627 0.194 149.214)" },
  { value: "violet", label: "Tím", swatch: "oklch(0.541 0.281 293.009)" },
  { value: "orange", label: "Cam", swatch: "oklch(0.646 0.222 41.116)" },
  { value: "rose", label: "Hồng", swatch: "oklch(0.586 0.253 17.585)" },
];

export const THEME_FONT_SIZES: {
  value: ThemeFontSize;
  label: string;
  px: number;
}[] = [
  { value: "sm", label: "Nhỏ", px: 14 },
  { value: "md", label: "Vừa", px: 16 },
  { value: "lg", label: "Lớn", px: 20 },
];

export function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Applies theme settings to <html>. Safe to call only in the browser. */
export function applyTheme(settings: ThemeSettings) {
  const el = document.documentElement;
  el.classList.toggle("dark", resolveMode(settings.mode) === "dark");
  if (settings.accent === "neutral") {
    delete el.dataset.accent;
  } else {
    el.dataset.accent = settings.accent;
  }
  el.dataset.fontSize = settings.fontSize;
}

export function loadTheme(): ThemeSettings {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    return { ...DEFAULT_THEME, ...(JSON.parse(raw) as Partial<ThemeSettings>) };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(settings: ThemeSettings) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private mode/quota) — theme still applies for the session
  }
}
