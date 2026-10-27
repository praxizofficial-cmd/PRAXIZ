"use client";
import { useId, type CSSProperties } from "react";
import { BriefcaseBusiness, CalendarCheck2, ClipboardCheck, ChartNoAxesCombined, Database, Sparkles, ShieldCheck, UserCheck, ArrowLeft, ArrowRight } from "lucide-react";
import { usePublicContentTransition } from "./usePublicContentTransition";
import { usePublicPreview } from "./usePublicPreview";
import { PublicReveal } from "./PublicReveal";

const journeyIcons = [BriefcaseBusiness, CalendarCheck2, ClipboardCheck, ChartNoAxesCombined];
const aiIcons = [Database, ChartNoAxesCombined, Sparkles, UserCheck];

export function PublicInteractiveFlow({ label, items, kind = "journey" }: {
  label: string;
  items: readonly { title: string; description: string }[];
  kind?: "journey" | "ai";
}) {
  const preview = usePublicPreview();
  const panelId = useId();
  const contentRef = usePublicContentTransition(preview.active);
  const icons = kind === "ai" ? aiIcons : journeyIcons;
  const ActiveIcon = icons[preview.active];
  return <PublicReveal className={`connected-flow connected-flow-${kind}`}>
    <div className="connected-stages" role="group" aria-label={label}>
      {items.map((item, index) => {
        const Icon = icons[index];
        return <div className="connected-stage" key={item.title} style={{ "--stage-index": index } as CSSProperties}>
          <button type="button" {...preview.controls(index)} aria-controls={panelId} data-active={preview.active === index} className="stage-card">
            <span className="stage-number">{String(index + 1).padStart(2, "0")}<span className="selection-dot" aria-hidden="true" /></span>
            <Icon size={23} aria-hidden="true" /><strong>{item.title}</strong>
            {kind === "ai" && index === 3 && <small>Final authority</small>}
          </button>
          {index < items.length - 1 && <svg className="stage-connector" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" data-active={preview.active === index || preview.active === index + 1}>
            <path d="M0 5 H100" pathLength="1" /><path className="travel-light" d="M0 5 H100" pathLength="1" />
          </svg>}
        </div>;
      })}
      <svg className="stage-wrap-connector" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" data-active={preview.active === 1 || preview.active === 2}><path d="M100 0 V5 H0 V10" pathLength="1" /></svg>
    </div>
    <section className="flow-detail" id={panelId} aria-label={`${label} details`}>
      <div ref={contentRef} className="flow-detail-copy" aria-live="polite" aria-atomic="true">
        <span className="detail-icon"><ActiveIcon size={24} aria-hidden="true" /></span>
        <div><small>STEP {String(preview.active + 1).padStart(2, "0")} / 04</small><h3>{items[preview.active].title}</h3><p>{items[preview.active].description}</p></div>
      </div>
      <footer className="flow-detail-footer">
        <span className="stage-progress" aria-label={`Stage ${preview.active + 1} of ${items.length}`}>{items.map((item, index) => <i key={item.title} data-active={index === preview.active} />)}</span>
        <div className="stage-navigation">
          <button type="button" disabled={preview.active === 0} onClick={() => preview.select(preview.active - 1)} aria-label={`Previous ${kind === "ai" ? "AI" : "journey"} stage`}><ArrowLeft size={15} /> Previous</button>
          <button type="button" disabled={preview.active === items.length - 1} onClick={() => preview.select(preview.active + 1)} aria-label={`Next ${kind === "ai" ? "AI" : "journey"} stage`}>Next <ArrowRight size={15} /></button>
        </div>
      </footer>
    </section>
    {kind === "ai" && <p className="flow-safeguard"><ShieldCheck size={16} aria-hidden="true" />AI is advisory. Authorized people retain decision-making responsibility.</p>}
  </PublicReveal>;
}
