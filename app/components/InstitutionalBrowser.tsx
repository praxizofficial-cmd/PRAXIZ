"use client";
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { institutionalService } from '../services/praxiz-services';
import type { AcademicTerm } from '../types';

type Options = Awaited<ReturnType<typeof institutionalService.loadRegistrationInstitutionalOptions>>;
export function InstitutionalBrowser({ options, terms }: { options: Options; terms: AcademicTerm[] }) {
  const [view, setView] = useState<'hierarchy' | 'terms'>('hierarchy');
  const [unitId, setUnitId] = useState<string | null>(null);
  const unit = options.units.find(item => item.id === unitId);
  const ancestors: typeof options.units = [];
  const seen = new Set<string>();
  let current = unit;
  while (current && !seen.has(current.id)) {
    ancestors.unshift(current); seen.add(current.id);
    current = options.units.find(item => item.id === current?.parentId);
  }
  const children = options.units.filter(item => unitId ? item.parentId === unitId : item.unitType === 'campus');
  const programs = options.programs.filter(item => item.owningOrgUnitId === unitId);
  return <>
    <div className="segmented" aria-label="Institutional data view"><button aria-pressed={view === 'hierarchy'} className={view === 'hierarchy' ? 'active' : ''} onClick={() => setView('hierarchy')}>Academic hierarchy</button><button aria-pressed={view === 'terms'} className={view === 'terms' ? 'active' : ''} onClick={() => setView('terms')}>Academic terms</button></div>
    {view === 'hierarchy' ? <section className="card">
      <nav className="hierarchy-breadcrumbs" aria-label="Academic hierarchy"><button className="table-link" onClick={() => setUnitId(null)}>Campuses</button>{ancestors.map(item => <span key={item.id}><ChevronRight size={16} /><button className="table-link" aria-current={item.id === unitId ? 'page' : undefined} onClick={() => setUnitId(item.id)}>{item.shortName || item.name}</button></span>)}</nav>
      <h2>{unit?.name || 'Campuses'}</h2><p className="muted-note">{unit ? 'Only organizational units and programs owned directly by this selection are shown.' : 'Select a campus, then follow its colleges, departments and programs.'}</p>
      {!!children.length && <div className="hierarchy-list">{children.map(item => <button className="hierarchy-item" key={item.id} onClick={() => setUnitId(item.id)}><span><small>{item.unitType}</small><strong>{item.name}</strong><span>{item.code}</span></span><ChevronRight size={18} /></button>)}</div>}
      {!!programs.length && <><h3 className="hierarchy-program-heading">Programs</h3><div className="hierarchy-list">{programs.map(item => <article className="hierarchy-item" key={item.id}><span><strong>{item.code}</strong><span>{item.name}</span></span></article>)}</div></>}
      {!children.length && !programs.length && <p className="master-record-empty">No active departments or programs are configured under this selection.</p>}
    </section> : <section className="card table-card"><div className="card-title"><h2>Academic terms</h2><span>{terms.length} terms</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Academic year</th><th>Term</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>{terms.map(term => <tr key={term.id}><td>{term.academicYear}</td><td>{term.term}</td><td>{term.startsOn}</td><td>{term.endsOn}</td><td>{term.isCurrent ? 'Current' : 'Not current'}</td></tr>)}{!terms.length && <tr><td colSpan={5}>No academic terms configured.</td></tr>}</tbody></table></div></section>}
  </>;
}
