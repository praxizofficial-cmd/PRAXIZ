"use client";
import { useId } from "react";
import { GraduationCap, UsersRound, Building2, BriefcaseBusiness, ShieldCheck, CalendarCheck2, FileText, FolderCheck, ChartNoAxesCombined, ArrowRight, LayoutDashboard } from "lucide-react";
import { PublicReveal } from "./PublicReveal";
import { usePublicContentTransition } from "./usePublicContentTransition";
import { usePublicPreview } from "./usePublicPreview";

// Public conceptual labels verified against app/data.ts and app/permissions.ts.
const workspaces = [
  { title: "Student Intern", Icon: GraduationCap, description: "Records attendance, logs, documents, and progress.", areas: ["Attendance", "Weekly Logs", "Documents", "Internship Progress"] },
  { title: "Internship Coordinator", Icon: UsersRound, description: "Coordinates placements and program monitoring.", areas: ["Intern Management", "Internship Assignments", "Attendance Monitoring", "Evaluations"] },
  { title: "HTE Representative", Icon: Building2, description: "Reviews assigned interns and evaluates performance.", areas: ["Assigned Interns", "Attendance Verification", "Weekly Logs", "Evaluations"] },
  { title: "Placement Head", Icon: BriefcaseBusiness, description: "Oversees placement, compliance, and institutional insight.", areas: ["Placement Oversight", "Document Compliance", "Institutional Monitoring"] },
  { title: "System Administrator", Icon: ShieldCheck, description: "Maintains authorized accounts, terms, and platform policy.", areas: ["User Accounts", "Academic Terms", "Roles and Access", "Platform Administration"] },
];
const areaIcons = [CalendarCheck2, FileText, FolderCheck, ChartNoAxesCombined];
export function PublicWorkspaceExplorer() {
  const preview = usePublicPreview();
  const panel = useId();
  const contentRef = usePublicContentTransition(preview.active);
  const active = workspaces[preview.active];
  const Icon = active.Icon;
  return <PublicReveal className="workspace-explorer">
    <div className="workspace-roles" role="group" aria-label="Role-based workspaces">
      {workspaces.map(({ title, Icon: RoleIcon }, index) => <button type="button" key={title} {...preview.controls(index)} data-active={preview.active === index} aria-controls={panel}><RoleIcon size={21} aria-hidden="true" /><span>{title}</span><ArrowRight size={16} aria-hidden="true" /></button>)}
    </div>
    <section className="concept-workspace" id={panel} aria-label="Conceptual workspace preview">
      <header><LayoutDashboard size={16} aria-hidden="true" /><span>WORKSPACE PREVIEW</span><span className="concept-badge">Conceptual</span></header>
      <div ref={contentRef} className="workspace-content" aria-live="polite" aria-atomic="true">
        <div className="workspace-title"><span className="detail-icon"><Icon size={25} aria-hidden="true" /></span><div><small>ROLE {String(preview.active + 1).padStart(2, "0")} / 05</small><h3>{active.title}</h3></div></div>
        <p>{active.description}</p>
        <div className="workspace-widgets">{active.areas.map((area, index) => {
          const AreaIcon = areaIcons[index];
          return <article key={index}><AreaIcon size={20} aria-hidden="true" /><strong>{area}</strong><span className="widget-document" aria-hidden="true"><i /><i /><i /></span></article>;
        })}</div>
      </div>
      <footer><ShieldCheck size={15} aria-hidden="true" />Role-appropriate access · No live records</footer>
    </section>
  </PublicReveal>;
}
