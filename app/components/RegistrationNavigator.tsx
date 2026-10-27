"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
const sections = ["Identity", "Academic information", "Account security"];
export function RegistrationNavigator({ complete }: { complete: boolean[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const entry = entries.filter(item => item.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (entry) setActive(Number((entry.target as HTMLElement).dataset.registrationSection));
    }, { rootMargin: "-100px 0px -45% 0px", threshold: 0 });
    document.querySelectorAll("[data-registration-section]").forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return <nav className="registration-navigator" aria-label="Registration sections">{sections.map((label, index) => <button key={label} type="button" aria-current={active === index ? "step" : undefined} onClick={() => { setActive(index); document.getElementById(`registration-section-${index}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }}><span>{complete[index] ? <Check size={16} aria-label="Required fields valid"/> : String(index + 1).padStart(2, "0")}</span><strong>{label}</strong><small>{complete[index] ? "Fields valid" : "Incomplete"}</small></button>)}</nav>;
}
