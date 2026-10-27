"use client";
import Image from "next/image";
import { usePublicPreview } from "./usePublicPreview";
import { usePublicContentTransition } from "./usePublicContentTransition";
const goals = [
  { id: 4, title: "Quality Education", text: "Documented internship learning, activities, feedback, and evaluations support experiential education.", capabilities: ["Weekly Logs", "Learning feedback", "Official evaluations"] },
  { id: 9, title: "Industry, Innovation and Infrastructure", text: "Digital internship workflows and structured academic–industry information management help authorized participants manage records consistently.", capabilities: ["Document workflows", "Attendance records", "Authorized reporting"] },
  { id: 17, title: "Partnerships for the Goals", text: "Student Interns, Internship Coordinators, and Host Training Establishments collaborate through shared, role-appropriate processes.", capabilities: ["Internship assignments", "HTE review", "Coordinator oversight"] },
];
export function SdgExplorer() {
  const preview = usePublicPreview();
  const transition = usePublicContentTransition(preview.active);
  const goal = goals[preview.active];
  return <div className="sdg-explorer"><div className="sdg-explorer-grid">{goals.map((item, index) => <button type="button" key={item.id} {...preview.controls(index)} className={preview.active === index ? "is-active" : ""} aria-controls="sdg-explanation"><Image unoptimized src={`/sdgs/sdg-${item.id}.png`} alt={`SDG ${item.id}: ${item.title}`} width={144} height={144}/><h3>{item.title}</h3><span>Explore PRAXIZ relevance</span></button>)}</div><div ref={transition} className="sdg-explanation" id="sdg-explanation" aria-live="polite"><span className="eyebrow">SDG {goal.id}</span><h3>{goal.title}</h3><p>{goal.text}</p><ul>{goal.capabilities.map(item => <li key={item}>{item}</li>)}</ul></div></div>;
}
