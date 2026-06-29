"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Warm-dark default; remembers the choice. The inline script in layout.tsx sets
 *  the class before paint so there's no flash. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("cg-theme") as "dark" | "light") || "dark";
    setTheme(saved);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("cg-theme", next);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(next);
  }

  return (
    <button onClick={toggle} className="btn" aria-label="Toggle theme" title="Toggle light / dark">
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
