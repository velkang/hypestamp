import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const KEY = "hypestamp.theme";
function storedTheme(): Theme | null {
  try { const value = localStorage.getItem(KEY); return value === "light" || value === "dark" ? value : null; }
  catch { return null; }
}
const systemTheme = (): Theme => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(storedTheme);
  const [system, setSystem] = useState(systemTheme);
  const theme = preference ?? system;
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystem(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101713" : "#f7f6f2");
  }, [theme]);
  useEffect(() => {
    const update = (event: StorageEvent) => { if (event.key === KEY || event.key === null) setPreference(storedTheme()); };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setPreference(next);
    try { localStorage.setItem(KEY, next); } catch { /* The choice still lasts for this visit. */ }
  };
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeToggle requires ThemeProvider");
  const { theme, toggle } = context;
  const label = `Switch to ${theme === "light" ? "dark" : "light"} mode`;
  return (
    <button type="button" onClick={toggle} className="theme-toggle" aria-label={label} aria-pressed={theme === "dark"} title={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        {theme === "light" ? <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>}
      </svg>
    </button>
  );
}
