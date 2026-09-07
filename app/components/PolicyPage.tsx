import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

type PolicyKind = 'privacy' | 'terms';

const policyCopy = {
  privacy: {
    eyebrow: 'Privacy notice · informational draft',
    title: 'How PRAXIZ handles internship information',
    intro: 'This informational notice describes the categories of information used by PRAXIZ for internship monitoring and account administration. It is not a substitute for formally approved Partido State University policy.',
    sections: [
      ['Information used by PRAXIZ', ['Account and verified institutional profile information', 'Campus, college, department, and academic program information', 'Internship assignments, attendance, Daily Logs, documents, feedback, and evaluation records', 'System activity needed to operate authorized workflows']],
      ['How information is used', ['Identity and account administration', 'Internship placement, attendance, document, and evaluation workflows', 'Program-scoped monitoring, reporting, and analytics', 'AI-assisted interpretation of verified PRAXIZ indicators']],
      ['Who can access information', ['Student Interns, Internship Coordinators, authorized HTE Representatives, and System Administrators receive access according to their legitimate role and scope.', 'Access to records is controlled by authenticated sessions, role assignments, and database access controls.']],
      ['AI-assisted features', ['AI-assisted interpretation is advisory. Verified PRAXIZ records, configured monitoring rules, and authorized institutional decisions remain authoritative.', 'PRAXIZ does not describe AI output as an independent decision or as a replacement for authorized review.']],
      ['Data security', ['PRAXIZ uses authenticated accounts and database access controls to protect authorized workflows. No security system can promise absolute protection, so users should keep credentials private and report concerns promptly.']],
      ['Contact and updates', ['Questions about this informational notice can be sent to praxiz.official@gmail.com.', 'This page may be updated when approved institutional wording or platform data practices change.']],
    ],
  },
  terms: {
    eyebrow: 'Platform use terms · informational draft',
    title: 'Using the PRAXIZ platform responsibly',
    intro: 'These informational terms describe appropriate use of PRAXIZ for internship monitoring and management. They are not a substitute for formally approved Partido State University policy.',
    sections: [
      ['Purpose of PRAXIZ', ['PRAXIZ supports legitimate internship placement, attendance, Daily Logs, document tracking, evaluation, reporting, and analytics for Partido State University.']],
      ['Authorized users', ['Student Interns, Internship Coordinators, authorized HTE Representatives, and System Administrators use the workspaces assigned to their role.']],
      ['Account responsibilities', ['Keep credentials secure and use your own account.', 'Provide accurate information that you are authorized to provide.', 'Report suspected account or record problems through the PRAXIZ support channel.']],
      ['Appropriate use', ['Do not attempt unauthorized access, manipulate another user\'s records, misuse institutional data, or interfere with platform operation.', 'Use official PRAXIZ workflows for internship records and review decisions.']],
      ['AI-assisted features', ['AI outputs are advisory. Verified PRAXIZ data, configured rules, and authorized institutional decisions remain authoritative.']],
      ['Availability, changes, and contact', ['Platform features and content may change as authorized institutional workflows evolve. No unsupported uptime guarantee is made.', 'Questions can be sent to praxiz.official@gmail.com.']],
    ],
  },
} as const;

export function PolicyPage({ kind }: { kind: PolicyKind }) {
  const copy = policyCopy[kind];
  return <div className="policy-page">
    <header className="policy-header"><Link className="back-link" href="/"><ArrowLeft size={17} /> Back to PRAXIZ</Link><span className="policy-brand"><ShieldCheck size={20} /> PRAXIZ · Partido State University</span></header>
    <main className="policy-content">
      <span className="eyebrow dark">{copy.eyebrow}</span>
      <h1>{copy.title}</h1>
      <p className="policy-intro">{copy.intro}</p>
      <div className="policy-sections">{copy.sections.map(([heading, items]) => <section className="policy-section" key={heading}><h2>{heading}</h2>{items.map((item) => <p key={item}>{item}</p>)}</section>)}</div>
      <div className="policy-actions"><Link className="button button-primary" href="/register">Return to registration</Link><Link className="text-link" href="/contact">Contact PRAXIZ</Link></div>
    </main>
  </div>;
}
