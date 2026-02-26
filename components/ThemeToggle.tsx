"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore storage errors
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = readTheme();
    setTheme(current);
    setReady(true);
    document.documentElement.dataset.theme = current;
  }, []);

  const nextTheme: Theme = theme === "dark" ? "light" : "dark";
  const icon = theme === "dark" ? "light_mode" : "dark_mode";
  const label = theme === "dark" ? "Activar modo claro" : "Activar modo oscuro";

  return (
    <button
      type="button"
      onClick={() => {
        const next = nextTheme;
        setTheme(next);
        applyTheme(next);
      }}
      aria-label={label}
      title={label}
      aria-pressed={theme === "dark"}
      disabled={!ready}
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--foreground)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: ready ? "pointer" : "default",
        opacity: ready ? 1 : 0.7,
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>
        {icon}
      </span>
    </button>
  );
}
