"use client";
import { useId } from "react";
import { Clock3, FileText, FileCheck2, Star, ChartNoAxesCombined, Search, MessageCircle, UserCheck, ArrowDown } from "lucide-react";
import { PublicReveal } from "./PublicReveal";
import { usePublicContentTransition } from "./usePublicContentTransition";
import { usePublicPreview } from "./usePublicPreview";

const sources = [
  { title: "Attendance", Icon: Clock3, description: "Verified attendance provides context for internship participation." },
  { title: "Weekly Logs", Icon: FileText, description: "Weekly logs document activities and learning for authorized review." },
  { title: "Documents", Icon: FileCheck2, description: "Document compliance provides context for internship requirements." },
  { title: "Evaluations", Icon: Star, description: "Official evaluations contribute reviewed performance indicators." },
];
const actions = [
  { title: "Review", Icon: Search, description: "Review the underlying records and their context." },
  { title: "Follow Up", Icon: MessageCircle, description: "Follow up on records that need clarification." },
  { title: "Decide", Icon: UserCheck, description: "Authorized people make official decisions." },
];
export function PublicAnalytics() {
  const source = usePublicPreview();
  const action = usePublicPreview();
  const id = useId();
  const contentRef = usePublicContentTransition(source.active);
  return <PublicReveal className="analytics-experience">
    <div className="record-sources" role="group" aria-label="Record sources">
      {sources.map(({ title, Icon }, index) => <button type="button" key={title} {...source.controls(index)} data-active={source.active === index} aria-controls={`${id}-interpretation`}><Icon size={19} aria-hidden="true" /><span>{title}</span><span className="selection-dot" aria-hidden="true" /></button>)}
    </div>
    <svg className="record-connectors" viewBox="0 0 100 260" preserveAspectRatio="none" aria-hidden="true">
      {sources.map((item, index) => <g key={item.title} data-active={source.active === index}>
        <path pathLength="1" d={`M0 ${29 + index * 67} C45 ${29 + index * 67},45 130,100 130`} />
        <path className="travel-light" pathLength="1" d={`M0 ${29 + index * 67} C45 ${29 + index * 67},45 130,100 130`} />
      </g>)}
    </svg>
    <ArrowDown className="compact-flow-arrow" aria-hidden="true" />
    <div ref={contentRef} className="interpretation-orbit" id={`${id}-interpretation`}>
      <ChartNoAxesCombined size={29} aria-hidden="true" /><h3>Performance Interpretation</h3>
      <p aria-live="polite" aria-atomic="true">{sources[source.active].description}</p>
      <span className="stage-progress" aria-hidden="true">{sources.map((item, index) => <i key={item.title} data-active={source.active === index} />)}</span>
    </div>
    <svg className="action-connectors" viewBox="0 0 100 192" preserveAspectRatio="none" aria-hidden="true">
      {actions.map((item, index) => <g key={item.title} data-active={action.active === index}><path pathLength="1" d={`M0 96 C55 96,50 ${29 + index * 67},100 ${29 + index * 67}`} /><path className="travel-light" pathLength="1" d={`M0 96 C55 96,50 ${29 + index * 67},100 ${29 + index * 67}`} /></g>)}
    </svg>
    <ArrowDown className="compact-flow-arrow" aria-hidden="true" />
    <div className="human-actions" role="group" aria-label="Illustrative coordinator actions">
      <small>HUMAN-GUIDED ACTIONS</small>
      {actions.map(({ title, Icon }, index) => <button type="button" key={title} {...action.controls(index)} data-active={action.active === index} aria-describedby={`${id}-action`}><Icon size={18} aria-hidden="true" />{title}</button>)}
      <p id={`${id}-action`} aria-live="polite">{actions[action.active].description}</p>
    </div>
    <p className="analytics-concept-note">Conceptual illustration · Not live PRAXIZ analytics</p>
  </PublicReveal>;
}
