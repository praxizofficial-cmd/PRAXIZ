"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Observe once, retaining readable server content and stable state on theme changes. */
export function PublicReveal({ children, className }: { children: ReactNode; className: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { element.dataset.entered = "true"; observer.disconnect(); }
    }, { threshold: 0.15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div className={`public-experience ${className}`} ref={root}>{children}</div>;
}
