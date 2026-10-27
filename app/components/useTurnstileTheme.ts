
"use client";

import { useEffect, useState } from "react";

type TurnstileTheme = "light" | "dark";

export function useTurnstileTheme(): TurnstileTheme {
  const [theme, setTheme] = useState<TurnstileTheme>("light");

  useEffect(() => {
    const syncTheme = () => {
      setTheme(
        document.documentElement.dataset.theme === "dark"
          ? "dark"
          : "light"
      );
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    window.addEventListener("praxiz-appearance", syncTheme);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", syncTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener("praxiz-appearance", syncTheme);
      media.removeEventListener("change", syncTheme);
    };
  }, []);

  return theme;
}
