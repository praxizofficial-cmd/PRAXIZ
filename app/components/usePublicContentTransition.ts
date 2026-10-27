"use client";
import { useEffect, useRef } from "react";

/** Animate existing content without remounting controls, resetting focus, or hiding text. */
export function usePublicContentTransition(active: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = ref.current?.animate(
      [{ opacity: 0.65, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 220, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [active]);
  return ref;
}
