"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BarChart3, FileText, LayoutDashboard, ShieldCheck, Sparkles } from "lucide-react";

const features = [
  { title: "Centralized Records", icon: FileText, copy: "Attendance, Weekly Logs, and documents stay connected to the internship record." },
  { title: "Guided Oversight", icon: ShieldCheck, copy: "Authorized reviewers verify records and guide internship progress." },
  { title: "Meaningful Insights", icon: BarChart3, copy: "Verified indicators support analysis and human-guided interpretation." },
];

export function FloatingDashboard() {
  const [selected, setSelected] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let countFrame = 0;
    const start = performance.now();
    const count = (now: number) => {
      const amount = reduced.matches ? 1 : Math.min(1, (now - start) / 900);
      setProgress(amount);
      if (amount < 1) countFrame = requestAnimationFrame(count);
    };
    countFrame = requestAnimationFrame(count);
    const move = (event: PointerEvent) => {
      if (reduced.matches || event.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--tilt-x", `${Math.max(-4, Math.min(4, (0.5 - (event.clientY - rect.top) / rect.height) * 8))}deg`);
        element.style.setProperty("--tilt-y", `${Math.max(-4, Math.min(4, ((event.clientX - rect.left) / rect.width - 0.5) * 8))}deg`);
      });
    };
    const reset = () => { cancelAnimationFrame(frame); element.style.setProperty("--tilt-x", "0deg"); element.style.setProperty("--tilt-y", "0deg"); };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", reset);
    reduced.addEventListener("change", reset);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(countFrame); element.removeEventListener("pointermove", move); element.removeEventListener("pointerleave", reset); reduced.removeEventListener("change", reset); };
  }, []);
  return <div ref={root} className="floating-showcase" data-selected={selected ?? "all"} aria-label="Interactive illustrative PRAXIZ dashboard">
    <svg className="showcase-connections" viewBox="0 0 600 520" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="showcase-accent"><stop stopColor="var(--primary)" stopOpacity=".5"/><stop offset="1" stopColor="var(--primary)"/></linearGradient></defs>{["M100 40 C100 90 170 30 210 80", "M500 55 C610 25 605 180 570 210", "M510 450 C625 440 625 330 570 310"].map((path, index) => <path key={path} data-active={selected === index} d={path} pathLength="1" />)}</svg>
    <div className="floating-dashboard"><header><Image unoptimized src="/branding/praxiz-symbol.png" alt="" width={25} height={25}/><strong>PRAXIZ</strong><span>Illustrative preview</span></header>
      <div className="preview-layout"><nav aria-label="Preview sections"><LayoutDashboard aria-hidden="true"/>{features.map(({ title, icon: Icon }, index) => <button key={title} aria-label={`Preview ${title}`} aria-pressed={selected === index} onClick={() => setSelected(index)}><Icon size={18}/></button>)}</nav>
      <div className="preview-main"><p className="preview-eyebrow">YOUR INTERNSHIP, CONNECTED</p><h2>A clearer view of progress.</h2><div className="preview-metrics" data-panel="1"><div><span>Example records</span><strong>{Math.round(12 * progress)}</strong></div><div><span>Example reviewed</span><strong>{Math.round(8 * progress)}</strong></div><div><span>Example progress</span><strong>{Math.round(75 * progress)}%</strong></div></div>
      <div className="preview-panels"><section data-panel="0"><h3>Recent activity</h3>{["Attendance recorded", "Weekly Log submitted", "Document reviewed"].map((text, i) => <p key={text} style={{ animationDelay: `${i * 120}ms` }}><FileText size={13}/>{text}</p>)}<small>Example workflow events</small></section><section data-panel="2"><h3>Progress overview</h3><svg viewBox="0 0 180 110" role="img" aria-label="Illustrative progress chart"><path className="chart-grid" d="M5 20H175 M5 55H175 M5 90H175"/>{[35,55,45,70,85,95].map((height,i) => <rect key={i} x={i*28+8} y={105-height} width="14" height={height} rx="4"/>)}</svg><small>Illustrative values only</small></section></div>
      <div className="preview-progress" data-panel="1"><span>Example review progress</span><div><i style={{ transform: `scaleX(${progress * .75})` }}/></div></div></div></div>
    </div>
    {features.map(({ title, icon: Icon }, index) => <button key={title} className={`floating-feature floating-feature-${index}`} aria-pressed={selected === index} aria-describedby="showcase-description" onClick={() => setSelected(index)}><span><Icon size={21}/></span>{title}</button>)}
    <div className="showcase-caption" id="showcase-description" aria-live="polite"><Sparkles size={16}/><p>{selected === null ? "Explore the connected workspace. All preview values are examples, not live institutional data." : features[selected].copy}</p>{selected !== null && <button onClick={() => setSelected(null)}>Reset preview</button>}</div>
  </div>;
}
