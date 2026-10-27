import type { LucideIcon } from "lucide-react";

export function WorkspaceMetrics({ items }: { items: { label: string; value: number | string; icon: LucideIcon; tone?: string }[] }) {
  return <div className="workspace-metrics">{items.map(({ label, value, icon: Icon, tone = "blue" }) => <article className="stat-card" key={label}><div className="stat-heading"><p>{label}</p><span className={`stat-icon stat-${tone}`}><Icon size={22} aria-hidden="true" /></span></div><strong className="stat-number">{value}</strong></article>)}</div>;
}
