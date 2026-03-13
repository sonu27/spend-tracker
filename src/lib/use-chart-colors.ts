"use client";

import { useState, useEffect } from "react";

/**
 * Read CSS custom property values for use in non-CSS contexts (e.g. Recharts).
 * Re-reads when the theme changes -- either via system preference or manual toggle.
 */
export function useChartColors() {
  const [colors, setColors] = useState({
    grid: "#e2e8f0",
    accent: "#3b82f6",
    success: "#22c55e",
    cardBg: "#ffffff",
    foreground: "#0f172a",
    border: "#e2e8f0",
  });

  useEffect(() => {
    function update() {
      const s = getComputedStyle(document.documentElement);
      setColors({
        grid: s.getPropertyValue("--border").trim() || "#e2e8f0",
        accent: s.getPropertyValue("--accent").trim() || "#3b82f6",
        success: s.getPropertyValue("--success").trim() || "#22c55e",
        cardBg: s.getPropertyValue("--card-bg").trim() || "#ffffff",
        foreground: s.getPropertyValue("--foreground").trim() || "#0f172a",
        border: s.getPropertyValue("--border").trim() || "#e2e8f0",
      });
    }
    update();

    // Re-read on system preference change
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);

    // Re-read when the toggle adds/removes .dark/.light on <html>.
    // Wrap in rAF so the browser has recalculated styles before we read them.
    const observer = new MutationObserver(() => requestAnimationFrame(update));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      mq.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  return colors;
}
