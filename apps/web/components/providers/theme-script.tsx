import { THEME_STORAGE_KEY } from "@/lib/theme";

// Runs before paint so the persisted theme (dark mode, accent, font size)
// is on <html> before React hydrates — prevents a flash of default theme.
const script = `(function () {
  try {
    var s = JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || "{}");
    var mode = s.mode || "system";
    var dark =
      mode === "dark" ||
      (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    var el = document.documentElement;
    el.classList.toggle("dark", dark);
    if (s.accent && s.accent !== "neutral") el.dataset.accent = s.accent;
    el.dataset.fontSize = s.fontSize || "md";
  } catch (e) {}
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
