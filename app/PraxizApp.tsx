"use client";

import type { AnchorHTMLAttributes, ChangeEvent, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarCheck2,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Flag,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
  Ellipsis,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Upload,
  UserCheck,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { roles } from "./data";
import { EvaluationWorkspace } from "./components/EvaluationWorkspace";
import { Dialog } from "./components/Dialog";
import { ThemeControls } from "./components/ThemeControls";
import { ProfileDetails, ProfileAvatar } from "./components/ProfileDetails";
import { StudentAttendanceHistory } from "./components/StudentAttendanceHistory";
import { InstitutionalBrowser } from "./components/InstitutionalBrowser";
import PraxizAiAssistant from "./components/PraxizAiAssistant";
import { InfoCallout } from "./components/InfoCallout";
import { PublicSectionLink } from "./components/PublicSectionLink";
import { PolicyPage } from "./components/PolicyPage";
import { userError } from "../lib/user-error";
import { summarizeCompliance } from "../lib/compliance-summary";
import { AuthProvider, ProtectedRoute, useAuth } from "./auth/supabase-auth";
import { hasPermission } from "./permissions";
import {
  adminService,
  attendanceService,
  dailyLogService,
  documentService,
  evaluationService,
  coordinatorService,
  feedbackService,
  internshipService,
  institutionalService,
  notificationService,
  registrationService,
  workflowTemplateService,
  type AcademicYearRecord,
  type AssignmentOptions,
  type AuditLogRecord,
  type AttendanceHistoryRow,
  type DailyLogRecord,
  type DocumentRecord,
  type DocumentTemplateRecord,
  type EvaluationAssignment,
  type EvaluationRecord,
  type EvaluationTemplateRecord,
  type FeedbackRecord,
  type NotificationRecord,
  type PartnerHteRecord,
  type RegistrationRecord,
  type RolePolicyRecord,
  type StudentProgressSummary,
  type UserAccountRecord,
} from "./services/praxiz-services";
import { programsForCollege, unitsForCampus } from "./services/institutional-stabilization";
import { normalizeEvaluationCode, type EvaluationTemplateCriterionInput, type EvaluationTemplateEvaluator, type EvaluationTemplateStage } from "./services/evaluation-template-stabilization";
import { mimeTypesForPreset, type DocumentTemplateMimePreset, type DocumentTemplatePhase } from "./services/workflow-template-stabilization";
import { roleIds, type AttendanceSession, type Campus, type College, type Intern, type RoleId } from "./types";

function Link({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...props}>{children}</a>;
}

const attendanceRecords = attendanceService.listHistory();

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  calendar: CalendarCheck2,
  logs: FileText,
  documents: FileCheck2,
  star: Star,
  progress: Clock3,
  bell: Bell,
  profile: UserRound,
  users: UsersRound,
  briefcase: BriefcaseBusiness,
  assignments: ListChecks,
  analytics: Activity,
  reports: BarChart3,
  feedback: MessageSquareText,
  shield: ShieldCheck,
  settings: Settings,
};

const roleOptions: Array<{ id: RoleId; short: string; title: string; caption: string }> = [
  { id: "student", short: "SI", title: "Student Intern", caption: "PSU OJT student registering for internship" },
  { id: "coordinator", short: "IC", title: "Internship Coordinator", caption: "Departmental coordinator managing the OJT program" },
  { id: "hte", short: "HTE", title: "HTE Representative", caption: "Authorized representative of a partner organization" },
];

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const escape = (input: string | number) => {
    const value = String(input ?? "");
    return `"${(/^[=+\-@]/.test(value) ? "'" : "")}${value.replaceAll('"', '""')}"`;
  };
  const content = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className={`brand official-brand ${compact ? "brand-compact" : ""}`}>
    <Image unoptimized className="university-seal" src="/branding/parsu-logo.png" alt="Partido State University" width={48} height={48} />
    {!compact && <span className="wordmark-frame"><Image unoptimized src="/branding/praxiz-logo.png" alt="PRAXIZ" width={150} height={150} /></span>}
  </div>;
}

function ActionButton({ children, variant = "primary", icon: Icon, onClick, type = "button", disabled = false }: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return <button type={type} disabled={disabled} className={`button button-${variant}`} onClick={onClick}>{Icon && <Icon size={18} />}{children}</button>;
}

function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const tone = /^(approved|verified|active|complete|completed|resolved|finalized|available|good)(\s|$)/.test(key)
    ? "success"
    : key.includes("revision") || key.includes("missing") || key.includes("rejected") || key.includes("flagged")
      ? "danger"
      : key.includes("attention") || key.includes("pending") || key.includes("progress") || key.includes("review") || key.includes("returned") || key.includes("awaiting")
        ? "warning"
        : "info";
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

function ProgressBar({ value, tone = "blue" }: { value: number; tone?: "blue" | "green" | "orange" }) {
  return <div className="progress-track" aria-label={`${value}% complete`}><span className={`progress-fill ${tone}`} style={{ width: `${Math.min(100, value)}%` }} /></div>;
}

function StatCard({ label, value, detail, icon: Icon, tone = "blue", progress }: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "orange" | "violet" | "red";
  progress?: number;
}) {
  return (
    <article className="stat-card">
      <div className="stat-heading"><p>{label}</p><div className={`stat-icon stat-${tone}`}><Icon size={22} aria-hidden="true" /></div></div>
      <strong className="stat-number">{value}</strong>
      <p className="stat-caption">{detail}</p>
      {typeof progress === "number" && <ProgressBar value={progress} tone={tone === "green" ? "green" : tone === "orange" ? "orange" : "blue"} />}
    </article>
  );
}

function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="public-header">
    <Link className="public-header-brand" href="/" aria-label="PRAXIZ home"><Logo /></Link>
    <nav id="public-navigation" className={menuOpen ? "public-navigation-open" : ""} aria-label="Public navigation">
      <div className="public-nav-links">
        <PublicSectionLink href="/#about" className="public-link" onClick={() => setMenuOpen(false)}>About</PublicSectionLink>
        <PublicSectionLink href="/#sdgs" className="public-link" onClick={() => setMenuOpen(false)}>SDGs</PublicSectionLink>
        <PublicSectionLink href="/#how-it-works" className="public-link" onClick={() => setMenuOpen(false)}>How it works</PublicSectionLink>
        <PublicSectionLink href="/#contact" className="public-link" onClick={() => setMenuOpen(false)}>Contact</PublicSectionLink>
      </div>
      <div className="public-nav-actions">
        <Link href="/signin" className="button button-secondary">Sign in</Link>
        <Link href="/register" className="button button-primary">Create account</Link>
      </div>
    </nav>
    <div className="public-header-actions">
      <ThemeControls compact />
      <button className="icon-button public-menu-toggle" aria-expanded={menuOpen} aria-controls="public-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
    </div>
  </header>;
}

function ContactMessageForm() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [notice, setNotice] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = form.subject.trim() || 'PRAXIZ inquiry';
    const body = 'Name: ' + form.name.trim() + '\\nReply email: ' + form.email.trim() + '\\n\\n' + form.message.trim();
    window.location.href = 'mailto:praxiz.official@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    setNotice('Your email app should open with the message addressed to PRAXIZ.');
  }
  return <form className="contact-form" onSubmit={submit}>
    <h3>Send us a message</h3>
    <div className="contact-form-grid">
      <label className="field"><span>Your name</span><input required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Enter name here…" /></label>
      <label className="field"><span>Email address</span><input required type="email" maxLength={160} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="Email address" /></label>
    </div>
    <label className="field"><span>Subject</span><input required maxLength={160} value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} placeholder="Subject" /></label>
    <label className="field"><span>Message</span><textarea required minLength={10} maxLength={5000} value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} placeholder="How can we help?" /></label>
    {notice && <p className="form-success" role="status">{notice}</p>}
    <button className="button button-primary contact-submit" type="submit">Open email draft <Send size={17} /></button>
    <small className="contact-form-note">This opens your email app with PRAXIZ’s official address; no message is stored by this page.</small>
  </form>;
}

function ContactSection() {
  return <section className="landing-contact" id="contact">
    <div className="contact-heading"><span className="eyebrow">Contact us</span><h2>Get in touch with PRAXIZ.</h2><p>Have questions, feedback, or access concerns? Send a message and the PRAXIZ team will get back to you.</p></div>
    <div className="contact-content">
      <div className="contact-details"><Logo /><h3>Contact information</h3><a className="contact-email" href="mailto:praxiz.official@gmail.com">praxiz.official@gmail.com</a><p>Partido State University<br />PRAXIZ Internship Monitoring Platform</p><Link className="button button-light" href="/forgot-password">Recover access</Link></div>
      <ContactMessageForm />
    </div>
  </section>;
}

function LandingPage() {
  return (
    <div className="landing">
      <PublicHeader />
      <main>
        <section className="hero">

          <span className="semester"><span /> Partido State University · Internship Monitoring</span>
          <p className="eyebrow">What is PRAXIZ?</p>
          <h1>From placement to progress, <em>every internship journey connected.</em></h1>
          <p className="hero-copy">PRAXIZ brings internship assignments, attendance, Daily Logs, document requirements, performance evaluation, analytics, and AI-assisted insights into one secure platform for Partido State University.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/signin">Sign in to PRAXIZ <ChevronRight size={19} /></Link>
            <Link className="button button-secondary button-large" href="/register">Create an account</Link>
          </div>
        </section>
        <section className="landing-section landing-about" id="about"><span className="eyebrow dark">About PRAXIZ</span><div className="landing-section-heading"><h2>Campus, workplace, monitoring, evaluation, analytics, and insights.</h2><p>The platform supports the complete monitored internship process while keeping each stakeholder inside an authorized workspace.</p></div><div className="feature-grid" aria-label="Platform capabilities"><article><span><CalendarCheck2 size={21} /></span><h3>Monitor</h3><p>Attendance, Daily Logs, and internship progress grounded in verified records.</p></article><article><span><FileText size={21} /></span><h3>Evaluate</h3><p>Document compliance, feedback, and official performance evaluation.</p></article><article><span><ChartNoAxesCombined size={21} /></span><h3>Understand</h3><p>Program-scoped analytics and visual indicators for authorized reviewers.</p></article></div></section>
        <section className="landing-section journey-section" id="how-it-works"><span className="eyebrow dark">Internship journey</span><div className="landing-section-heading"><h2>One connected path from placement to progress.</h2><p>Each stage supports the next without exposing records outside a user’s legitimate scope.</p></div><div className="journey-grid" aria-label="Internship journey stages">{[['01','Placement','Assignments connect students, programs, campuses, and host establishments.'],['02','Attendance & Daily Logs','Verified time and daily activity records make progress visible.'],['03','Documents','Requirements and submissions remain traceable through the workflow.'],['04','Evaluation','Authorized evaluators use configured official criteria.'],['05','Analytics & Insights','Coordinators interpret verified indicators and decide with context.']].map(([number,title,copy]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div></section>
        <section className="landing-section analytics-story"><div className="landing-section-heading"><span className="eyebrow dark">Performance analytics & data visualization</span><h2>From internship records to meaningful insights.</h2><p>PRAXIZ transforms verified internship records into visual indicators that help Internship Coordinators monitor progress, identify concerns, and understand internship performance.</p></div><div className="analytics-story-card"><span className="analytics-story-line" /><div><strong>Verified indicators</strong><p>Attendance verification · Daily Log approval · Document compliance · Evaluation finalization</p></div><div><strong>AI-assisted, human-guided</strong><p>AI interprets configured indicators while official records and authorized decisions remain authoritative.</p></div></div></section>
        <section className="landing-section landing-sdgs" id="sdgs"><span className="eyebrow">Sustainable Development Goals</span><div className="landing-section-heading"><h2>Education strengthened through responsible digital partnership.</h2><p>PRAXIZ supports three closely related United Nations Sustainable Development Goals through its academic and industry internship workflow.</p></div><div className="sdg-grid"><article className="sdg-four"><Image unoptimized src="/sdgs/sdg-4.png" alt="SDG 4: Quality Education" width={144} height={144} /><div><h3>Quality Education</h3><p>Structured internship learning, documented activities, feedback, and evaluation support experiential education.</p></div></article><article className="sdg-nine"><Image unoptimized src="/sdgs/sdg-9.png" alt="SDG 9: Industry, Innovation and Infrastructure" width={144} height={144} /><div><h3>Industry, Innovation and Infrastructure</h3><p>A secure digital workflow helps PSU and industry partners manage internship records consistently.</p></div></article><article className="sdg-seventeen"><Image unoptimized src="/sdgs/sdg-17.png" alt="SDG 17: Partnerships for the Goals" width={144} height={144} /><div><h3>Partnerships for the Goals</h3><p>Students, coordinators, and Host Training Establishments collaborate through shared, role-appropriate processes.</p></div></article></div></section>
        <section className="landing-section stakeholders" id="who-uses-praxiz"><span className="eyebrow dark">Who uses PRAXIZ</span><div className="landing-section-heading"><h2>Role-appropriate workspaces, one shared process.</h2></div><div className="stakeholder-grid"><article><UserRound /><strong>Student Intern</strong><p>Records attendance, logs, documents, and progress.</p></article><article><UsersRound /><strong>Internship Coordinator</strong><p>Coordinates placements and program monitoring.</p></article><article><BriefcaseBusiness /><strong>HTE Representative</strong><p>Reviews assigned interns and evaluates performance.</p></article></div></section>
        <ContactSection />
      </main>
      <footer className="landing-footer"><div className="landing-footer-placeholder"><Logo /><span className="landing-footer-credit">© 2026 Partido State University · PRAXIZ. All rights reserved.</span><nav><PublicSectionLink href="/#about">About</PublicSectionLink><PublicSectionLink href="/#sdgs">SDGs</PublicSectionLink><PublicSectionLink href="/#contact">Contact</PublicSectionLink><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link><Link href="/signin">Sign in</Link></nav></div></footer>
    </div>
  );
}

function ContactPage() {
  return <div className="landing contact-page"><PublicHeader /><main><ContactSection /></main><footer className="landing-footer"><div className="landing-footer-placeholder"><Logo /><span className="landing-footer-credit">© 2026 Partido State University · PRAXIZ. All rights reserved.</span><nav><PublicSectionLink href="/#about">About</PublicSectionLink><PublicSectionLink href="/#sdgs">SDGs</PublicSectionLink><Link href="/contact">Contact</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link><Link href="/signin">Sign in</Link></nav></div></footer></div>;
}

function AuthAside({ title, copy, children }: { title: string; copy: string; children?: ReactNode }) {
  return (
    <aside className="auth-aside">
      <ThemeControls compact />
      <Link href="/" className="back-link"><ArrowLeft size={17} /> Back to welcome</Link>
      <Logo />
      <div className="auth-aside-copy"><h1>{title}</h1><p>{copy}</p>{children}</div>
      <div className="security-notes"><span><LockKeyhole size={16} /> Secure PSU authentication</span><span><ShieldCheck size={16} /> Role-based dashboard access</span><span><Activity size={16} /> Verified-data analytics foundation</span></div>
    </aside>
  );
}

function SignInPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(() => typeof window === "undefined" ? "" : localStorage.getItem("praxiz-remembered-email") ?? "");
  const [rememberEmail, setRememberEmail] = useState(() => typeof window !== "undefined" && Boolean(localStorage.getItem("praxiz-remembered-email")));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !password) {
      setError("Enter your email address and password to continue.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (rememberEmail) localStorage.setItem("praxiz-remembered-email", email.trim().toLowerCase());
      else localStorage.removeItem("praxiz-remembered-email");
      const account = await signIn(email, password);
      window.location.href = `/${account.role}/dashboard`;
    } catch (reason) {
      setError(userError(reason, "Sign in was unsuccessful."));
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <AuthAside title="Welcome back." copy="Sign in to access your internship dashboard, submissions, monitoring tools, and updates." />
      <main className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow dark">Secure access</span>
          <h2>Sign in</h2><p className="form-intro">Enter your credentials. PRAXIZ will identify your active role and open the correct workspace automatically.</p>
          <form onSubmit={submit} noValidate>
            <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your registered email" /></label>
            <label className="field"><span>Password <Link href="/forgot-password">Forgot password?</Link></span><span className="password-input"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>
            <label className="remember-row"><input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} /> <span>Remember my email on this device</span></label>
            {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
            <ActionButton type="submit" disabled={loading}>{loading ? "Recognizing account…" : "Sign in to PRAXIZ"}</ActionButton>
          </form>
          <p className="auth-switch">Don’t have an account yet? <Link href="/register">Create an account</Link></p>
          <p className="secure-form-note"><ShieldCheck size={16} aria-hidden="true" /><span>Authentication and role access are verified by Supabase.</span></p>
        </div>
      </main>
    </div>
  );
}

function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (reason) {
      setError(userError(reason, "The reset request could not be sent."));
    } finally {
      setLoading(false);
    }
  }
  return <div className="auth-page"><AuthAside title="Recover access." copy="Request a password reset link for your verified PRAXIZ account." /><main className="auth-main"><div className="auth-form-wrap"><span className="eyebrow dark">Account recovery</span><h2>Forgot password</h2><p className="form-intro">Enter your registered email. Supabase will send a secure reset link if the account exists.</p>{submitted ? <div className="inline-success"><CheckCircle2 /><div><strong>Check your email</strong><p>If the address is registered, its secure password-reset link is on the way.</p></div></div> : <form onSubmit={submit}><label className="field"><span>Email address</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your registered email" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<ActionButton type="submit" disabled={loading}>{loading ? "Sending…" : "Request reset link"}</ActionButton></form>}<p className="auth-switch"><Link href="/signin">Return to sign in</Link></p></div></main></div>;
}

function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await updatePassword(password);
      setComplete(true);
    } catch (reason) {
      setError(userError(reason, "The password could not be updated."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <AuthAside title="Choose a new password." copy="Finish recovering your verified PRAXIZ account securely." />
      <main className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow dark">Account recovery</span>
          <h2>Set new password</h2>
          {complete ? (
            <>
              <div className="inline-success"><CheckCircle2 /><div><strong>Password updated</strong><p>You can now sign in using your new password.</p></div></div>
              <Link className="button button-primary" href="/signin">Continue to sign in</Link>
            </>
          ) : (
            <form onSubmit={submit} noValidate>
              <label className="field"><span>New password</span><span className="password-input"><input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter at least 8 characters" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>
              <label className="field"><span>Confirm new password</span><input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter your new password" /></label>
              {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
              <ActionButton type="submit" disabled={loading}>{loading ? "Updating…" : "Update password"}</ActionButton>
            </form>
          )}
          {!complete && <p className="auth-switch"><Link href="/forgot-password">Request another reset link</Link></p>}
        </div>
      </main>
    </div>
  );
}

type ProgramChoice = { id: string; code: string; name: string };

function ProgramMultiSelect({ options, value, onChange }: { options: ProgramChoice[]; value: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && root.current?.contains(document.activeElement)) {
        event.preventDefault(); setOpen(false); trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  const selected = options.filter((option) => value.includes(option.id));
  const visible = options.filter((option) => `${option.code} ${option.name}`.toLowerCase().includes(search.trim().toLowerCase()));
  function toggle(id: string) { onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]); }
  return <div ref={root} className="program-multiselect">
    <div className="program-selection" role="group" aria-label="Selected programs">
      {selected.length ? selected.map((program) => <span className="program-chip" key={program.id}>{program.code} — {program.name}<button type="button" aria-label={`Remove ${program.code}`} onClick={() => { toggle(program.id); trigger.current?.focus(); }}><X size={13} /></button></span>) : <span className="program-placeholder">Select one or more programs…</span>}
      <button ref={trigger} type="button" disabled={!options.length} className="program-picker-trigger" aria-controls="program-picker-options" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{selected.length ? `${selected.length} program${selected.length === 1 ? "" : "s"} selected` : "Choose programs"}</button>
    </div>
    {open && <div id="program-picker-options" className="program-picker" role="group" aria-label="Choose programs"><label className="program-search" htmlFor="program-search-input"><Search size={16} aria-hidden="true" /><span className="sr-only">Search programs</span><input ref={searchInput} id="program-search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search programs…" /></label><div className="program-options">{visible.map((program) => <label className="program-option" key={program.id}><input aria-label={`${program.code} ${program.name}`} type="checkbox" checked={value.includes(program.id)} onChange={() => toggle(program.id)} /><span><strong>{program.code}</strong><small>{program.name}</small></span></label>)}{visible.length === 0 && <p className="table-empty" role="status">No programs match this search.</p>}</div><button type="button" className="button button-secondary program-picker-done" onClick={close}>Done</button></div>}
    {value.map((id) => <input type="hidden" name="program_ids" value={id} key={id} />)}
    <input type="hidden" name="program_names" value={JSON.stringify(selected.map((program) => `${program.code} — ${program.name}`))} />
  </div>;
}

function RegistrationFields({ role }: { role: RoleId }) {
  const isHte = role === "hte";
  const isStudent = role === "student";
  const hasProgramScope = isStudent || role === "coordinator";
  const [campusId, setCampusId] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [programId, setProgramId] = useState("");
  const [programIds, setProgramIds] = useState<string[]>([]);
  const [registrationOptions, setRegistrationOptions] = useState<Awaited<ReturnType<typeof institutionalService.loadRegistrationInstitutionalOptions>> | null>(null);
  const [institutionalError, setInstitutionalError] = useState("");

  useEffect(() => {
    let active = true;
    void institutionalService.loadRegistrationInstitutionalOptions().then((items) => {
      if (active) setRegistrationOptions(items);
    }).catch(() => {
      if (active) setInstitutionalError("Institutional options could not be loaded. Please try again.");
    });
    return () => { active = false; };
  }, []);

  const campusOptions = registrationOptions?.campuses ?? [];
  const collegeOptions = registrationOptions ? unitsForCampus(registrationOptions.units, campusId).map((unit) => ({ id: unit.id, campusId, name: unit.name, shortName: unit.shortName ?? unit.name })) : [];
  const programOptions = registrationOptions ? programsForCollege(registrationOptions.units, registrationOptions.programs, collegeId).map((program) => ({ id: program.id, collegeId: program.owningOrgUnitId, code: program.code, name: program.name })) : [];

  return <>
    <div className="two-fields"><label className="field"><span>{isHte ? "Organization / company name" : "Full name"} *</span><input required name={isHte ? "organizationName" : "fullName"} placeholder={isHte ? "e.g. TechSouth Philippines, Inc." : "e.g. Maria B. Santos"} /></label><label className="field"><span>{isStudent ? "Student number" : isHte ? "Representative full name" : "Employee number"} *</span><input required name={isStudent ? "studentNumber" : isHte ? "representativeName" : "employeeNumber"} placeholder={isStudent ? "e.g. 2023-00123" : isHte ? "e.g. Allan D. Maraña" : "Enter official identifier"} /></label></div>
    {isHte && <div className="two-fields"><label className="field"><span>Position / title *</span><input required name="position" placeholder="e.g. OJT Supervisor" /></label><label className="field"><span>Contact number *</span><input required name="contactNumber" inputMode="tel" placeholder="e.g. +63 9XX XXX XXXX" /></label></div>}
    <label className="field"><span>{isStudent ? "Institutional email" : "Official email address"} *</span><input required name="email" type="email" autoComplete="email" placeholder={isStudent ? "studentid.pbox@parsu.edu.ph" : "name@organization.edu.ph"} /></label>
    {!isHte && <><div className="two-fields"><label className="field"><span>Campus *</span><select required name="campusId" value={campusId} disabled={!registrationOptions} onChange={(event) => { setCampusId(event.target.value); setCollegeId(""); setProgramId(""); setProgramIds([]); }}><option value="" disabled>{registrationOptions ? "Select campus" : "Loading institutional options..."}</option>{campusOptions.map((campus) => <option key={campus.id} value={campus.id}>{campus.shortName}</option>)}</select></label><label className="field"><span>College / academic unit *</span><select required name="collegeId" value={collegeId} disabled={!campusId} onChange={(event) => { setCollegeId(event.target.value); setProgramId(""); setProgramIds([]); }}><option value="" disabled>Select college or unit</option>{collegeOptions.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}</select></label></div>{hasProgramScope && <div className={isStudent ? "two-fields" : "coordinator-program-field"}><div className="field"><span id="registration-program-label">{isStudent ? "Program / course" : "Programs handled"} *</span>{isStudent ? <select aria-labelledby="registration-program-label" required name="programId" value={programId} disabled={!collegeId} onChange={(event) => setProgramId(event.target.value)}><option value="" disabled>Select program</option>{programOptions.map((program) => <option key={program.id} value={program.id}>{program.code} — {program.name}</option>)}</select> : <ProgramMultiSelect options={programOptions} value={programIds} onChange={setProgramIds} />}</div>{isStudent && <label className="field"><span>Year level *</span><select required name="yearLevel" defaultValue=""><option value="" disabled>Select year level</option><option value="1">First Year</option><option value="2">Second Year</option><option value="3">Third Year</option><option value="4">Fourth Year</option><option value="5">Fifth Year</option></select></label>}</div>}{institutionalError && <p className="form-error"><AlertTriangle size={16} /> {institutionalError}</p>}</>}
    {isHte && <><label className="field"><span>Office address *</span><textarea required name="officeAddress" placeholder="Enter the official business address" /></label><label className="field"><span>Available internship slots *</span><input required name="availableSlots" type="number" min="1" placeholder="e.g. 5" /></label></>}
    <div className="two-fields"><label className="field"><span>Password *</span><input required name="password" type="password" minLength={8} autoComplete="new-password" placeholder="Create a password" /></label><label className="field"><span>Confirm password *</span><input required name="confirmPassword" type="password" minLength={8} autoComplete="new-password" placeholder="Re-enter password" /></label></div>
  </>;
}

function RegisterPage() {
  const { register } = useAuth();
  const [role, setRole] = useState<RoleId | null>(null);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agree || !role) return;
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    const rawFields = Object.fromEntries(
      [...formData.entries()]
        .filter(([key]) => key !== "password" && key !== "confirmPassword")
        .map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), String(value)]),
    );
    const requestedPrograms = formData.getAll("program_ids").map(String).filter(Boolean);
    if (role === "coordinator") {
      if (!requestedPrograms.length) {
        setError("Select at least one program you will handle.");
        return;
      }
      rawFields.program_ids = JSON.stringify([...new Set(requestedPrograms)]);
      rawFields.program_id = requestedPrograms[0];
    }
    const fullName = role === "hte" ? String(formData.get("representativeName") ?? "") : String(formData.get("fullName") ?? "");
    setLoading(true);
    setError("");
    try {
      await register({
        role,
        email: String(formData.get("email") ?? ""),
        password,
        fullName,
        fields: rawFields,
      });
      window.location.href = "/register/success";
    } catch (reason) {
      setError(userError(reason, "Registration could not be submitted."));
      setLoading(false);
    }
  }
  return (
    <div className="auth-page registration-page">
      <AuthAside title={role ? `${roles[role].label} registration` : "Create an account"} copy={role ? "Provide your official information below. A system administrator will verify your account before activation." : "Choose the role that matches your responsibility in the internship program."}>
        <div className="role-stack">{roleOptions.map((option) => <button key={option.id} className={`role-choice ${role === option.id ? "selected" : ""}`} onClick={() => setRole(option.id)}><span className={`role-dot role-${option.id}`}>{option.short}</span><span><strong>{option.title}</strong><small>{option.caption}</small></span>{role === option.id && <Check size={18} />}</button>)}</div>
      </AuthAside>
      <main className="auth-main registration-main">
        <div className="registration-wrap">
          <span className="eyebrow dark">Account verification</span><h2>Create account</h2><p className="form-intro">Select your role, then fill in your registration details.</p>
          {!role ? <div className="role-empty"><UsersRound size={34} /><h3>Select a role to begin</h3><p>Each stakeholder receives a form and access level tailored to their responsibility.</p></div> : <form className="registration-form" onSubmit={submit}><div className="form-card-heading"><span className={`role-dot role-${role}`}>{roleOptions.find((r) => r.id === role)?.short}</span><span><strong>{roles[role].label} registration</strong><small>Fields marked * are required for verification</small></span></div><RegistrationFields role={role} /><div className="consent"><input id="registration-consent" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><label htmlFor="registration-consent">I confirm the information is accurate and agree to PRAXIZ’s <Link href="/terms" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Terms of Service<span className="sr-only"> (opens in a new tab)</span></Link> and <Link href="/privacy" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Privacy Policy<span className="sr-only"> (opens in a new tab)</span></Link>.</label></div>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<ActionButton type="submit" disabled={!agree || loading}>{loading ? "Creating secure account…" : "Submit registration"}</ActionButton></form>}
          <p className="auth-switch">Already have an account? <Link href="/signin">Sign in here</Link></p>
        </div>
      </main>
    </div>
  );
}

function RegistrationSuccessPage() {
  return <div className="success-page"><PublicHeader /><main><span className="success-icon"><Check size={42} /></span><span className="eyebrow dark">Application received</span><h1>Registration submitted</h1><p>Your PRAXIZ account registration is ready for administrator review. You’ll receive a confirmation through your registered email after activation.</p><Link className="button button-primary button-large" href="/signin">Back to sign in</Link><Link className="text-link" href="/">Return to welcome page</Link></main></div>;
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="page-actions">{action}</div>}</div>;
}

function AppShell({ role, page, children }: { role: RoleId; page: string; children: ReactNode }) {
  const { signOut, user } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [notificationError, setNotificationError] = useState("");
  const [markingRead, setMarkingRead] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const bellTrigger = useRef<HTMLButtonElement>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [shellNotifications, setShellNotifications] = useState<NotificationRecord[]>([]);
  const current = roles[role];
  const visibleNavigation = current.nav.filter((item) => !['Notifications', 'System Settings', 'Profile'].includes(item.label) && (!item.permission || hasPermission(role, item.permission)));
  const active = visibleNavigation.find((item) => item.href.endsWith(`/${page}`));
  const title = active?.label ?? ({ settings: 'Settings', profile: 'Profile', notifications: 'Notifications' }[page] ?? 'Dashboard');
  const displayName = user?.fullName ?? current.user;

  function expandSidebar() { if (collapseTimer.current) clearTimeout(collapseTimer.current); setExpanded(true); }
  function collapseSidebar() { collapseTimer.current = setTimeout(() => { if (!sidebarRef.current?.contains(document.activeElement)) setExpanded(false); }, 180); }
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.sidebar-account, .popover-wrap')) { setMenu(false); setBellOpen(false); } };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenu(false); setBellOpen(false); setMobileNav(false); if (mobileNav) document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus(); else if (menu) menuTrigger.current?.focus(); else if (bellOpen) bellTrigger.current?.focus(); }
      if (event.key === 'Tab' && mobileNav) {
        const controls = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
        const first = controls?.[0]; const last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    if (mobileNav) sidebarRef.current?.querySelector<HTMLElement>('a')?.focus();
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [mobileNav, menu, bellOpen]);
  useEffect(() => () => { if (collapseTimer.current) clearTimeout(collapseTimer.current); }, []);
  useEffect(() => { if (menu) accountMenuRef.current?.querySelector<HTMLElement>('a,button')?.focus(); }, [menu]);
  function accountMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Tab') { event.preventDefault(); setMenu(false); if (event.shiftKey) menuTrigger.current?.focus(); else document.querySelector<HTMLElement>('.header-actions button')?.focus(); return; }
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next !== undefined) { event.preventDefault(); items[next]?.focus(); }
  }
  const unread = shellNotifications.filter((item) => item.unread).length;
  useEffect(() => {
    let activeRequest = true;
    if (user) {
      void notificationService.listLive().then((items) => {
        if (activeRequest) setShellNotifications(items);
      }).catch(() => { if (activeRequest) setNotificationError('Notifications could not be loaded. Open all notifications to retry.'); });
    }
    return () => { activeRequest = false; };
  }, [user]);
  async function markShellNotificationsRead() {
    if (markingRead) return;
    setMarkingRead(true); setNotificationError('');
    try {
      await notificationService.markAllRead();
      setShellNotifications(shellNotifications.map((item) => ({ ...item, unread: false })));
    } catch { setNotificationError('Could not mark notifications as read. Please try again.'); }
    finally { setMarkingRead(false); }
  }
  return (
    <div className="app-shell">
      <aside ref={sidebarRef} className={`sidebar ${mobileNav ? "sidebar-open" : ""} ${expanded ? 'sidebar-expanded' : ''}`} onPointerEnter={expandSidebar} onPointerLeave={collapseSidebar} onFocusCapture={expandSidebar} onBlurCapture={collapseSidebar}>
        <div className="sidebar-top"><Link href={`/${role}/dashboard`}><Logo /></Link><button className="sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={20} /></button></div>
        <div className="role-label">{current.label}</div>
        <nav className="side-nav" aria-label={`${current.label} navigation`}>{visibleNavigation.map((item) => { const Icon = iconMap[item.icon] ?? Gauge; const selected = item.href.endsWith(`/${page}`); return <Link className={selected ? "active" : ""} href={item.href} key={item.href} title={item.label} aria-label={item.label} aria-current={selected ? 'page' : undefined}><Icon size={20} /><span>{item.label}</span></Link>; })}</nav>
        <div className="sidebar-account"><button ref={menuTrigger} className="sidebar-user" onClick={() => setMenu(!menu)} aria-label={`Account menu for ${displayName}`} aria-expanded={menu} aria-controls={menu ? "account-menu" : undefined} aria-haspopup="menu"><ProfileAvatar name={displayName} path={user?.avatarPath} /><span className="sidebar-identity"><strong>{displayName}</strong><small>{current.label}</small></span><Ellipsis className="account-ellipsis" size={20} /></button>{menu && <div id="account-menu" tabIndex={-1} role="menu" aria-label="Account" ref={accountMenuRef} className="header-popover sidebar-account-menu" onKeyDown={accountMenuKeyDown} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== menuTrigger.current) setMenu(false); }}>{user?.roles.filter(availableRole => availableRole !== role).map(availableRole => <Link role="menuitem" tabIndex={-1} href={`/${availableRole}/dashboard`} key={availableRole}><ShieldCheck size={17} />{roles[availableRole].label} workspace</Link>)}<Link role="menuitem" tabIndex={-1} href={`/${role}/profile`}><UserRound size={17} />Profile</Link><Link role="menuitem" tabIndex={-1} href={`/${role}/settings`}><Settings size={17} />Settings</Link><hr /><button role="menuitem" tabIndex={-1} className="account-signout" disabled={signingOut} onClick={() => { if (signingOut) return; setSigningOut(true); void signOut().then(() => { window.location.href = '/signin'; }).catch(() => { setNotificationError('Sign out failed. Please try again.'); setSigningOut(false); }); }}><LogOut size={17} aria-hidden="true" />{signingOut ? 'Signing out…' : 'Sign out'}</button></div>}</div>
      </aside>
      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <section className="app-area">
        <header className="app-header">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="crumb"><strong>{title}</strong><small>PRAXIZ <ChevronRight size={12} /> {title}</small></div>
          <div className="header-actions">
            <ThemeControls compact />
            <div className="popover-wrap"><button ref={bellTrigger} className="icon-button" aria-expanded={bellOpen} aria-label={`${unread} unread notifications`} onClick={() => setBellOpen(!bellOpen)}><Bell size={21} />{unread > 0 && <b>{unread}</b>}</button>{bellOpen && <div className="header-popover notification-popover"><strong>Notifications</strong>{shellNotifications.slice(0, 3).map((item) => <Link href={item.targetPath ?? `/${role}/notifications`} key={item.id}><Bell size={16} /><span><b>{item.title}</b><small>{item.unread ? 'Unread · ' : 'Read · '}{item.time}</small></span></Link>)}{shellNotifications.length === 0 && !notificationError && <small>No notifications yet.</small>}{notificationError && <p role="alert" className="form-error">{notificationError}</p>}{unread > 0 && <button disabled={markingRead} onClick={() => { void markShellNotificationsRead(); }}>{markingRead ? 'Updating…' : 'Mark all as read'}</button>}<Link href={`/${role}/notifications`}><Eye size={16} />View all notifications</Link></div>}</div>
          </div>
        </header>
                <main className="app-main">{children}</main>
      </section>

      <PraxizAiAssistant />
    </div>
  );
}

function EmptyAction({ icon: Icon, title, copy, action }: { icon: LucideIcon; title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-action"><span><Icon size={26} /></span><h3>{title}</h3><p>{copy}</p>{action}</div>;
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, busy = false }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return <Dialog title={title} onClose={onCancel} busy={busy}><p>{message}</p><div className="modal-actions"><ActionButton variant="secondary" disabled={busy} onClick={onCancel}>Cancel</ActionButton><ActionButton disabled={busy} onClick={onConfirm}>{confirmLabel}</ActionButton></div></Dialog>;
}

function StudentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<StudentProgressSummary | null>(null);
  const [recent, setRecent] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
   useEffect(() => {
    let activeRequest = true;
    void Promise.all([internshipService.getStudentProgress(), notificationService.listLive()]).then(([summary, notifications]) => {
      if (!activeRequest) return;
      setData(summary);
      setRecent(notifications.slice(0, 5));
    }).catch((reason) => {
      if (activeRequest) setError(userError(reason, "Your internship dashboard could not be loaded."));
    }).finally(() => {
      if (activeRequest) setLoading(false);
    });
    return () => { activeRequest = false; };
  }, []);
  if (loading) return <><PageHeader title={`Good day, ${user?.fullName ?? "Student Intern"}`} subtitle="Loading your verified internship progress…" /><EmptyAction icon={Clock3} title="Loading live progress" copy="PRAXIZ is reading your authorized assignment, attendance, logs, and requirements from Supabase." /></>;
  if (!data) return <><PageHeader title={`Good day, ${user?.fullName ?? "Student Intern"}`} subtitle="Your secure student workspace is ready." />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<EmptyAction icon={BriefcaseBusiness} title="No active internship assignment" copy="Your coordinator must create or approve an internship assignment before progress can be tracked." /></>;
  const hoursPercent = data.requiredHours ? Math.min(100, Math.round((data.renderedHours / data.requiredHours) * 100)) : 0;
  const logsPercent = data.logsExpected ? Math.min(100, Math.round((data.logsSubmitted / data.logsExpected) * 100)) : 0;
  const hasDocumentRequirements = data.documentsRequired > 0;
  const documentPercent = hasDocumentRequirements ? Math.round((data.documentsApproved / data.documentsRequired) * 100) : 0;
  const remainingHours = Math.max(0, data.requiredHours - data.renderedHours);
  return <><PageHeader title={`Good day, ${user?.fullName ?? "Student Intern"}`} subtitle="Here is an overview of your verified internship progress." />
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="stats-grid four"><StatCard label="Rendered hours" value={String(data.renderedHours)} detail={`/ ${data.requiredHours} verified hours`} icon={Clock3} progress={hoursPercent} /><StatCard label="Attendance rate" value={`${data.attendanceRate}%`} detail={`${data.verifiedSessions} of ${data.recordedSessions} sessions verified`} icon={CalendarCheck2} tone="green" progress={data.attendanceRate} /><StatCard label="Daily logs" value={String(data.logsSubmitted)} detail={`${data.logsApproved} approved`} icon={FileText} tone="orange" progress={logsPercent} /><StatCard label="Document compliance" value={hasDocumentRequirements ? `${documentPercent}%` : "Not configured"} detail={hasDocumentRequirements ? `${data.documentsApproved} of ${data.documentsRequired} approved` : "No requirements assigned"} icon={FileCheck2} tone="violet" progress={documentPercent} /></div>
    <div className="dashboard-grid"><div className="dashboard-main-col"><section className="card progress-card"><div className="card-title"><h2>Internship progress</h2><StatusBadge status={data.status} /></div><div className="metric-row"><span>{data.renderedHours} of {data.requiredHours} verified hours</span><strong>{hoursPercent}% of required hours</strong></div><ProgressBar value={hoursPercent} /><p className="muted-note">{remainingHours} verified hours remain. Pending attendance will not count until it is reviewed.</p></section>
      <section className="card"><h2>Quick actions</h2><div className="quick-actions"><Link className="quick-action-primary" href="/student/attendance"><Clock3 /> Time In / Time Out</Link><Link href="/student/daily-logs"><FileText /> Add daily log</Link><Link href="/student/documents"><Upload /> Upload document</Link><Link href="/student/progress"><LineChart /> View progress</Link></div></section>
      <section className="card"><h2>Recent updates</h2><div className="activity-list">{recent.map((item) => <div className="activity-row" key={item.id}><span><strong>{item.title}</strong><small>{item.message}</small></span><span><small>{item.time}</small><StatusBadge status={item.unread ? "Unread" : "Read"} /></span></div>)}{recent.length === 0 && <p className="muted-note">No updates have been sent to your account yet.</p>}</div></section></div>
      <aside className="dashboard-side-col"><section className="card"><h2>Internship information</h2><dl className="info-list"><div><dt>Campus</dt><dd>{user?.campus ?? data.campus}</dd></div><div><dt>Program</dt><dd>{user?.academicProgram ?? data.program}</dd></div><div><dt>Host training establishment</dt><dd>{data.hte}</dd></div><div><dt>Internship coordinator</dt><dd>{data.coordinator}</dd></div><div><dt>Period</dt><dd>{data.startDate} – {data.endDate}</dd></div><div><dt>Required hours</dt><dd>{data.requiredHours} hours</dd></div></dl></section><section className="card"><h2>Requirement status</h2>{data.requirements.length > 0 ? <ul className="check-list">{data.requirements.map((requirement) => <li className={requirement.complete ? "" : "pending"} key={requirement.name}>{requirement.complete ? <Check /> : <Clock3 />} {requirement.name}<small>{requirement.status}</small></li>)}</ul> : <p className="muted-note">No requirements configured for this assignment.</p>}<div className="metric-row small"><span>{hasDocumentRequirements ? `${data.documentsApproved} of ${data.documentsRequired} requirements` : "No requirements configured"}</span><strong>{hasDocumentRequirements ? `${documentPercent}%` : "Not configured"}</strong></div><ProgressBar value={documentPercent} tone="green" /></section></aside></div></>;
}

function HteDashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Intern[]>([]);
  const [logs, setLogs] = useState<DailyLogRecord[]>([]);
  const [evaluationRows, setEvaluationRows] = useState<EvaluationRecord[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceHistoryRow[]>([]);
  const [error, setError] = useState("");
     useEffect(() => {
    let active = true;
    void Promise.all([internshipService.listLiveInterns(), dailyLogService.listLive(), evaluationService.listLive(), attendanceService.listLiveHistory()]).then(([internRows, logRows, liveEvaluations, liveAttendance]) => {
      if (!active) return;
      setRows(internRows);
      setLogs(logRows);
      setEvaluationRows(liveEvaluations);
      setAttendanceRows(liveAttendance);
    }).catch((reason) => {
      if (active) setError(userError(reason, "The supervision dashboard could not be loaded."));
    });
    return () => { active = false; };
  }, []);
  const pendingLogs = logs.filter((log) => log.status === "Submitted");
  const pendingEvaluations = evaluationRows.filter((evaluation) => evaluation.status === "Draft" || evaluation.status === "Submitted").length;
  const attendanceAwaiting = attendanceRows.filter((row) => row.status === "Pending Verification").length;
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  return <><PageHeader title={`Good day, ${user?.fullName ?? "HTE Representative"}`} subtitle="Authorized host training establishment representative portal." />
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="stats-grid four"><StatCard label="Assigned interns" value={String(rows.length)} icon={UsersRound} /><StatCard label="Attendance awaiting" value={String(attendanceAwaiting)} icon={Clock3} tone="orange" /><StatCard label="Open evaluations" value={String(pendingEvaluations)} icon={Star} tone="violet" /><StatCard label="Verified hours" value={String(totalHours)} icon={Gauge} tone="green" /></div>
    <div className="dashboard-grid"><section className="card table-card"><div className="card-title"><h2>Assigned interns</h2><Link className="text-link" href="/hte/interns">View all</Link></div><InternTable rows={rows.slice(0, 5)} compact />{rows.length === 0 && <p className="muted-note">No interns are currently assigned within your authorized scope.</p>}</section><aside className="card"><div className="card-title"><h2>Pending log reviews</h2><Link className="text-link" href="/hte/logs">Open queue</Link></div><div className="review-list">{pendingLogs.slice(0, 4).map((log) => <article key={log.id}><div><strong>Daily log</strong><small>{log.studentName} · {log.week}</small><small>{log.date}</small></div><StatusBadge status={log.status} /><div className="mini-actions"><Link href="/hte/logs">Review</Link></div></article>)}{pendingLogs.length === 0 && <p className="muted-note">No submitted logs are waiting for review.</p>}</div></aside></div></>;
}

function CoordinatorDashboard() {
  const { user } = useAuth();
  const [compliance, setCompliance] = useState<ReturnType<typeof summarizeCompliance> | null>(null);
  const [rows, setRows] = useState<Intern[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([internshipService.listCoordinatorInterns(), documentService.complianceSummary()]).then(([records, summaries]) => {
      if (active) { setRows(records); setCompliance(summarizeCompliance(summaries)); }
    }).catch((reason) => {
      if (active) setError(userError(reason, "The coordinator dashboard could not be loaded."));
    });
    return () => { active = false; };
  }, []);
  const totalInterns = rows.length;
  const awaitingAssignment = rows.filter((intern) => intern.status === "Awaiting Assignment").length;
  const activeInterns = rows.filter((intern) => intern.status === "Active" || intern.status === "Needs Attention").length;
  const completedInterns = rows.filter((intern) => intern.status === "Completed").length;
  const assignedRows = rows.filter((intern) => intern.status !== "Awaiting Assignment");
  const partnerHtes = new Set(assignedRows.map((intern) => intern.hte).filter((hte) => hte !== "Not assigned")).size;
  const averageAttendance = assignedRows.length ? Math.round(assignedRows.reduce((sum, row) => sum + row.attendance, 0) / assignedRows.length) : 0;
  const hteCounts = [...assignedRows.reduce((counts, intern) => counts.set(intern.hte, (counts.get(intern.hte) ?? 0) + 1), new Map<string, number>()).entries()].sort((left, right) => right[1] - left[1]);
  const maxHteCount = Math.max(1, ...hteCounts.map(([, count]) => count));
  const attentionRows = rows.filter((intern) => {
    const [approved = 0, required = 0] = intern.requirements.split("/").map(Number);
    return intern.status === "Needs Attention" || approved < required;
  });
  return <><PageHeader title={`Good day, ${user?.fullName ?? "Internship Coordinator"}`} subtitle="Live internship overview for your authorized academic-program scope." />
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="stats-grid five"><StatCard label="Program students" value={String(totalInterns)} detail="matched by academic program" icon={UsersRound} /><StatCard label="Awaiting assignment" value={String(awaitingAssignment)} detail="registered without a placement" icon={Clock3} tone="orange" /><StatCard label="Active interns" value={String(activeInterns)} detail={totalInterns ? `${Math.round(activeInterns / totalInterns * 100)}% of program students` : "No students yet"} icon={CheckCircle2} /><StatCard label="Completed" value={String(completedInterns)} detail={totalInterns ? `${Math.round(completedInterns / totalInterns * 100)}% completed` : "No students yet"} icon={GraduationCap} tone="green" /><StatCard label="Partner HTEs" value={String(partnerHtes)} detail="with visible assignments" icon={BriefcaseBusiness} tone="violet" /></div>
    <div className="chart-grid"><section className="card"><h2>Portfolio attendance verification</h2><div className="progress-card"><div className="metric-row"><span>Average verified-session rate</span><strong>{averageAttendance}%</strong></div><ProgressBar value={averageAttendance} /><p className="muted-note">Calculated from the attendance sessions visible within your coordinator scope.</p></div></section><section className="card donut-card"><h2>Document compliance</h2>{compliance ? <><div className="donut" role="img" aria-label={`${compliance.total} required documents: ${compliance.complete} complete, ${compliance.pending} pending review, ${compliance.missing} missing or needing correction`} style={{ background: compliance.background }}><strong>{compliance.total}<small>required documents</small></strong></div><ul className="legend"><li><i className="green" />Complete <b>{compliance.complete}</b></li><li><i className="orange" />Pending review <b>{compliance.pending}</b></li><li><i className="red" />Missing / correction needed <b>{compliance.missing}</b></li></ul>{compliance.total === 0 && <p className="muted-note">No required documents are configured in your assignment scope.</p>}<p className="muted-note">All authorized assignments and terms. Optional documents excluded; waived requirements count as satisfied.</p></> : <p role="status">{error ? "Compliance data unavailable." : "Loading compliance…"}</p>}</section></div>
    <section className="card hte-bars-card"><h2>Interns by host training establishment</h2><div className="horizontal-bars">{hteCounts.map(([label, value]) => <div key={label}><span>{label}</span><b style={{ width: `${value / maxHteCount * 100}%` }} /><em>{value}</em></div>)}{hteCounts.length === 0 && <p className="muted-note">No HTE assignments are visible yet.</p>}</div></section>
    <section className="card table-card"><div className="card-title"><h2>Interns needing attention</h2><Link className="text-link" href="/coordinator/interns">Open monitoring</Link></div><InternTable rows={attentionRows.slice(0, 6)} />{attentionRows.length === 0 && <p className="muted-note">No interns currently meet the follow-up criteria.</p>}</section></>;
}

function AdminDashboard() {
  const [data, setData] = useState({ activeAccounts: 0, pendingRegistrations: 0, roleAssignments: 0, securityEvents: 0 });
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void adminService.getSummary().then((summary) => {
      if (active) setData(summary);
    }).catch((reason) => {
      if (active) setError(userError(reason, "Administrative totals could not be loaded."));
    });
    return () => { active = false; };
  }, []);
  return <><PageHeader title="System administration" subtitle="Manage access, registrations, institutional master data, and system activity." action={<Link className="button button-primary" href="/admin/registrations"><UserCheck size={18} /> Review registrations</Link>} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="stats-grid four"><StatCard label="Active accounts" value={String(data.activeAccounts)} detail="live Supabase profiles" icon={UsersRound} /><StatCard label="Pending registrations" value={String(data.pendingRegistrations)} icon={Clock3} tone="orange" /><StatCard label="Role assignments" value={String(data.roleAssignments)} detail="active scopes" icon={ShieldCheck} tone="green" /><StatCard label="Audit events" value={String(data.securityEvents)} detail="last 24 hours" icon={LockKeyhole} tone="violet" /></div><div className="dashboard-grid"><section className="card table-card"><h2>Pending registrations</h2><RegistrationTable /></section><aside className="card admin-controls"><h2>Administration controls</h2><p className="muted-note">Review role policies, permissions, and recent system activity.</p><div className="admin-control-links"><Link href="/admin/roles"><ShieldCheck size={20} aria-hidden="true" /><span><strong>Roles & permissions</strong><small>Review current access policies</small></span><ChevronRight size={18} aria-hidden="true" /></Link><Link href="/admin/audit-logs"><FileText size={20} aria-hidden="true" /><span><strong>Audit history</strong><small>Inspect recent system activity</small></span><ChevronRight size={18} aria-hidden="true" /></Link></div></aside></div></>;
}

function InternTable({ rows, compact = false, onView, emptyMessage }: { rows: Intern[]; compact?: boolean; onView?: (intern: Intern) => void; emptyMessage?: string }) {
  return <div className="table-scroll"><table className={`data-table ${compact ? "compact-table" : ""}`}><thead><tr><th>Student</th>{!compact && <th>Campus</th>}{!compact && <th>Program</th>}<th>HTE</th>{!compact && <th>HTE representative</th>}<th>Hours</th><th>Attendance</th>{!compact && <th>Requirements</th>}<th>Status</th>{onView && <th>Actions</th>}</tr></thead><tbody>{rows.map((intern) => { const requiredHours = intern.requiredHours ?? 0; const awaitingAssignment = intern.status === "Awaiting Assignment"; return <tr key={intern.studentUserId ?? intern.name}><td><span className="person-cell"><i>{intern.initials}</i><b>{intern.name}</b></span></td>{!compact && <td>{intern.campus}</td>}{!compact && <td>{intern.program}</td>}<td>{intern.hte}</td>{!compact && <td>{intern.hteRepresentative}</td>}<td>{awaitingAssignment ? "—" : <span className="hours-cell">{intern.hours}/{requiredHours}<ProgressBar value={requiredHours ? Math.min(100, intern.hours / requiredHours * 100) : 0} /></span>}</td><td>{awaitingAssignment ? "—" : `${intern.attendance}%`}</td>{!compact && <td>{awaitingAssignment ? "—" : intern.requirements}</td>}<td><StatusBadge status={intern.status} /></td>{onView && <td className="table-actions"><button className="table-link" disabled={!intern.studentUserId} onClick={() => onView(intern)} aria-label={`View intern record for ${intern.name}`}><Eye size={16} aria-hidden="true" />View</button></td>}</tr>; })}{rows.length === 0 && emptyMessage && <tr><td colSpan={(compact ? 5 : 9) + (onView ? 1 : 0)} className="table-empty"><p role="status">{emptyMessage}</p></td></tr>}</tbody></table></div>;
}

function AttendanceReviewDialog({ record, close, onSaved }: { record: AttendanceHistoryRow; close: () => void; onSaved: () => void }) {
  const [remarks, setRemarks] = useState(record.remarks === "—" ? "" : record.remarks);
  const [confirmation, setConfirmation] = useState<"verified" | "flagged" | "rejected" | null>(null);
  const lock = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision: "verified" | "flagged" | "rejected") {
    if (lock.current || (decision !== "verified" && !remarks.trim())) return;
    lock.current = true;
    setLoading(true);
    setError("");
    try {
      await attendanceService.review(record.id, decision, remarks);
      onSaved();
    } catch (reason) {
      setError(userError(reason, "The attendance decision could not be saved."));
    } finally { lock.current = false; setLoading(false); setConfirmation(null); }
  }
  return <Dialog title="Review attendance session" onClose={close} busy={loading} wide><InfoCallout icon={ShieldCheck}><p><strong>{record.studentName}</strong> · {record.date}</p></InfoCallout><div className="readonly-event-grid"><div><span>Time In</span><strong>{record.timeIn}</strong><small>Original event · read-only</small></div><div><span>Time Out</span><strong>{record.timeOut}</strong><small>Original event · read-only</small></div></div><label className="field"><span>Verification remarks</span><textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Add the basis for your review decision…" /></label><p className="form-hint">A reason is required when flagging or rejecting a session.</p>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions review-actions"><ActionButton variant="secondary" disabled={loading} icon={Check} onClick={() => setConfirmation("verified")}>Verify</ActionButton><ActionButton variant="secondary" disabled={loading || !remarks.trim()} icon={Flag} onClick={() => setConfirmation("flagged")}>Flag</ActionButton><ActionButton variant="danger" disabled={loading || !remarks.trim()} icon={X} onClick={() => setConfirmation("rejected")}>Reject</ActionButton></div>{confirmation && <Dialog title={`${confirmation === "verified" ? "Verify" : confirmation === "flagged" ? "Flag" : "Reject"} this attendance session?`} onClose={() => setConfirmation(null)} busy={loading} protectChanges={false}><p>{record.studentName} · {record.date}</p><p>{confirmation === "verified" ? "This session will count toward verified internship hours." : "This session will not count toward verified internship hours until an authorized review resolves it."} The original timestamps and review history are retained.</p><div className="modal-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => setConfirmation(null)}>Keep reviewing</ActionButton><ActionButton disabled={loading} onClick={() => void decide(confirmation)}>{loading ? "Saving…" : confirmation === "verified" ? "Verify session" : confirmation === "flagged" ? "Flag session" : "Reject session"}</ActionButton></div></Dialog>}</Dialog>;
}

function AttendancePage({ role }: { role: RoleId }) {
  const student = role === "student";
  const hte = role === "hte";
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [attendanceRows, setAttendanceRows] = useState(attendanceRecords);
  const [confirmTimeIn, setConfirmTimeIn] = useState(false);
  const [attendanceSuccess, setAttendanceSuccess] = useState("");
  const [historyStudent, setHistoryStudent] = useState<{ id: string; name: string } | null>(null);
  const attendanceLock = useRef(false);
  const [confirmTimeOut, setConfirmTimeOut] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState("");
  const [selectedReview, setSelectedReview] = useState<AttendanceHistoryRow | null>(null);
  const [progress, setProgress] = useState<StudentProgressSummary | null>(null);
  const renderedHours = progress?.renderedHours ?? 0;
  const requiredHours = progress?.requiredHours ?? 0;
  const hoursPercent = requiredHours ? Math.min(100, Math.round((renderedHours / requiredHours) * 100)) : 0;
  const remainingHours = Math.max(0, requiredHours - renderedHours);

  useEffect(() => {
    let active = true;
    const request = student
      ? Promise.all([attendanceService.getTodaySession(), attendanceService.listLiveHistory()])
      : Promise.all([Promise.resolve(null), attendanceService.listLiveHistory()]);
    void request.then(([session, rows]) => {
      if (!active) return;
      setCurrentSession(session);
      setAttendanceRows(rows);
    }).catch((reason) => {
      if (active) setAttendanceError(userError(reason, "Attendance could not be loaded."));
    }).finally(() => {
      if (active) setAttendanceLoading(false);
    });
    return () => { active = false; };
  }, [student]);

  useEffect(() => {
    if (!student) return;
    let active = true;
    void internshipService.getStudentProgress().then((summary) => {
      if (active) setProgress(summary);
    }).catch((reason) => {
      if (active) setAttendanceError(userError(reason, "Progress totals could not be loaded."));
    });
    return () => { active = false; };
  }, [student]);

  async function recordTimeIn() {
    if (attendanceLock.current) return;
    attendanceLock.current = true;
    setAttendanceLoading(true);
    setAttendanceError("");
    try {
      const session = await attendanceService.timeIn();
      setCurrentSession(session);
      setConfirmTimeIn(false);
      setAttendanceSuccess(`Time In recorded: ${formatTimestamp(session.timeIn.occurredAt)}`);
      setAttendanceRows(await attendanceService.listLiveHistory());
    } catch (reason) {
      setAttendanceError(userError(reason, "Time In could not be recorded."));
    } finally {
      attendanceLock.current = false;
      setAttendanceLoading(false);
    }
  }

  async function recordTimeOut() {
    if (!currentSession || attendanceLock.current) return;
    attendanceLock.current = true;
    setAttendanceLoading(true);
    setAttendanceError("");
    try {
      const session = await attendanceService.timeOut(currentSession);
      setCurrentSession(session);
      setAttendanceSuccess(`Time Out recorded: ${formatTimestamp(session.timeOut!.occurredAt)}`);
      setAttendanceRows(await attendanceService.listLiveHistory());
      setConfirmTimeOut(false);
    } catch (reason) {
      setAttendanceError(userError(reason, "Time Out could not be recorded."));
    } finally {
      attendanceLock.current = false;
      setAttendanceLoading(false);
    }
  }

  async function refreshAttendance() {
    setAttendanceLoading(true);
    setAttendanceError("");
    try {
      setAttendanceRows(await attendanceService.listLiveHistory());
      setSelectedReview(null);
    } catch (reason) {
      setAttendanceError(userError(reason, "Attendance could not be refreshed."));
    } finally {
      attendanceLock.current = false;
      setAttendanceLoading(false);
    }
  }

  function exportAttendanceCsv() {
    const escape = (value: string) => `"${(/^[=+\-@]/.test(value) ? "'" : "")}${value.replaceAll('"', '""')}"`;
    const header = ["Student", "Date", "Day", "Time In", "Time Out", "Verified Hours", "Status", "Verified By", "Remarks"];
    const rows = attendanceRows.map((record) => [record.studentName, record.date, record.day, record.timeIn, record.timeOut, record.hours, record.status, record.verifiedBy, record.remarks]);
    const blob = new Blob([[header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `praxiz-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <><PageHeader title={student ? "Attendance" : hte ? "Attendance verification" : "Attendance monitoring"} subtitle={student ? "Record immutable Time In and Time Out events and follow their verification status." : "Review attendance sessions without changing the original event timestamps."} />
    {attendanceSuccess && <p className="inline-success" role="status">{attendanceSuccess}</p>}{attendanceError && <p className="form-error"><AlertTriangle size={16} /> {attendanceError}</p>}
    {student ? <><section className={`attendance-action-card card ${currentSession?.status === "Active" ? "session-active" : ""}`}><div className="attendance-action-copy"><span className="eyebrow dark">Today’s attendance session</span><h2>{!currentSession ? "Ready to record Time In" : currentSession.status === "Active" ? "Attendance session active" : "Attendance submitted for verification"}</h2><p>{!currentSession ? "Press Time In when you begin work at your assigned HTE. Supabase will record the authoritative server timestamp." : currentSession.status === "Active" ? "Your original Time In event is locked. Press Time Out only when your work session ends." : "Both original events are locked. Verified hours will be added to progress only after an authorized reviewer confirms this session."}</p><div className="integrity-note"><ShieldCheck size={18} /><span>Attendance timestamps cannot be typed or edited. They are generated and protected by the PRAXIZ database.</span></div></div><div className="attendance-action-panel">{!currentSession ? <><Clock3 size={32} /><strong>{attendanceLoading ? "Checking today’s session…" : "No active session"}</strong><ActionButton icon={Clock3} disabled={attendanceLoading || !progress} onClick={() => setConfirmTimeIn(true)}>{attendanceLoading ? "Please wait…" : "Time In"}</ActionButton></> : <><StatusBadge status={currentSession.status} /><dl><div><dt>Time In</dt><dd>{formatTimestamp(currentSession.timeIn.occurredAt)}</dd></div><div><dt>Time Out</dt><dd>{currentSession.timeOut ? formatTimestamp(currentSession.timeOut.occurredAt) : "Not recorded"}</dd></div></dl>{currentSession.status === "Active" && <ActionButton icon={Clock3} disabled={attendanceLoading} onClick={() => setConfirmTimeOut(true)}>Time Out</ActionButton>}{currentSession.status === "Pending Verification" && <span className="pending-copy"><Clock3 size={17} /> Awaiting authorized review</span>}</>}</div></section><section className="card hours-overview"><div><strong>{renderedHours} hrs</strong><span>Verified rendered hours</span></div><div><strong>{requiredHours} hrs</strong><span>Required internship hours</span></div><div><strong className="orange-text">{remainingHours} hrs</strong><span>Remaining verified hours</span></div><div className="hours-progress"><div className="metric-row"><span>{renderedHours} of {requiredHours} verified hours</span><strong>{hoursPercent}%</strong></div><ProgressBar value={hoursPercent} /></div></section><div className="stats-grid three"><StatCard label="Attendance rate" value={`${progress?.attendanceRate ?? 0}%`} icon={CalendarCheck2} /><StatCard label="Recorded sessions" value={String(attendanceRows.length)} detail="loaded from Supabase" icon={CheckCircle2} tone="green" /><StatCard label="Timestamp source" value="Server" icon={Clock3} tone="violet" /></div></> : <><div className="verification-principle"><ShieldCheck size={20} /><p><strong>Original event protection:</strong> reviewers may verify, flag, or reject a session and add remarks. Time In and Time Out values are read-only.</p></div><div className="stats-grid three"><StatCard label="Visible sessions" value={String(attendanceRows.length)} icon={Clock3} tone="orange" /><StatCard label="Verified" value={String(attendanceRows.filter((row) => row.status === "Verified").length)} icon={CheckCircle2} tone="green" /><StatCard label="Flagged or rejected" value={String(attendanceRows.filter((row) => row.status === "Flagged" || row.status === "Rejected").length)} icon={AlertTriangle} tone="red" /></div></>}
    <section className="card table-card"><div className="card-title"><h2>{student ? "Attendance history" : "Sessions for review"}</h2><div className="inline-actions"><ActionButton variant="secondary" icon={Download} disabled={attendanceRows.length === 0} onClick={exportAttendanceCsv}>Export CSV</ActionButton></div></div><div className="table-scroll"><table className="data-table"><thead><tr>{!student && <th>Student</th>}<th>Date</th><th>Day</th><th>Time In</th><th>Time Out</th><th>Verified hours</th><th>Status</th><th>Verified by</th><th>Remarks</th>{!student && <th>Actions</th>}</tr></thead><tbody>{attendanceRows.map((record) => <tr key={record.id}>{!student && <td><b>{record.studentName}</b></td>}<td><b>{record.date}</b></td><td>{record.day}</td><td>{record.timeIn}</td><td>{record.timeOut}</td><td>{record.hours}</td><td><StatusBadge status={record.status} /></td><td>{record.verifiedBy}</td><td>{record.remarks}</td>{!student && <td className="table-actions"><div className="table-action-group"><button className="table-link" onClick={() => setSelectedReview(record)} aria-label={`Review attendance for ${record.studentName} on ${record.date}`}>Review</button><button className="table-link" disabled={!record.studentUserId} onClick={() => setHistoryStudent({ id: record.studentUserId!, name: record.studentName })} aria-label={`View attendance history for ${record.studentName}`}>View history</button></div></td>}</tr>)}{!attendanceLoading && attendanceRows.length === 0 && <tr><td colSpan={student ? 8 : 10}>No attendance sessions are available yet.</td></tr>}</tbody></table></div></section>{confirmTimeIn && <ConfirmDialog title="Record Time In?" message="Your Time In will use the server timestamp at confirmation. This event cannot be edited." confirmLabel={attendanceLoading ? "Recording…" : "Record Time In"} busy={attendanceLoading} onCancel={() => setConfirmTimeIn(false)} onConfirm={recordTimeIn} />}{historyStudent && <StudentAttendanceHistory studentId={historyStudent.id} name={historyStudent.name} onClose={() => setHistoryStudent(null)} />}{confirmTimeOut && <ConfirmDialog busy={attendanceLoading} title="End attendance session?" message="Time Out will be recorded using the Supabase server timestamp. The resulting event cannot be edited." confirmLabel={attendanceLoading ? "Recording…" : "Record Time Out"} onCancel={() => setConfirmTimeOut(false)} onConfirm={recordTimeOut} />}{selectedReview && <AttendanceReviewDialog record={selectedReview} close={() => setSelectedReview(null)} onSaved={() => { void refreshAttendance(); }} />}</>;
}

function StudentDailyLogDialog({ log, close, onSaved }: { log: DailyLogRecord | null; close: () => void; onSaved: () => void }) {
  const [logDate, setLogDate] = useState(log?.logDate ?? new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState(String(log?.hours ?? 8));
  const [activities, setActivities] = useState(log?.summary ?? "");
  const [learnings, setLearnings] = useState(log?.learnings ?? "");
  const [challenges, setChallenges] = useState(log?.challenges ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const saveLock = useRef(false);
  async function save(status: "draft" | "submitted") {
    if (saveLock.current) return;
    saveLock.current = true;
    setLoading(true);
    setError("");
    try {
      await dailyLogService.save({ id: log?.id, logDate, hours: Number(hours), activities, learnings, challenges }, status);
      onSaved();
    } catch (reason) {
      setError(userError(reason, "The daily log could not be saved."));
    } finally {
      saveLock.current = false;
      setLoading(false);
    }
  }
  if (log && !["Draft", "Needs Revision"].includes(log.status)) return <Dialog title="View daily log" onClose={close} busy={loading}><InfoCallout icon={FileText}><p><strong>{log.date}</strong> · {log.hours} hours · <StatusBadge status={log.status} /></p></InfoCallout><div className="readonly-summary"><strong>Activities performed</strong><p>{log.summary}</p>{log.learnings && <><strong>Key learnings</strong><p>{log.learnings}</p></>}{log.challenges && <><strong>Challenges</strong><p>{log.challenges}</p></>}{log.latestFeedback && <><strong>Latest reviewer feedback</strong><p>{log.latestFeedback}</p></>}</div><div className="modal-actions"><ActionButton onClick={close}>Done</ActionButton></div></Dialog>;
  return <Dialog title={log ? "Edit daily log" : "Add daily log"} onClose={close} busy={loading} wide><header className="modal-heading"><span className="modal-icon"><FileText /></span><div><span className="settings-kicker">Internship activity record</span><p>Save a private draft, or submit the entry to your authorized reviewers.</p></div></header><form onSubmit={(event) => { event.preventDefault(); void save("submitted"); }}><fieldset className="daily-log-section"><legend>1. Log information</legend><p>Use the actual work date and hours completed at your assigned HTE.</p><div className="two-fields"><label className="field"><span>Work date *</span><input required type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} /></label><label className="field"><span>Rendered hours *</span><input required type="number" min="0.25" max="24" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} /></label></div></fieldset><fieldset className="daily-log-section"><legend>2. Work and learning</legend><label className="field"><span>Activities performed *</span><textarea required minLength={3} value={activities} onChange={(event) => setActivities(event.target.value)} placeholder="Describe the work you completed and your responsibilities for the day." /></label><div className="two-fields"><label className="field"><span>Key learnings</span><textarea value={learnings} onChange={(event) => setLearnings(event.target.value)} placeholder="Skills, knowledge, or insights gained" /></label><label className="field"><span>Challenges encountered</span><textarea value={challenges} onChange={(event) => setChallenges(event.target.value)} placeholder="Optional blockers or issues that need follow-up" /></label></div></fieldset>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="daily-log-actions"><p><strong>Draft</strong> stays editable. <strong>Submit</strong> sends this entry for review.</p><div className="modal-actions"><ActionButton type="button" variant="ghost" onClick={close}>Cancel</ActionButton><ActionButton type="button" variant="secondary" disabled={loading || !activities.trim()} onClick={() => void save("draft")}>Save Draft</ActionButton><ActionButton type="submit" disabled={loading || !activities.trim()}>{loading ? "Saving…" : "Submit daily log"}</ActionButton></div></div></form></Dialog>;
}

function DailyLogDialog({ log, student, close, onSaved }: { log: DailyLogRecord | null; student: boolean; close: () => void; onSaved: () => void }) {
  const [feedback, setFeedback] = useState(log?.latestFeedback ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function review(decision: "approved" | "needs_revision" | "rejected") {
    if (!log) return;
    if (decision !== "approved" && !feedback.trim()) {
      setError("Feedback is required when returning or rejecting a daily log.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await dailyLogService.review(log.id, decision, feedback);
      onSaved();
    } catch (reason) {
      setError(userError(reason, "The review decision could not be recorded."));
      setLoading(false);
    }
  }

  if (student) return <StudentDailyLogDialog log={log} close={close} onSaved={onSaved} />;

  return <Dialog title="Review daily log" onClose={close} busy={loading}><span className="modal-icon"><ShieldCheck /></span>{log && <><p><strong>{log.studentName}</strong> · {log.date} · {log.hours} hours</p><div className="readonly-summary"><strong>Activities performed</strong><p>{log.summary}</p>{log.learnings && <><strong>Key learnings</strong><p>{log.learnings}</p></>}{log.challenges && <><strong>Challenges</strong><p>{log.challenges}</p></>}</div><label className="field"><span>Review feedback</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Enter clear, traceable feedback…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions review-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => void review("approved")}>Approve</ActionButton><ActionButton variant="secondary" disabled={loading || !feedback.trim()} onClick={() => void review("needs_revision")}>Request revision</ActionButton><ActionButton variant="danger" disabled={loading || !feedback.trim()} onClick={() => void review("rejected")}>Reject</ActionButton></div></>}</Dialog>;
}

function DailyLogsPage({ role }: { role: RoleId }) {
  const student = role === "student";
  const [records, setRecords] = useState<DailyLogRecord[]>([]);
  const [selected, setSelected] = useState<DailyLogRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try { setRecords(await dailyLogService.listLive()); }
    catch (reason) { setError(userError(reason, "Daily logs could not be loaded.")); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void dailyLogService.listLive().then((result) => {
      if (active) setRecords(result);
    }).catch((reason) => {
      if (active) setError(userError(reason, "Daily logs could not be loaded."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const approved = records.filter((log) => log.status === "Approved").length;
  const pending = records.filter((log) => log.status === "Submitted").length;
  return <><PageHeader title="Daily logs" subtitle={student ? "Record and track your daily internship activities." : "Review internship activities submitted by your assigned interns."} action={student ? <ActionButton icon={Plus} onClick={() => setSelected(null)}>Add daily log</ActionButton> : undefined} />{notice && <p className="form-success" role="status">{notice}</p>}{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="stats-grid three"><StatCard label="Total records" value={String(records.length)} detail="loaded from Supabase" icon={FileText} /><StatCard label="Approved" value={String(approved)} detail="by an authorized reviewer" icon={CheckCircle2} tone="green" /><StatCard label="Pending review" value={String(pending)} detail="awaiting feedback" icon={Clock3} tone="orange" /></div><section className="card table-card"><h2>Log history</h2><div className="table-scroll"><table className="data-table"><thead><tr>{!student && <th>Student</th>}<th>Date</th><th>Hours</th><th>Activities summary</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>{records.map((log) => <tr key={log.id}>{!student && <td><b>{log.studentName}</b></td>}<td><b>{log.date}</b></td><td>{log.hours}</td><td className="summary-cell">{log.summary}</td><td>{log.submitted}</td><td><StatusBadge status={log.status} /></td><td>{student && ["Draft", "Needs Revision"].includes(log.status) ? <button className="table-link" onClick={() => setSelected(log)}>Edit</button> : <button className="table-link" onClick={() => setSelected(log)}>{student ? "View" : "Review"}</button>}</td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={student ? 6 : 7}>No daily logs are available yet.</td></tr>}</tbody></table></div></section>{selected !== undefined && <DailyLogDialog log={selected} student={student} close={() => setSelected(undefined)} onSaved={() => { setNotice("Daily log changes saved."); setSelected(undefined); setLoading(true); setError(""); void load(); }} />}</>;
}

function DocumentUploadDialog({ record, close, onSaved }: { record: DocumentRecord; close: () => void; onSaved: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;
    setLoading(true);
    setError("");
    try {
      await documentService.upload(record, selectedFile, notes);
      onSaved();
    } catch (reason) {
      setError(userError(reason, "The document could not be uploaded."));
      setLoading(false);
    }
  }
  return <Dialog title={`Upload ${record.templateName}`} onClose={close} busy={loading}><InfoCallout icon={Upload}><p>The file will be stored in the private PRAXIZ document bucket and submitted as a new immutable version.</p></InfoCallout><form onSubmit={submit}><label className="field"><span>Document file</span><input type="file" required accept={record.allowedMimeTypes.join(",")} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /><small>Maximum {Math.round(record.maxFileSizeBytes / 1024 / 1024)} MB · {record.allowedMimeTypes.join(", ")}</small></label><label className="field"><span>Submission notes (optional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for the reviewer…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton variant="secondary" onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading || !selectedFile}>{loading ? "Uploading…" : "Upload and submit"}</ActionButton></div></form></Dialog>;
}

function DocumentReviewDialog({ record, close, onSaved }: { record: DocumentRecord; close: () => void; onSaved: () => void }) {
  const [feedback, setFeedback] = useState(record.latestFeedback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision: "approved" | "needs_revision" | "rejected") {
    if (decision !== "approved" && !feedback.trim()) return;
    setLoading(true);
    setError("");
    try {
      await documentService.review(record, decision, feedback);
      onSaved();
    } catch (reason) {
      setError(userError(reason, "The document decision could not be saved."));
      setLoading(false);
    }
  }
  return <Dialog title={`Review ${record.templateName}`} onClose={close} busy={loading}><InfoCallout icon={FileCheck2}><p><strong>{record.studentName}</strong><br />{record.templateName} · {record.fileName}</p></InfoCallout><div className="inline-actions"><ActionButton variant="secondary" icon={Eye} onClick={() => { void documentService.open(record); }}>Open submitted file</ActionButton></div><label className="field"><span>Review feedback</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Enter clear, traceable feedback…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions review-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => void decide("approved")}>Approve</ActionButton><ActionButton variant="secondary" disabled={loading || !feedback.trim()} onClick={() => void decide("needs_revision")}>Request revision</ActionButton><ActionButton variant="danger" disabled={loading || !feedback.trim()} onClick={() => void decide("rejected")}>Reject</ActionButton></div></Dialog>;
}

function DocumentsPage({ role }: { role: RoleId }) {
  const canUpload = role === "student";
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [uploadRecord, setUploadRecord] = useState<DocumentRecord | null>(null);
  const [reviewRecord, setReviewRecord] = useState<DocumentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try { setRecords(await documentService.listLive()); }
    catch (reason) { setError(userError(reason, "Documents could not be loaded.")); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void documentService.listLive().then((result) => {
      if (active) setRecords(result);
    }).catch((reason) => {
      if (active) setError(userError(reason, "Documents could not be loaded."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const completed = records.filter((record) => record.status === "Approved" || record.status === "Waived").length;
  const percent = records.length ? Math.round(completed / records.length * 100) : 0;
  const nextUpload = records.find((record) => record.status === "Missing" || record.status === "Needs Revision" || record.status === "Rejected");
  async function openDocument(record: DocumentRecord, download = false) {
    setError("");
    try { await documentService.open(record, download); }
    catch (reason) { setError(userError(reason, "The secure document link could not be opened.")); }
  }
  return <><PageHeader title={role === "coordinator" ? "Document compliance" : "Documents"} subtitle={canUpload ? "Manage your internship requirements and secure document submissions." : "Review live requirement status and follow up on incomplete records."} action={canUpload && nextUpload ? <ActionButton icon={Upload} onClick={() => setUploadRecord(nextUpload)}>Upload next requirement</ActionButton> : undefined} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="card compliance-card"><div className="metric-row"><span>Approved document requirements</span><strong>{completed} of {records.length} ({percent}%)</strong></div><ProgressBar value={percent} /></section>{(["Pre-Internship", "During Internship", "Post-Internship"] as const).map((phase) => <section className="card document-group" key={phase}><h2>{phase}</h2>{records.filter((record) => record.phase === phase).map((record) => <article className="document-row" key={record.id}><span className={`document-icon document-${record.status.toLowerCase().replaceAll(" ", "-")}`}><FileText size={21} /></span><div><strong>{record.templateName}</strong><small>{!canUpload && `${record.studentName} · `}{record.fileName} · {record.dueAt}</small><p>{record.latestFeedback || (record.objectPath ? "Submitted securely to PRAXIZ." : "A file has not been submitted yet.")}</p></div><StatusBadge status={record.status} /><div className="document-actions">{record.objectPath && <ActionButton variant="secondary" onClick={() => { void openDocument(record); }}>Preview</ActionButton>}{record.objectPath && <ActionButton variant="secondary" icon={Download} onClick={() => { void openDocument(record, true); }}>Download</ActionButton>}{canUpload && (record.status === "Missing" || record.status === "Needs Revision" || record.status === "Rejected") && <ActionButton onClick={() => setUploadRecord(record)}>{record.status === "Missing" ? "Upload" : "Replace"}</ActionButton>}{!canUpload && record.submissionId && (record.status === "Under Review" || record.status === "Submitted") && <ActionButton onClick={() => setReviewRecord(record)}>Review</ActionButton>}</div></article>)}{!loading && records.filter((record) => record.phase === phase).length === 0 && <p className="muted-note">No visible requirements in this phase.</p>}</section>)}{uploadRecord && <DocumentUploadDialog record={uploadRecord} close={() => setUploadRecord(null)} onSaved={() => { setUploadRecord(null); void load(); }} />}{reviewRecord && <DocumentReviewDialog record={reviewRecord} close={() => setReviewRecord(null)} onSaved={() => { setReviewRecord(null); void load(); }} />}</>;
}

function EvaluationsPage({ role }: { role: RoleId }) { return <EvaluationWorkspace role={role} />; }

function ProgressPage() {
  const [data, setData] = useState<StudentProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void internshipService.getStudentProgress().then((summary) => {
      if (active) setData(summary);
    }).catch((reason) => {
      if (active) setError(userError(reason, "Internship progress could not be loaded."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  if (loading) return <><PageHeader title="Internship progress" subtitle="Loading verified progress from Supabase…" /><EmptyAction icon={Clock3} title="Loading live progress" copy="PRAXIZ is calculating your progress from verified records." /></>;
  if (!data) return <><PageHeader title="Internship progress" subtitle="Follow your verified hours, requirements, and internship milestones." />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<EmptyAction icon={BriefcaseBusiness} title="No active internship assignment" copy="Your progress timeline will appear after a coordinator creates your assignment." /></>;
  const hoursPercent = data.requiredHours ? Math.min(100, Math.round(data.renderedHours / data.requiredHours * 100)) : 0;
  const attendancePercent = data.attendanceRate;
  const logPercent = data.logsExpected ? Math.min(100, Math.round(data.logsSubmitted / data.logsExpected * 100)) : 0;
  const hasDocumentRequirements = data.documentsRequired > 0;
  const documentPercent = hasDocumentRequirements ? Math.round(data.documentsApproved / data.documentsRequired * 100) : 0;
  const remainingHours = Math.max(0, data.requiredHours - data.renderedHours);
  const preInternshipRequirements = data.requirements.filter((item) => item.name === "Acceptance Form" || item.name === "Memorandum of Agreement");
  const completedPreInternshipRequirements = preInternshipRequirements.filter((item) => item.complete).length;
  const milestones = [
    { title: "Account verified", date: "PRAXIZ account active", done: true },
    { title: "Internship assignment confirmed", date: `${data.hte} · ${data.startDate}`, done: ["Active", "Completed"].includes(data.status) },
    { title: "Pre-internship requirements complete", date: preInternshipRequirements.length ? `${completedPreInternshipRequirements} of ${preInternshipRequirements.length} requirements approved` : "No pre-internship requirements configured", done: preInternshipRequirements.length > 0 && completedPreInternshipRequirements === preInternshipRequirements.length },
    { title: "Performance evaluation recorded", date: data.finalizedEvaluationCount ? `${data.finalizedEvaluationCount} finalized report(s) available` : "Awaiting finalized evaluation", done: data.finalizedEvaluationCount > 0 },
    { title: `Complete ${data.requiredHours} required hours`, date: `${data.renderedHours} of ${data.requiredHours} verified hours`, done: hoursPercent >= 100 },
    { title: "Final evaluation and clearance", date: `Expected completion ${data.endDate}`, done: data.status === "Completed" },
  ];
  return <><PageHeader title="Internship progress" subtitle="Follow your verified hours, requirements, and internship milestones." />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="progress-hero card"><div><span className="eyebrow dark">Verified-hour completion</span><strong>{hoursPercent}%</strong><p>{data.renderedHours} verified hours · {remainingHours} hours remaining</p></div><div className="progress-ring" style={hoursPercent > 0 ? { background: `conic-gradient(#1768d5 0 ${hoursPercent}%, #dbe6f4 ${hoursPercent}% 100%)` } : undefined} role="img" aria-label={`${hoursPercent}% verified-hour completion`}><span>{hoursPercent}<small>%</small></span></div></section><div className="dashboard-grid"><section className="card"><h2>Milestone timeline</h2><div className="timeline">{milestones.map((item) => <div className={item.done ? "done" : ""} key={item.title}><span>{item.done ? <Check size={16} /> : <Clock3 size={16} />}</span><div><strong>{item.title}</strong><small>{item.date}</small></div></div>)}</div></section><aside className="card"><h2>Completion details</h2><div className="indicator-list"><div><span>Rendered hours</span><b>{hoursPercent}%</b><ProgressBar value={hoursPercent} /></div><div><span>Attendance verification</span><b>{attendancePercent}%</b><ProgressBar value={attendancePercent} tone="green" /></div><div><span>Daily logs</span><b>{logPercent}%</b><ProgressBar value={logPercent} /></div><div><span>Requirements</span><b>{hasDocumentRequirements ? `${documentPercent}%` : "Not configured"}</b><ProgressBar value={documentPercent} tone="orange" /></div></div></aside></div></>;
}

function NotificationsPage() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [selected, setSelected] = useState<NotificationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void notificationService.listLive().then(records => { if (active) setItems(records); })
      .catch(reason => { if (active) setError(userError(reason, "Notifications could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function view(item: NotificationRecord) {
    setError("");
    try { if (item.unread) { await notificationService.markRead(item.id); setItems(old => old.map(r => r.id === item.id ? { ...r, unread: false } : r)); } }
    catch (reason) { setError(userError(reason, "The notification could not be marked as read.")); }
    if (item.targetPath) { window.location.assign(item.targetPath); return; }
    setSelected(item);
  }
  async function markAll() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await notificationService.markAllRead(); setItems(old => old.map(r => ({ ...r, unread: false }))); }
    catch (reason) { setError(userError(reason)); }
    finally { lock.current = false; setBusy(false); }
  }
  const unread = items.filter(r => r.unread).length;
  const shown = filter === "unread" ? items.filter(r => r.unread) : items;
  return <><PageHeader title="Notifications" subtitle={unread + " unread notifications"} action={<div className="notification-controls"><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All ({items.length})</button><button aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Unread ({unread})</button><button disabled={!unread || busy} onClick={() => void markAll()}>{busy ? "Updating…" : "Mark all read"}</button></div>} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <div className="card page-skeleton" role="status" aria-label="Loading notifications"><span /><span /></div> : <div className="notification-list">{shown.map(item => <article key={item.id} className={"notification-item notification-" + item.tone + (item.unread ? " unread" : "")}><span className="notification-symbol"><Bell /></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{item.time}{item.unread ? " · Unread" : ""}</small></div><button className="table-link" aria-label={"View notification: " + item.title} title="View notification" onClick={() => void view(item)}><Eye size={18} />View</button></article>)}{!shown.length && <EmptyAction icon={Bell} title="You’re all caught up" copy={filter === "unread" ? "There are no unread notifications." : "No notifications have been sent to this account yet."} />}</div>}
    {selected && <Dialog title={selected.title} onClose={() => setSelected(null)}><p className="muted-note">{selected.time}</p><p className="preserve-text">{selected.message}</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><ActionButton onClick={() => setSelected(null)}>Done</ActionButton></div></Dialog>}
  </>;
}

function SettingsPanel() {
  const { user } = useAuth();
  const saveLock = useRef(false);
  const [preferences, setPreferences] = useState({ emailNotifications: true, weeklyProgressSummary: true, monitoringNotices: false });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void notificationService.getPreferences().then(result => { if (active) setPreferences(result); }).catch(reason => { if (active) setError(userError(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  async function save() {
    if (saveLock.current) return; saveLock.current = true; setSaving(true); setError(""); setNotice("");
    try { await notificationService.savePreferences(preferences); setNotice("Notification preferences saved."); }
    catch (reason) { setError(userError(reason, "Preferences could not be saved.")); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const choices = [{ key: 'emailNotifications', label: 'Email notifications', hint: 'Submission, verification, and account updates' }, { key: 'weeklyProgressSummary', label: 'Weekly progress summary', hint: 'A digest of verified internship progress' }, { key: 'monitoringNotices', label: 'Monitoring notices', hint: 'Attendance and compliance reminders' }] as const;
  return <div className="settings-stack">
    <section className="settings-section"><div><UserRound /><h2>Account</h2><p>Your verified institutional identity.</p></div><div><strong>{user?.fullName}</strong><p>{user?.email}</p><Link className="text-link" href={user ? `/${user.role}/profile` : '/signin'}>View and edit your profile</Link></div></section>
    <section className="settings-section"><div><Bell /><h2>Notifications</h2><p>Preferences are stored in your account.</p></div><div>{choices.map(choice => <label className="toggle-row" key={choice.key} htmlFor={choice.key}><span><strong id={`${choice.key}-label`}>{choice.label}</strong><small>{choice.hint}</small></span><input aria-labelledby={`${choice.key}-label`} id={choice.key} type="checkbox" checked={preferences[choice.key]} disabled={loading || saving} onChange={() => setPreferences(value => ({ ...value, [choice.key]: !value[choice.key] }))} /></label>)}{notice && <p className="form-success" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}<ActionButton disabled={loading || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save notification preferences'}</ActionButton></div></section>
    <section className="settings-section"><div><Settings /><h2>Appearance</h2><p>Four accents and light, dark, or system mode. Saved on this device.</p></div><ThemeControls /></section>
    <section className="settings-section"><div><LockKeyhole /><h2>Security</h2><p>Passwords are managed by secure account recovery.</p></div><Link className="text-link" href="/forgot-password">Reset your password</Link></section>
  </div>;
}

function ProfilePage({ role, settings = false }: { role: RoleId; settings?: boolean }) {
  return <><PageHeader title={settings ? "Settings" : "Profile"} subtitle={settings ? "Manage your account, notifications, appearance, and security." : "Your identity and institutional account information."} />{settings ? <section className="card"><SettingsPanel /></section> : <ProfileDetails role={role} />}</>;
}

function InternManagementPage({ role }: { role: RoleId }) {
  const [historyStudent, setHistoryStudent] = useState<Intern | null>(null);
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState("");
  const [program, setProgram] = useState("");
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState<Awaited<ReturnType<typeof coordinatorService.getScope>>>([]);
  const [rows, setRows] = useState<Intern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      role === "coordinator" ? internshipService.listCoordinatorInterns() : internshipService.listLiveInterns(),
      role === "coordinator" ? coordinatorService.getScope() : Promise.resolve([]),
    ]).then(([records, programs]) => {
      if (active) { setRows(records); setScope(programs); }
    }).catch(reason => { if (active) setError(userError(reason, "Intern assignments could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role]);
  const campusOptions = [...new Set(rows.map(intern => intern.campus))];
  const programOptions = role === "coordinator" ? scope.map(item => ({ id: item.id, label: `${item.code} · ${item.name}` }))
    : [...new Map(rows.map(intern => [intern.programId ?? intern.program, { id: intern.programId ?? intern.program, label: intern.program }])).values()];
  const visible = rows.filter(intern => (!search || `${intern.name} ${intern.hte}`.toLowerCase().includes(search.trim().toLowerCase()))
    && (role === "coordinator" || !campus || intern.campus === campus)
    && (!program || (intern.programId ?? intern.program) === program) && (!status || intern.status === status));
  const filtered = !!(search || program || status || campus);
  return <><PageHeader title={role === "coordinator" ? "Intern management" : "Assigned interns"} subtitle={role === "coordinator" ? "Students are routed here by academic program; placement details appear after assignment." : "View interns assigned to your authorized supervision scope."} />
    {role === "coordinator" && scope.length > 0 && <dl className="scope-context"><div><dt>Assigned campus</dt><dd>{[...new Set(scope.map(item => item.campus))].join(" · ")}</dd></div><div><dt>{scope.length === 1 ? "Handled program" : "Handled programs"}</dt><dd>{scope.map(item => `${item.code} · ${item.name}`).join("; ")}</dd></div></dl>}
    {error && <p className="form-error" role="alert"><AlertTriangle size={16} /> {error}</p>}
    <section className="card table-card"><div className="intern-toolbar">
      <h2 aria-live="polite">{loading ? "Loading interns…" : `${visible.length} intern${visible.length === 1 ? "" : "s"}`}</h2>
      <div className="filter-bar"><label><Search size={18} aria-hidden="true" /><input aria-label="Search interns or HTEs" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search intern or HTE…" /></label>
        {role !== "coordinator" && campusOptions.length > 1 && <select aria-label="Filter by campus" value={campus} onChange={event => setCampus(event.target.value)}><option value="">All assigned campuses</option>{campusOptions.map(item => <option key={item}>{item}</option>)}</select>}
        {programOptions.length > 1 && <select aria-label="Filter by handled program" value={program} onChange={event => setProgram(event.target.value)}><option value="">All handled programs</option>{programOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
        <select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{["Awaiting Assignment", "Active", "Completed", "Needs Attention"].map(item => <option key={item}>{item}</option>)}</select>
        {filtered && <button className="table-link" onClick={() => { setSearch(""); setCampus(""); setProgram(""); setStatus(""); }}>Clear filters</button>}
      </div></div>
      <InternTable rows={visible} onView={intern => setHistoryStudent(intern)} emptyMessage={loading ? "Loading interns…" : error ? "Interns could not be loaded." : filtered ? "No interns match the current filters. Try adjusting your search or status filter." : "No interns are available in your assigned scope yet."} />
    </section>{historyStudent?.studentUserId && <StudentAttendanceHistory studentId={historyStudent.studentUserId} name={historyStudent.name} onClose={() => setHistoryStudent(null)} />}
  </>;
}

type AnalyticsAiResult = {
  summary: string;
  patterns: string[];
  risks: Array<{
    severity: "high" | "medium" | "low";
    indicator: string;
    message: string;
  }>;
  recommendations: string[];
  model?: string;
  source?: "ollama";
};

type AnalyticsMetric = {
  label: string;
  numerator: number;
  denominator: number;
  value: number | null;
  detail: string;
};

function AnalyticsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Intern[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [logs, setLogs] = useState<DailyLogRecord[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceHistoryRow[]>([]);
  const [term, setTerm] = useState<{ academicYear: string; term: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiInsights, setAiInsights] = useState<AnalyticsAiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      internshipService.listCoordinatorInterns(),
      evaluationService.listLive(),
      dailyLogService.listLive(),
      attendanceService.listLiveHistory(),
      institutionalService.getCurrentAcademicTerm().catch(() => null),
    ]).then(([internRows, evaluationRows, logRows, liveAttendance, currentTerm]) => {
      if (!active) return;
      setRows(internRows);
      setEvaluations(evaluationRows);
      setLogs(logRows);
      setAttendanceRows(liveAttendance);
      setTerm(currentTerm ? { academicYear: currentTerm.academicYear, term: currentTerm.term } : null);
    }).catch(reason => { if (active) setError(userError(reason, "Analytics could not be loaded.")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const percentage = (numerator: number, denominator: number) => denominator > 0 ? Math.round(numerator / denominator * 100) : null;
  const assignedRows = rows.filter(row => row.status !== "Awaiting Assignment");
  const attendanceVerified = attendanceRows.filter(row => row.status === "Verified").length;
  const approvedLogs = logs.filter(log => log.status === "Approved").length;
  const finalizedCount = evaluations.filter(item => item.status === "Finalized").length;
  const required = assignedRows.reduce((sum, row) => sum + Number(row.requirements.split("/")[1] ?? 0), 0);
  const approved = assignedRows.reduce((sum, row) => sum + Number(row.requirements.split("/")[0] ?? 0), 0);
  const metrics: AnalyticsMetric[] = [
    { label: "Attendance verification", numerator: attendanceVerified, denominator: attendanceRows.length, value: percentage(attendanceVerified, attendanceRows.length), detail: attendanceRows.length ? `${attendanceVerified} of ${attendanceRows.length} applicable sessions verified` : "No applicable sessions yet" },
    { label: "Daily log approval", numerator: approvedLogs, denominator: logs.length, value: percentage(approvedLogs, logs.length), detail: logs.length ? `${approvedLogs} of ${logs.length} submitted logs approved` : "No submitted logs yet" },
    { label: "Document compliance", numerator: approved, denominator: required, value: percentage(approved, required), detail: required ? `${approved} of ${required} required documents compliant` : "No required documents yet" },
    { label: "Evaluation finalization", numerator: finalizedCount, denominator: evaluations.length, value: percentage(finalizedCount, evaluations.length), detail: evaluations.length ? `${finalizedCount} of ${evaluations.length} reports finalized · completion only, not a grade` : "No evaluation reports yet" },
  ];
  const [attendanceMetric, logMetric, documentMetric, evaluationMetric] = metrics;
  const concerns = assignedRows.filter(row => row.status === "Needs Attention" || (() => { const [complete = 0, total = 0] = row.requirements.split("/").map(Number); return total > 0 && complete < total; })());
  const ruleBasedRisks = [
    attendanceMetric.value !== null && attendanceMetric.value < 80 ? { indicator: attendanceMetric.label, message: attendanceMetric.detail, severity: attendanceMetric.value < 60 ? "high" : "medium", href: "/coordinator/attendance", action: "Review attendance" } : null,
    documentMetric.value !== null && documentMetric.value < 75 ? { indicator: documentMetric.label, message: documentMetric.detail, severity: documentMetric.value < 50 ? "high" : "medium", href: "/coordinator/documents", action: "Review documents" } : null,
    logMetric.value !== null && logMetric.value < 75 ? { indicator: logMetric.label, message: logMetric.detail, severity: logMetric.value < 50 ? "high" : "medium", href: "/coordinator/reports", action: "Review daily logs" } : null,
    evaluationMetric.value !== null && evaluationMetric.value < 100 ? { indicator: evaluationMetric.label, message: evaluationMetric.detail, severity: "medium", href: "/coordinator/evaluations", action: "Review evaluations" } : null,
  ].filter((risk): risk is { indicator: string; message: string; severity: "high" | "medium"; href: string; action: string } => Boolean(risk));
  const hasData = assignedRows.length > 0 || attendanceRows.length > 0 || logs.length > 0 || evaluations.length > 0 || required > 0;
  const displayValue = (metric: AnalyticsMetric) => metric.value === null ? "No data" : `${metric.value}%`;

  async function generateAiInsights() {
    if (aiLoading || loading || !hasData) return;
    setAiLoading(true); setAiError("");
    try {
      const response = await fetch("/api/ai/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        attendance: attendanceMetric.value, attendanceVerified: attendanceMetric.numerator, attendanceApplicable: attendanceMetric.denominator,
        dailyLogApproval: logMetric.value, dailyLogsApproved: logMetric.numerator, dailyLogsApplicable: logMetric.denominator,
        evaluationFinalization: evaluationMetric.value, evaluationsFinalized: evaluationMetric.numerator, evaluationsApplicable: evaluationMetric.denominator,
        documentCompliance: documentMetric.value, documentsCompliant: documentMetric.numerator, documentsRequired: documentMetric.denominator,
        assignedInterns: assignedRows.length, concerns: concerns.length, ruleBasedAlerts: ruleBasedRisks.map(risk => `${risk.indicator}: ${risk.message}`),
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "AI performance analysis could not be generated.");
      setAiInsights(data as AnalyticsAiResult);
    } catch (reason) { setAiError(reason instanceof Error ? reason.message : "AI performance analysis could not be generated."); }
    finally { setAiLoading(false); }
  }

  const scope = [user?.campus, user?.college, user?.scopeProgramNames?.join(", ") || user?.scopeProgramName || user?.scopeProgramCode].filter(Boolean).join(" · ");
  return <>
    <PageHeader title="Performance analytics" subtitle="Monitor internship performance, identify areas requiring attention, and review AI-assisted insights derived from verified PRAXIZ records." />
    <div className="analytics-context" role="status"><ShieldCheck size={18} /><span><strong>{term ? `${term.academicYear} · ${term.term}` : "Current academic context"}</strong>{scope ? ` · ${scope}` : " · Authorized coordinator scope"}</span></div>
    {error && <p className="form-error" role="alert"><AlertTriangle size={16} /> {error}</p>}
    {loading ? <div className="analytics-loading" role="status" aria-label="Loading analytics"><span /><span /><span /></div> : !hasData ? <EmptyAction icon={BarChart3} title="No analytics available yet" copy="There are currently no active internship records in the selected coordinator scope." /> : <>
      <section className="card analytics-overview"><div className="card-title"><div><h2>Performance overview</h2><p className="muted-note">Verified records in your authorized scope.</p></div><StatusBadge status={concerns.length ? "Needs Attention" : "Good Standing"} /></div><div className="analytics-metric-grid">{metrics.map(metric => <article className="analytics-metric" key={metric.label}><div className="analytics-metric-icon">{metric.label.startsWith("Attendance") ? <CheckCircle2 /> : metric.label.startsWith("Daily") ? <FileText /> : metric.label.startsWith("Evaluation") ? <Star /> : <FileCheck2 />}</div><div><span>{metric.label}</span><strong>{displayValue(metric)}</strong><small>{metric.detail}</small>{metric.value !== null && <ProgressBar value={metric.value} />}</div></article>)}<article className="analytics-metric"><div className="analytics-metric-icon"><UsersRound /></div><div><span>Interns requiring attention</span><strong>{concerns.length}</strong><small>{assignedRows.length ? `of ${assignedRows.length} active interns` : "No active interns"}</small></div></article></div></section>
      <section className="card analytics-visualizations"><div className="card-title"><div><h2>Performance visualizations</h2><p className="muted-note">A compact view of verified workflow completion.</p></div></div><div className="analytics-bars" role="img" aria-label="Verified workflow completion indicators">{metrics.map(metric => <div className="analytics-bar-row" key={metric.label}><span>{metric.label}</span><div><i style={{ width: `${metric.value ?? 0}%` }} /></div><b>{displayValue(metric)}</b></div>)}</div></section>
      <section className="card analytics-risks"><div className="card-title"><div><h2>Risks &amp; exceptions</h2><p className="muted-note">Deterministic rules identify where coordinator review may be needed.</p></div></div>{ruleBasedRisks.length ? <div className="risk-list">{ruleBasedRisks.map(risk => <article className="risk-row" key={risk.indicator}><div><strong>{risk.indicator}</strong><p>{risk.message}</p></div><StatusBadge status={risk.severity === "high" ? "Needs Attention" : "Monitor"} /><Link className="button button-secondary" href={risk.href}>{risk.action}</Link></article>)}</div> : <p className="muted-note">No configured concern threshold was triggered.</p>}</section>
      <section className="card ai-insights-card"><div className="card-title"><div><h2>AI Performance Insights</h2><p className="muted-note">AI-assisted interpretation of verified PRAXIZ internship indicators.</p></div><ActionButton onClick={generateAiInsights} disabled={aiLoading || !hasData}>{aiLoading ? "Analyzing…" : aiInsights ? "Regenerate insights" : "Generate AI insights"}</ActionButton></div>{aiError && <div className="ai-error" role="alert"><AlertTriangle size={16} /><span>{aiError}</span><button className="table-link" onClick={() => void generateAiInsights()} disabled={aiLoading}>Try again</button></div>}{aiLoading && <div className="ai-loading-state" role="status" aria-live="polite"><span className="skeleton-line" /><span className="skeleton-line short" /><span className="skeleton-line" /><p>Analyzing verified indicators… PRAXIZ AI is interpreting the current monitoring data.</p></div>}{!aiInsights && !aiLoading && !aiError && <p className="muted-note">Generate an AI-assisted analysis of the current attendance, daily-log, evaluation, and document-compliance indicators.</p>}{aiInsights && !aiLoading && <div className="ai-results"><section><h3>Overall assessment</h3><p>{aiInsights.summary}</p></section><section><h3>Key observations</h3>{aiInsights.patterns.length ? <ul className="observation-list">{aiInsights.patterns.map((pattern, index) => <li key={`pattern-${index}`}>{pattern}</li>)}</ul> : <p className="muted-note">No additional pattern was identified from the available verified indicators.</p>}</section><section><h3>Recommended actions</h3>{aiInsights.recommendations.length ? <ol className="recommendation-list">{aiInsights.recommendations.map((recommendation, index) => <li key={`recommendation-${index}`}><span>{recommendation}</span>{index === 0 && ruleBasedRisks[0] && <Link className="text-link" href={ruleBasedRisks[0].href}>Open workflow</Link>}</li>)}</ol> : <p className="muted-note">No additional coordinator follow-up recommendation was generated.</p>}</section></div>}<div className="ai-disclaimer"><ShieldCheck size={18} /><p><strong>AI-assisted interpretation.</strong> Verified PRAXIZ records, configured indicators, rule-based alerts, and Internship Coordinator decisions remain authoritative.</p></div></section>
    </>}
  </>;
}

function ReportsPage() {
  const { user } = useAuth();
  const [interns, setInterns] = useState<Intern[]>([]);
  const [attendance, setAttendance] = useState<AttendanceHistoryRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("Internship progress");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [campus, setCampus] = useState("All");
  const [program, setProgram] = useState("All");
  useEffect(() => {
    let active = true;
    void Promise.all([internshipService.listCoordinatorInterns(), attendanceService.listLiveHistory(), documentService.listLive(), evaluationService.listLive()])
      .then(([i,a,d,e]) => { if (active) { setInterns(i); setAttendance(a); setDocuments(d); setEvaluations(e); } })
      .catch(reason => { if (active) setError(userError(reason, "Report data could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  let headers: string[];
  let reportRows: Array<{ id: string; status: string; cells: Array<string | number> }>;
  if (type === "Attendance") {
    headers = ["Student", "Date", "Time In", "Time Out", "Verified Hours", "Status", "Reviewer", "Remarks"];
    reportRows = attendance.map(r => ({ id: r.id, status: r.status, cells: [r.studentName, r.date, r.timeIn, r.timeOut, r.hours, r.status, r.verifiedBy, r.remarks] }));
  } else if (type === "Document compliance") {
    headers = ["Student", "Requirement", "Phase", "Due", "Status", "File", "Feedback"];
    reportRows = documents.map(r => ({ id: r.id, status: r.status, cells: [r.studentName, r.templateName, r.phase, r.dueAt, r.status, r.fileName, r.latestFeedback] }));
  } else if (type === "Evaluations") {
    headers = ["Student", "Template", "Evaluator", "Status", "Rating period", "Rated criteria", "Finalized", "Remarks"];
    reportRows = evaluations.map(r => ({ id: r.id, status: r.status, cells: [r.studentName, r.templateName, r.evaluatorName, r.status, r.context.ratingPeriod || "", r.criteria.filter(c => c.score > 0).length + "/" + r.criteria.length, r.status === "Finalized" ? r.reviewedAt : "", r.overallRemarks] }));
  } else {
    headers = ["Student", "Campus", "Program", "HTE", "Verified Hours", "Required Hours", "Attendance verification %", "Requirements", "Status"];
    reportRows = interns.filter(r => (campus === "All" || r.campus === campus) && (program === "All" || r.program === program)).map((r, i) => ({ id: r.studentUserId || String(i), status: r.status, cells: [r.name,r.campus,r.program,r.hte,r.hours,r.requiredHours ?? "",r.attendance,r.requirements,r.status] }));
  }
  const statuses = [...new Set(reportRows.map(r => r.status))];
  const visible = reportRows.filter(r => (status === "All" || r.status === status) && r.cells.join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  function chooseType(value: string) { setType(value); setStatus("All"); setSearch(""); }
  function exportReport() { downloadCsv("praxiz-" + type.toLowerCase().replaceAll(" ", "-") + "-" + new Date().toISOString().slice(0,10) + ".csv", headers, visible.map(r => r.cells)); }
  return <><PageHeader title="Reports" subtitle="Review and export authorized records. Each report uses its own live data source." />
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="card report-filters"><h2>Report filters</h2><p className="muted-note">Academic scope: {user?.college || user?.scopeProgramName || "your active role assignment"}. Database permissions apply to every result. These reports include all visible assignment terms.</p>
      <div className="report-filter-grid"><label className="field"><span>Report type</span><select value={type} onChange={e => chooseType(e.target.value)}>{["Internship progress","Attendance","Document compliance","Evaluations"].map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="field"><span>Status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="All">All statuses</option>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label className="field"><span>Search report</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Student or report detail" /></label>
      {type === "Internship progress" && <><label className="field"><span>Campus</span><select value={campus} onChange={e => setCampus(e.target.value)}><option value="All">All authorized campuses</option>{[...new Set(interns.map(r => r.campus))].map(c => <option key={c}>{c}</option>)}</select></label><label className="field"><span>Program</span><select value={program} onChange={e => setProgram(e.target.value)}><option value="All">All authorized programs</option>{[...new Set(interns.map(r => r.program))].map(p => <option key={p}>{p}</option>)}</select></label></>}
      </div></section>
    <section className="card table-card"><div className="card-title"><div><h2>{type}</h2><p>{loading ? "Loading records…" : visible.length + " matching records"}</p></div><ActionButton icon={Download} disabled={loading || !!error || !visible.length} onClick={exportReport}>Export filtered CSV</ActionButton></div><div className="table-scroll"><table className="data-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(r => <tr key={r.id}>{r.cells.map((c,i) => <td key={i}>{c || "—"}</td>)}</tr>)}{!loading && !visible.length && <tr><td colSpan={headers.length}>No authorized records match these filters.</td></tr>}</tbody></table></div></section>
    {type === "Evaluations" && <p className="muted-note">Individual criterion ratings are available in the finalized PDF on the Evaluations page. No percentage is calculated for the official PSU form.</p>}
  </>;
}

function FeedbackDialog({ assignments, close, onSaved }: { assignments: EvaluationAssignment[]; close: () => void; onSaved: () => void }) {
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    try { await feedbackService.create({ assignmentId, subject, message }); onSaved(); }
    catch (reason) { setError(userError(reason, "Feedback could not be saved.")); setLoading(false); }
  }
  return <Dialog title="Create internship feedback" onClose={close} busy={loading}><InfoCallout icon={MessageSquareText}><p>Feedback is permanently associated with the selected internship assignment and its authorized reviewers.</p></InfoCallout><form onSubmit={submit}><label className="field"><span>Internship assignment *</span><select required value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}><option value="" disabled>Select an intern</option>{assignments.map((item) => <option key={item.id} value={item.id}>{item.studentName}</option>)}</select></label><label className="field"><span>Subject *</span><input required minLength={3} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Concise follow-up topic" /></label><label className="field"><span>Feedback *</span><textarea required minLength={3} maxLength={5000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Give specific, constructive, and actionable guidance…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton variant="secondary" onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading || !assignmentId}>{loading ? "Saving…" : "Save feedback"}</ActionButton></div></form></Dialog>;
}

function FeedbackPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<FeedbackRecord | null>(null);
  const canCreate = user?.role === "coordinator" || user?.role === "hte";
  const load = useCallback(async () => {
    try {
      const [items, options] = await Promise.all([feedbackService.listLive(), canCreate ? evaluationService.listAssignments() : Promise.resolve([])]);
      setRecords(items); setAssignments(options);
      const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("feedback");
      if (requested) setSelected(items.find(item => item.id === requested) ?? null);
    }
    catch (reason) { setError(userError(reason, "Feedback records could not be loaded.")); }
    finally { setLoading(false); }
  }, [canCreate]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <><PageHeader title="Feedback & follow-up" subtitle={canCreate ? "Assignment-bound guidance visible only to authorized participants." : "Read feedback recorded for your internship assignment."} action={canCreate ? <ActionButton icon={Plus} disabled={loading || assignments.length === 0} onClick={() => setAdding(true)}>New feedback</ActionButton> : undefined} />{error && <p className="form-error" role="alert"><AlertTriangle size={16} /> {error}</p>}<div className="stats-grid three"><StatCard label="Open" value={String(records.filter((item) => item.status === "Open").length)} icon={MessageSquareText} tone="orange" /><StatCard label="In progress" value={String(records.filter((item) => item.status === "In Progress").length)} icon={Clock3} tone="violet" /><StatCard label="Resolved" value={String(records.filter((item) => item.status === "Resolved").length)} icon={CheckCircle2} tone="green" /></div><section className="card table-card"><h2>{loading ? "Loading feedback…" : "Feedback records"}</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Subject</th><th>Feedback</th><th>Author</th><th>Author role</th><th>Date and time</th><th>Status</th><th>Actions</th></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><b>{item.studentName}</b></td><td><b>{item.subject}</b></td><td><span className="feedback-preview">{item.message}</span></td><td>{item.authorName}</td><td>{item.authorRole}</td><td><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(item.createdAt))}</time></td><td><StatusBadge status={item.status} /></td><td><button className="table-link" aria-label={`View feedback: ${item.subject}`} onClick={() => setSelected(item)}><Eye size={16} />View</button></td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={8}>No feedback has been recorded for your authorized assignments.</td></tr>}</tbody></table></div></section>{adding && <FeedbackDialog assignments={assignments} close={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}{selected && <Dialog title={selected.subject} protectChanges={false} onClose={() => setSelected(null)}><dl className="info-list"><div><dt>Student</dt><dd>{selected.studentName}</dd></div><div><dt>Author</dt><dd>{selected.authorName}</dd></div><div><dt>Author role</dt><dd>{selected.authorRole}</dd></div><div><dt>Date and time</dt><dd><time dateTime={selected.createdAt}>{new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(selected.createdAt))}</time></dd></div><div><dt>Status</dt><dd><StatusBadge status={selected.status} /></dd></div></dl><h3>Feedback message</h3><p className="preserve-text">{selected.message}</p><div className="modal-actions"><ActionButton onClick={() => setSelected(null)}>Done</ActionButton></div></Dialog>}</>;
}

function UserAccessDialog({ account, close }: { account: UserAccountRecord; close: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendReset() {
    setSending(true);
    setError("");
    try {
      await adminService.sendPasswordReset(account.email);
      setSent(true);
      setConfirming(false);
    } catch (reason) {
      setError(userError(reason, "The reset email could not be sent."));
    } finally {
      setSending(false);
    }
  }

  return <Dialog title={`Manage access for ${account.name}`} onClose={close}><InfoCallout icon={LockKeyhole}><p>Review the account identity before starting access recovery.</p></InfoCallout><dl className="info-list"><div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Role</dt><dd>{account.role}</dd></div><div><dt>Reference</dt><dd>{account.reference}</dd></div><div><dt>Status</dt><dd>{account.status}</dd></div></dl>
    {sent && <div className="inline-success"><CheckCircle2 /><div><strong>Reset link sent</strong><p>Supabase sent a secure password-reset link to {account.email}.</p></div></div>}
    {confirming && !sent && <div className="access-recovery-warning"><AlertTriangle size={19} /><p><strong>Send a password-reset email?</strong><span>The link goes only to {account.email}. The administrator cannot view or choose the user’s password.</span></p></div>}
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="modal-actions"><ActionButton variant="secondary" disabled={sending} onClick={close}>{sent ? "Done" : "Cancel"}</ActionButton>{!sent && !confirming && <ActionButton icon={Send} onClick={() => setConfirming(true)}>Send password reset</ActionButton>}{!sent && confirming && <ActionButton disabled={sending} onClick={() => void sendReset()}>{sending ? "Sending…" : "Confirm and send"}</ActionButton>}</div>
  </Dialog>;
}

function UserAccountsPage() {
  const [records, setRecords] = useState<UserAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserAccountRecord | null>(null);

  useEffect(() => {
    let active = true;
    void adminService.listUserAccounts().then((result) => {
      if (active) setRecords(result);
    }).catch((reason) => {
      if (active) setError(userError(reason, "User accounts could not be loaded."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const visibleRecords = records.filter((record) => (statusFilter === "All" || record.status === statusFilter) && (!search || `${record.name} ${record.email} ${record.role} ${record.reference} ${record.status}`.toLowerCase().includes(search.toLowerCase())));
  return <><PageHeader title="User accounts" subtitle="View live identities and help users recover access without exposing or replacing their passwords." action={<Link className="button button-primary" href="/admin/registrations"><UserCheck size={18} /> Review registrations</Link>} />
    <div className="verification-principle"><ShieldCheck size={20} /><p><strong>Safe access recovery:</strong> administrators can send a one-time reset link to the registered email address, but cannot view or set a user’s password.</p></div>
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <section className="card table-card"><div className="card-title"><h2>{loading ? "Loading accounts…" : `${visibleRecords.length} account${visibleRecords.length === 1 ? "" : "s"}`}</h2><div className="filter-bar"><select aria-label="Account status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="All">All statuses</option>{[...new Set(records.map(r => r.status))].map(status => <option key={status} value={status}>{status}</option>)}</select><label className="table-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or reference…" /></label></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Reference</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleRecords.map((record) => <tr key={record.id}><td><b>{record.name}</b></td><td className="email-cell" title={record.email}>{record.email}</td><td>{record.role}</td><td>{record.reference}</td><td><StatusBadge status={record.status} /></td><td><button className="table-link" onClick={() => setSelected(record)}>Manage access</button></td></tr>)}{!loading && visibleRecords.length === 0 && <tr><td colSpan={6}>No live user accounts match this view.</td></tr>}</tbody></table></div></section>
    {selected && <UserAccessDialog account={selected} close={() => setSelected(null)} />}
  </>;
}

function PartnerHteDialog({ close, onSaved }: { close: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", registrationNumber: "", industry: "", address: "", city: "", province: "", email: "", phone: "" });
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const field = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); try { await coordinatorService.createPartnerHte(form); onSaved(); } catch (reason) { setError(userError(reason, "The HTE could not be created.")); setLoading(false); } }
  return <Dialog title="Add partner HTE" onClose={close} busy={loading} wide><InfoCallout icon={BriefcaseBusiness}><p>New organizations begin as Pending and require administrator verification before they can receive internship assignments.</p></InfoCallout><form onSubmit={submit}><label className="field"><span>Legal organization name *</span><input required value={form.name} onChange={field("name")} /></label><div className="two-fields"><label className="field"><span>Registration number</span><input value={form.registrationNumber} onChange={field("registrationNumber")} /></label><label className="field"><span>Industry</span><input value={form.industry} onChange={field("industry")} /></label></div><label className="field"><span>Address *</span><input required value={form.address} onChange={field("address")} /></label><div className="two-fields"><label className="field"><span>City / municipality</span><input value={form.city} onChange={field("city")} /></label><label className="field"><span>Province</span><input value={form.province} onChange={field("province")} /></label></div><div className="two-fields"><label className="field"><span>Contact email</span><input type="email" value={form.email} onChange={field("email")} /></label><label className="field"><span>Contact phone</span><input value={form.phone} onChange={field("phone")} /></label></div>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton variant="secondary" onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading}>{loading ? "Saving…" : "Create pending HTE"}</ActionButton></div></form></Dialog>;
}

function PartnerHtesPage() {
  const [selected, setSelected] = useState<PartnerHteRecord | null>(null); const [status, setStatus] = useState("All");
  const [records, setRecords] = useState<PartnerHteRecord[]>([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [adding, setAdding] = useState(false);
  const load = useCallback(async () => { try { setRecords(await coordinatorService.listPartnerHtes()); } catch (reason) { setError(userError(reason, "Partner HTEs could not be loaded.")); } finally { setLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const shown = records.filter((item) => (status === "All" || item.status === status) && (!search || `${item.name} ${item.representative} ${item.industry} ${item.location} ${item.status}`.toLowerCase().includes(search.toLowerCase())));
  return <><PageHeader title="Partner HTEs" subtitle="Verified and pending organizations available within the authorized internship workflow." action={<ActionButton icon={Plus} onClick={() => setAdding(true)}>Add partner HTE</ActionButton>} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="card table-card"><div className="card-title"><h2>{loading ? "Loading organizations…" : `${shown.length} organization${shown.length === 1 ? "" : "s"}`}</h2><label className="field field-compact"><span>Verification status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="All">All</option>{[...new Set(["Verified", "Pending", "Rejected", ...records.map(r => r.status)])].map(s => <option key={s} value={s}>{s}</option>)}</select></label><label className="table-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search organizations…" /></label></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Organization</th><th>Representative</th><th>Assigned interns</th><th>Verification</th><th>Actions</th></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.representative}</td><td>{item.assignedInterns}</td><td><StatusBadge status={item.status} /></td><td><button className="table-link" onClick={() => setSelected(item)}><Eye size={16} />View details</button></td></tr>)}{!loading && shown.length === 0 && <tr><td colSpan={5}>No real HTE organization matches this view.</td></tr>}</tbody></table></div></section>{selected && <Dialog title={selected.name} onClose={() => setSelected(null)}><dl className="info-list"><div><dt>Representative</dt><dd>{selected.representative}</dd></div><div><dt>Industry</dt><dd>{selected.industry}</dd></div><div><dt>Location</dt><dd>{selected.location}</dd></div><div><dt>Assigned interns</dt><dd>{selected.assignedInterns}</dd></div><div><dt>Verification</dt><dd>{selected.status}</dd></div></dl></Dialog>}{adding && <PartnerHteDialog close={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}</>;
}

function AssignmentDialog({ close, onSaved }: { close: () => void; onSaved: () => void }) {
  const [options, setOptions] = useState<AssignmentOptions>({ students: [], htes: [], terms: [] }); const [studentId, setStudentId] = useState(""); const [hteId, setHteId] = useState(""); const [termId, setTermId] = useState(""); const [hours, setHours] = useState("400"); const [startDate, setStartDate] = useState(""); const [endDate, setEndDate] = useState(""); const [submitForApproval, setSubmitForApproval] = useState(true); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let active = true; void coordinatorService.getAssignmentOptions().then((result) => { if (!active) return; setOptions(result); setStudentId(result.students[0]?.id ?? ""); setHteId(result.htes[0]?.id ?? ""); setTermId(result.terms[0]?.id ?? ""); const term = result.terms[0]; if (term) { setStartDate(term.startsOn); setEndDate(term.endsOn); } }).catch((reason) => { if (active) setError(userError(reason, "Assignment choices could not be loaded.")); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  function chooseTerm(id: string) { setTermId(id); const term = options.terms.find((item) => item.id === id); if (term) { setStartDate(term.startsOn); setEndDate(term.endsOn); } }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); try { await coordinatorService.createAssignment({ studentUserId: studentId, hteId, academicTermId: termId, requiredHours: Number(hours), startDate, expectedEndDate: endDate, submitForApproval }); onSaved(); } catch (reason) { setError(userError(reason, "The assignment could not be created.")); setLoading(false); } }
  return <Dialog title="Create internship assignment" onClose={close} busy={loading} wide><InfoCallout icon={ListChecks}><p>Students are limited to your program; only verified HTEs are eligible. Each student can have only one placement for an overlapping period.</p></InfoCallout>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<form onSubmit={submit}><label className="field"><span>Student intern *</span><select required value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="" disabled>Select student</option>{options.students.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="field"><span>Student ID</span><input readOnly value={options.students.find(item => item.id === studentId)?.studentNumber || ""} placeholder={loading ? "Loading…" : "Select a student"} /></label><label className="field"><span>Verified HTE *</span><select required value={hteId} onChange={(event) => setHteId(event.target.value)}><option value="" disabled>Select HTE</option>{options.htes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="field"><span>Academic term *</span><select required value={termId} onChange={(event) => chooseTerm(event.target.value)}><option value="" disabled>Select term</option>{options.terms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="two-fields"><label className="field"><span>Required hours *</span><input required type="number" min="1" value={hours} onChange={(event) => setHours(event.target.value)} /></label><label className="field"><span>Workflow</span><select value={submitForApproval ? "approval" : "draft"} onChange={(event) => setSubmitForApproval(event.target.value === "approval")}><option value="approval">Submit for approval</option><option value="draft">Save as draft</option></select></label></div><div className="two-fields"><label className="field"><span>Start date *</span><input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="field"><span>Expected end date *</span><input required type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><div className="modal-actions"><ActionButton variant="secondary" onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading || !studentId || !hteId || !termId}>{loading ? "Please wait…" : "Create assignment"}</ActionButton></div></form></Dialog>;
}

function AssignmentsPage() {
  const [rows, setRows] = useState<Intern[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [adding, setAdding] = useState(false);
  const load = useCallback(async () => { try { setRows(await internshipService.listCoordinatorInterns()); } catch (reason) { setError(userError(reason, "Assignments could not be loaded.")); } finally { setLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <><PageHeader title="Internship assignments" subtitle="Create and monitor placements for students inside your academic-program scope." action={<ActionButton icon={Plus} onClick={() => setAdding(true)}>Create assignment</ActionButton>} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="card table-card"><h2>{loading ? "Loading assignments…" : `${rows.filter((row) => row.status !== "Awaiting Assignment").length} assignment${rows.filter((row) => row.status !== "Awaiting Assignment").length === 1 ? "" : "s"}`}</h2><InternTable rows={rows.filter((row) => row.status !== "Awaiting Assignment")} />{!loading && rows.every((row) => row.status === "Awaiting Assignment") && <p className="muted-note">No internship assignments have been created for this program.</p>}</section>{adding && <AssignmentDialog close={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}</>;
}

function RolesPage() {
  const [records, setRecords] = useState<RolePolicyRecord[]>([]); const [selected, setSelected] = useState<RolePolicyRecord | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let active = true; void adminService.listRolePolicies().then((items) => { if (active) setRecords(items); }).catch((reason) => { if (active) setError(userError(reason, "Role policies could not be loaded.")); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return <><PageHeader title="Roles & access" subtitle="Read-only view of the existing roles, assignments, and permission architecture." />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="card table-card"><h2>{loading ? "Loading role policies…" : `${records.length} configured roles`}</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Role</th><th>Description</th><th>Scope</th><th>Active assignments</th><th>Status</th><th>Policy</th></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.description}</td><td>{item.scope}</td><td>{item.accounts}</td><td><StatusBadge status={item.active ? "Configured" : "Inactive"} /></td><td><button className="table-link" onClick={() => setSelected(item)}>Review policy</button></td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={5}>No roles are configured.</td></tr>}</tbody></table></div></section>{selected && <Dialog title={`${selected.name} policy`} onClose={() => setSelected(null)} busy={loading}><InfoCallout icon={ShieldCheck}><p>{selected.description}</p></InfoCallout><p className="form-hint">Scope: {selected.scope}. This is the live permission policy; changes require an audited database administration workflow.</p><dl className="info-list">{selected.permissions.map((permission) => <div key={permission.code}><dt>{permission.code}</dt><dd>{permission.description || "Permission enabled for this role."}</dd></div>)}</dl><div className="modal-actions"><ActionButton onClick={() => setSelected(null)}>Done</ActionButton></div></Dialog>}</>;
}

function AuditLogsPage() {
  const [records, setRecords] = useState<AuditLogRecord[]>([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let active = true; void adminService.listAuditLogs().then((items) => { if (active) setRecords(items); }).catch((reason) => { if (active) setError(userError(reason, "Audit history could not be loaded.")); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const shown = records.filter((item) => !search || `${item.action} ${item.actor} ${item.entity}`.toLowerCase().includes(search.toLowerCase()));
  function exportAudit() { downloadCsv(`praxiz-audit-${new Date().toISOString().slice(0, 10)}.csv`, ["Action", "Actor", "Entity", "Occurred At", "Metadata"], shown.map((item) => [item.action, item.actor, item.entity, item.occurredAt, JSON.stringify(item.metadata)])); }
  return <><PageHeader title="Audit logs" subtitle="Immutable production events from the existing PRAXIZ audit mechanism." action={<ActionButton icon={Download} disabled={loading || shown.length === 0} onClick={exportAudit}>Export audit</ActionButton>} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="card table-card"><div className="card-title"><h2>{loading ? "Loading audit events…" : `${shown.length} event${shown.length === 1 ? "" : "s"}`}</h2><label className="table-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action, actor, or entity…" /></label></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Actions</th><th>Actor</th><th>Entity</th><th>Timestamp</th></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td><b>{item.action}</b></td><td>{item.actor}</td><td>{item.entity}</td><td>{formatTimestamp(item.occurredAt)}</td></tr>)}{!loading && shown.length === 0 && <tr><td colSpan={4}>No recorded audit event matches this view.</td></tr>}</tbody></table></div></section></>;
}

type MasterDataKind = "campus" | "college" | "program" | "term";

function MasterDataDialog({ campuses: campusRows, colleges: collegeRows, academicYears, close, onCreated }: {
  campuses: Campus[];
  colleges: College[];
  academicYears: AcademicYearRecord[];
  close: () => void;
  onCreated: () => Promise<void>;
}) {
  const [kind, setKind] = useState<MasterDataKind>("program");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [campusId, setCampusId] = useState(campusRows[0]?.id ?? "");
  const availableColleges = collegeRows.filter((college) => college.campusId === campusId);
  const [collegeId, setCollegeId] = useState(availableColleges[0]?.id ?? "");
  const [academicYearId, setAcademicYearId] = useState(academicYears.find((year) => year.isCurrent)?.id ?? academicYears[0]?.id ?? "");
  const [term, setTerm] = useState<"first_semester" | "second_semester" | "midyear">("second_semester");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function selectCampus(value: string) {
    setCampusId(value);
    setCollegeId(collegeRows.find((college) => college.campusId === value)?.id ?? "");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (kind === "campus") await institutionalService.createCampus({ code, name, shortName, municipality });
      if (kind === "college") await institutionalService.createCollege({ campusId, code, name, shortName });
      if (kind === "program") await institutionalService.createProgram({ collegeId, code, name });
      if (kind === "term") await institutionalService.createAcademicTerm({ academicYearId, term, startsOn, endsOn, isCurrent });
      await onCreated();
      close();
    } catch (reason) {
      setError(userError(reason, "The record could not be created."));
      setLoading(false);
    }
  }

  const needsCode = kind !== "term";
  const needsShortName = kind === "campus" || kind === "college";
  return <Dialog title="Add institutional record" onClose={close} busy={loading} wide><InfoCallout icon={Settings}><p>The record will be written to Supabase using the administrator-only Master Data policy and included in the audit trail.</p></InfoCallout><form onSubmit={submit}>
    <label className="field"><span>Record type</span><select value={kind} onChange={(event) => setKind(event.target.value as MasterDataKind)}><option value="campus">Campus</option><option value="college">College</option><option value="program">Academic program</option><option value="term">Academic term</option></select></label>
    {needsCode && <div className="two-fields"><label className="field"><span>Code</span><input required value={code} onChange={(event) => { setCode(event.target.value); setError(""); }} placeholder={kind === "campus" ? "PARSU-CAMPUS" : kind === "college" ? "CECS" : "BSIT"} /></label>{needsShortName && <label className="field"><span>Short name</span><input required value={shortName} onChange={(event) => setShortName(event.target.value)} placeholder={kind === "campus" ? "Campus name" : "College acronym"} /></label>}</div>}
    {kind !== "term" && <label className="field"><span>Official name</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "program" ? "Bachelor of Science in…" : "Enter the official name"} /></label>}
    {kind === "campus" && <label className="field"><span>Municipality</span><input required value={municipality} onChange={(event) => setMunicipality(event.target.value)} placeholder="Municipality" /></label>}
    {(kind === "college" || kind === "program") && <label className="field"><span>Campus</span><select required value={campusId} onChange={(event) => selectCampus(event.target.value)}><option value="" disabled>Select a campus</option>{campusRows.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>}
    {kind === "program" && <><label className="field"><span>Owning college</span><select required value={collegeId} onChange={(event) => { setCollegeId(event.target.value); setError(""); }}><option value="" disabled>Select a college</option>{availableColleges.map((college) => <option key={college.id} value={college.id}>{college.shortName} · {college.name}</option>)}</select></label><p className="form-hint">Program codes must be unique within the selected college.</p></>}
    {kind === "term" && <><label className="field"><span>Academic year</span><select required value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)}><option value="" disabled>Select an academic year</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? " · Current" : ""}</option>)}</select></label><label className="field"><span>Term</span><select value={term} onChange={(event) => setTerm(event.target.value as typeof term)}><option value="first_semester">First Semester</option><option value="second_semester">Second Semester</option><option value="midyear">Midyear</option></select></label><div className="two-fields"><label className="field"><span>Starts on</span><input required type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label><label className="field"><span>Ends on</span><input required type="date" min={startsOn || undefined} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label></div><div className="master-current-option"><input aria-label="Make this the current term" type="checkbox" checked={isCurrent} onChange={(event) => setIsCurrent(event.target.checked)} /><span><strong>Make this the current term</strong><small>This switches the active term across PRAXIZ after the record is created.</small></span></div></>}
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="modal-actions"><ActionButton variant="secondary" onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading || (kind === "program" && !collegeId) || (kind === "term" && !academicYearId)}>{loading ? "Saving…" : "Create record"}</ActionButton></div>
  </form></Dialog>;
}

function MasterDataPage() {
  const [options, setOptions] = useState<Awaited<ReturnType<typeof institutionalService.loadRegistrationInstitutionalOptions>> | null>(null);
  const [terms, setTerms] = useState<Awaited<ReturnType<typeof institutionalService.listAcademicTerms>>>([]);
  const [years, setYears] = useState<AcademicYearRecord[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const loadAll = useCallback(async () => {
    try {
      const [hierarchy, termRows, yearRows] = await Promise.all([institutionalService.loadRegistrationInstitutionalOptions(), institutionalService.listAcademicTerms(), institutionalService.listAcademicYears()]);
      setOptions(hierarchy); setTerms(termRows); setYears(yearRows);
    } catch (reason) { setError(userError(reason)); }
  }, []);
  useEffect(() => { void Promise.resolve().then(loadAll); }, [loadAll]);
  const colleges: College[] = options?.units.filter(unit => unit.unitType === "college").map(unit => ({ id: unit.id, campusId: unit.parentId || "", name: unit.name, shortName: unit.shortName || unit.name })) ?? [];
  return <><PageHeader title="Institutional data" subtitle="Browse the actual campus, college, department and program hierarchy." action={<ActionButton icon={Plus} disabled={!options} onClick={() => setAdding(true)}>Add record</ActionButton>} />
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="inline-success" role="status">{notice}</p>}
    {options ? <InstitutionalBrowser options={options} terms={terms} /> : <div className="card page-skeleton" role="status" aria-label="Loading institutional data"><span /><span /></div>}
    {adding && options && <MasterDataDialog campuses={options.campuses} colleges={colleges} academicYears={years} close={() => setAdding(false)} onCreated={async () => { await loadAll(); setAdding(false); setNotice("Institutional record saved."); }} />}
  </>;
}

function HteVerificationPage() {
  const [applications, setApplications] = useState<RegistrationRecord[]>([]); const [organizations, setOrganizations] = useState<PartnerHteRecord[]>([]); const [search, setSearch] = useState(""); const [organizationStatus, setOrganizationStatus] = useState("Pending"); const [selected, setSelected] = useState<RegistrationRecord | null>(null); const [selectedOrganization, setSelectedOrganization] = useState<PartnerHteRecord | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { try { const [registrations, htes] = await Promise.all([registrationService.listLivePending(), coordinatorService.listPartnerHtes()]); setApplications(registrations.filter((item) => item.role === "HTE Representative")); setOrganizations(htes); } catch (reason) { setError(userError(reason, "HTE verification data could not be loaded.")); } finally { setLoading(false); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const normalizedSearch = search.trim().toLowerCase();
  const shown = applications.filter((item) => !normalizedSearch || `${item.name} ${item.email} ${item.reference} ${Object.values(item.details).join(" ")}`.toLowerCase().includes(normalizedSearch));
  const pendingOrganizations = organizations.filter((item) => (organizationStatus === "All" || item.status === organizationStatus) && (!normalizedSearch || `${item.name} ${item.industry} ${item.location}`.toLowerCase().includes(normalizedSearch)));
  return <><PageHeader title="HTE verification" subtitle="Review HTE account applications and pending partner organizations before they enter the assignment workflow." />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="stats-grid three"><StatCard label="Pending accounts" value={String(applications.length)} icon={Clock3} tone="orange" /><StatCard label="Verified organizations" value={String(organizations.filter((item) => item.status === "Verified").length)} icon={ShieldCheck} tone="green" /><StatCard label="Pending organizations" value={String(organizations.filter((item) => item.status === "Pending").length)} icon={AlertTriangle} tone="red" /></div><section className="card table-card"><div className="card-title"><h2>{loading ? "Loading verification queue…" : "Partner organization verification"}</h2><label className="field field-compact"><span>Organization status</span><select value={organizationStatus} onChange={event => setOrganizationStatus(event.target.value)}><option value="All">All</option>{["Pending", "Verified", "Rejected"].map(status => <option key={status} value={status}>{status}</option>)}</select></label><label className="table-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search verification queue…" /></label></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Organization</th><th>Industry</th><th>Location</th><th>Representative</th><th>Assigned interns</th><th>Status</th><th>Actions</th></tr></thead><tbody>{pendingOrganizations.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.industry}</td><td>{item.location}</td><td>{item.representative}</td><td>{item.assignedInterns}</td><td><StatusBadge status={item.status} /></td><td>{item.status === "Pending" ? <button className="table-link" onClick={() => setSelectedOrganization(item)}>Review</button> : <span className="muted-note">Reviewed</span>}</td></tr>)}{!loading && pendingOrganizations.length === 0 && <tr><td colSpan={6}>No partner organizations match these filters.</td></tr>}</tbody></table></div></section><section className="card table-card"><div className="card-title"><h2>{loading ? "Loading applications…" : "Pending HTE accounts"}</h2></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Organization</th><th>Applicant name</th><th>Email</th><th>Reference</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td><b>{item.details.organization_name || item.name}</b></td><td>{item.name}</td><td>{item.email}</td><td>{item.reference}</td><td>{item.submitted}</td><td><StatusBadge status={item.status} /></td><td><button className="table-link" disabled={!item.id || !["Pending", "Under Review"].includes(item.status)} onClick={() => setSelected(item)}>Review</button></td></tr>)}{!loading && shown.length === 0 && <tr><td colSpan={7}>No HTE account applications are awaiting review.</td></tr>}</tbody></table></div></section>{selectedOrganization && <HteOrganizationReviewDialog organization={selectedOrganization} close={() => setSelectedOrganization(null)} onReviewed={() => { setSelectedOrganization(null); void load(); }} />}{selected && <RegistrationReviewDialog application={selected} close={() => setSelected(null)} onReviewed={() => { setSelected(null); void load(); }} />}</>;
}

function HteOrganizationReviewDialog({ organization, close, onReviewed }: { organization: PartnerHteRecord; close: () => void; onReviewed: () => void }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision: "verified" | "rejected") {
    if (decision === "rejected" && !notes.trim()) { setError("A reason is required when rejecting an organization."); return; }
    setLoading(true); setError("");
    try { await adminService.reviewHteOrganization(organization.id, decision, notes); onReviewed(); }
    catch (reason) { setError(userError(reason, "The organization decision could not be saved.")); setLoading(false); }
  }
  return <Dialog title={`Review ${organization.name}`} onClose={close} busy={loading}><InfoCallout icon={ShieldCheck}><p>Verification makes this organization available for new internship assignments.</p></InfoCallout><dl className="info-list"><div><dt>Organization</dt><dd>{organization.name}</dd></div><div><dt>Industry</dt><dd>{organization.industry}</dd></div><div><dt>Location</dt><dd>{organization.location}</dd></div><div><dt>Representative</dt><dd>{organization.representative}</dd></div></dl><label className="field"><span>Administrator notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add verification notes or a rejection reason…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => void decide("verified")}>Verify organization</ActionButton><ActionButton variant="danger" disabled={loading || !notes.trim()} onClick={() => void decide("rejected")}>Reject</ActionButton></div></Dialog>;
}

const documentTemplatePhaseLabels: Record<DocumentTemplatePhase, string> = {
  pre_internship: "Pre-Internship",
  during_internship: "During Internship",
  post_internship: "Post-Internship",
};

function formatTemplateFileTypes(mimeTypes: string[]): string {
  const labels = mimeTypes.map((mime) => mime === "application/pdf" ? "PDF" : mime === "image/jpeg" ? "JPG" : mime === "image/png" ? "PNG" : mime);
  return labels.join(", ");
}

function DocumentTemplateDialog({ nextDisplayOrder, close, onCreated }: {
  nextDisplayOrder: number;
  close: () => void;
  onCreated: (provisionedAssignments: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<DocumentTemplatePhase>("pre_internship");
  const [mimePreset, setMimePreset] = useState<DocumentTemplateMimePreset>("pdf_images");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("20");
  const [displayOrder, setDisplayOrder] = useState(String(nextDisplayOrder));
  const [isRequired, setIsRequired] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await workflowTemplateService.createDocumentTemplate({
        code: "generated",
        name,
        description,
        phase,
        allowedMimeTypes: mimeTypesForPreset(mimePreset),
        maxFileSizeMb: Number(maxFileSizeMb),
        isRequired,
        isActive,
        displayOrder: Number(displayOrder),
      });
      await onCreated(result.provisionedAssignments);
      close();
    } catch (reason) {
      setError(userError(reason, "The document template could not be created."));
      setLoading(false);
    }
  }

  return <Dialog title="Create document requirement template" onClose={close} busy={loading} wide><InfoCallout icon={FileCheck2}><p>This creates an auditable workflow template. If it is active, PRAXIZ also adds it to current approved and active internships.</p></InfoCallout><form onSubmit={submit}>
    <div className="two-fields"><label className="field"><span>Workflow phase</span><select value={phase} onChange={(event) => setPhase(event.target.value as DocumentTemplatePhase)}><option value="pre_internship">Pre-Internship</option><option value="during_internship">During Internship</option><option value="post_internship">Post-Internship</option></select></label></div>
    <label className="field"><span>Document name</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Medical Certificate" /></label>
    <label className="field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain what the student must submit…" /></label>
    <div className="two-fields"><label className="field"><span>Accepted files</span><select value={mimePreset} onChange={(event) => setMimePreset(event.target.value as DocumentTemplateMimePreset)}><option value="pdf_images">PDF, JPG, and PNG</option><option value="pdf">PDF only</option></select></label><label className="field"><span>Maximum size (MB)</span><input required type="number" min="1" max="20" step="1" value={maxFileSizeMb} onChange={(event) => setMaxFileSizeMb(event.target.value)} /></label></div>
    <label className="field"><span>Display order</span><input required type="number" min="0" step="1" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} /></label>
    <label className="master-current-option"><input aria-label="Make this a required submission" type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} /><span><strong>Required submission</strong><small>Required templates count toward the student’s document compliance.</small></span></label>
    <label className="master-current-option"><input aria-label="Publish this requirement immediately" type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span><strong>Publish immediately</strong><small>Active templates are assigned to current approved and active internships when created.</small></span></label>
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="modal-actions"><ActionButton variant="secondary" disabled={loading} onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading}>{loading ? "Creating…" : "Create requirement"}</ActionButton></div>
  </form></Dialog>;
}

function DocumentTemplateDetails({ template, close }: { template: DocumentTemplateRecord; close: () => void }) {
  return <Dialog title={`View ${template.name}`} onClose={close}><InfoCallout icon={FileCheck2}><p>{template.description || "No description has been provided."}</p></InfoCallout><dl className="info-list"><div><dt>Code</dt><dd>{template.code}</dd></div><div><dt>Workflow phase</dt><dd>{documentTemplatePhaseLabels[template.phase]}</dd></div><div><dt>Requirement</dt><dd>{template.isRequired ? "Required" : "Optional"}</dd></div><div><dt>Accepted files</dt><dd>{formatTemplateFileTypes(template.allowedMimeTypes)}</dd></div><div><dt>Maximum size</dt><dd>{Math.round(template.maxFileSizeBytes / 1024 / 1024)} MB</dd></div><div><dt>Display order</dt><dd>{template.displayOrder}</dd></div><div><dt>Status</dt><dd>{template.isActive ? "Published" : "Inactive"}</dd></div></dl><div className="modal-actions"><ActionButton onClick={close}>Done</ActionButton></div></Dialog>;
}

const evaluationStageLabels: Record<EvaluationTemplateStage, string> = {
  midterm: "Midterm",
  final: "Final",
  other: "Other",
};

const evaluatorTypeLabels: Record<EvaluationTemplateRecord["evaluatorType"], string> = {
  hte: "HTE representative",
  coordinator: "Internship coordinator",
  faculty: "Faculty evaluator",
};

function newEvaluationCriterion(index: number): EvaluationTemplateCriterionInput {
  return { code: "", label: "", description: "", weight: 0, minimumScore: 1, maximumScore: 5, displayOrder: (index + 1) * 10 };
}

function EvaluationTemplateDialog({ close, onCreated }: { close: () => void; onCreated: (result: { version: number; criteriaCount: number }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<EvaluationTemplateStage>("final");
  const [evaluatorType, setEvaluatorType] = useState<EvaluationTemplateEvaluator>("hte");
  const [isActive, setIsActive] = useState(true);
  const [criteria, setCriteria] = useState<EvaluationTemplateCriterionInput[]>([
    { ...newEvaluationCriterion(0), weight: 100 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const totalWeight = criteria.reduce((total, criterion) => total + Number(criterion.weight || 0), 0);

  function updateCriterion(index: number, changes: Partial<EvaluationTemplateCriterionInput>) {
    setCriteria((current) => current.map((criterion, criterionIndex) => criterionIndex === index ? { ...criterion, ...changes } : criterion));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await workflowTemplateService.createEvaluationTemplate({ code: "generated", name, description, stage, evaluatorType, isActive, criteria });
      await onCreated({ version: result.version, criteriaCount: result.criteriaCount });
      close();
    } catch (reason) {
      setError(userError(reason, "The evaluation form could not be created."));
      setLoading(false);
    }
  }

  return <Dialog title="Create evaluation form" onClose={close} busy={loading} wide><InfoCallout icon={Star}><p>Create a custom scorecard only when its criteria and weighting have been institutionally approved. Use the official PSU form for standard internship evaluation. Publishing replaces the active form for the same evaluator role and stage; other roles and stages are unchanged.</p></InfoCallout><form onSubmit={submit}>
    <div className="two-fields"><label className="field"><span>Form name</span><input required value={name} onChange={(event) => { setName(event.target.value); }} placeholder="Final HTE Evaluation" /></label></div>
    <label className="field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain when and how this form should be used…" /></label>
    <div className="two-fields"><label className="field"><span>Evaluation stage</span><select value={stage} onChange={(event) => setStage(event.target.value as EvaluationTemplateStage)}><option value="midterm">Midterm</option><option value="final">Final</option><option value="other">Other</option></select></label><label className="field"><span>Evaluator</span><select value={evaluatorType} onChange={(event) => setEvaluatorType(event.target.value as EvaluationTemplateEvaluator)}><option value="hte">HTE representative</option><option value="coordinator">Internship coordinator</option></select></label></div>
    <div className="criteria-builder"><div className="criteria-builder-heading"><div><strong>Scoring criteria</strong><small>Weights must total exactly 100%. Each criterion uses a 1–5 scale.</small></div><StatusBadge status={`${totalWeight}% total`} /></div>{criteria.map((criterion, index) => <fieldset className="criterion-builder-row" key={index}><legend>Criterion {index + 1}</legend><div className="criterion-builder-primary"><label className="field"><span>Name</span><input required value={criterion.label} onChange={(event) => updateCriterion(index, { label: event.target.value, code: normalizeEvaluationCode(event.target.value) })} placeholder="Communication" /></label><label className="field criterion-weight"><span>Weight (%)</span><input required type="number" min="1" max="100" step="1" value={criterion.weight || ""} onChange={(event) => updateCriterion(index, { weight: Number(event.target.value) })} /></label></div><label className="field"><span>Description</span><input value={criterion.description} onChange={(event) => updateCriterion(index, { description: event.target.value })} placeholder="What the evaluator should assess…" /></label><button type="button" className="table-link criterion-remove" disabled={criteria.length === 1} onClick={() => setCriteria((current) => current.filter((_, criterionIndex) => criterionIndex !== index))}>Remove criterion</button></fieldset>)}<button type="button" className="button button-secondary criterion-add" disabled={criteria.length >= 20} onClick={() => setCriteria((current) => [...current, newEvaluationCriterion(current.length)])}><Plus size={17} /> Add criterion</button></div>
    <label className="master-current-option"><input aria-label="Publish this evaluation form immediately" type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span><strong>Publish immediately</strong><small>This replaces the active form for the same evaluator and stage. Previous forms remain available for historical records.</small></span></label>
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="modal-actions"><ActionButton variant="secondary" disabled={loading} onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading}>{loading ? "Creating…" : "Create evaluation form"}</ActionButton></div>
  </form></Dialog>;
}

function EvaluationTemplateDetails({ template, close }: { template: EvaluationTemplateRecord; close: () => void }) {
  return <Dialog title={`View ${template.name}`} onClose={close} wide><InfoCallout icon={Star}><p>{template.description || "No description has been provided."}</p></InfoCallout><dl className="info-list"><div><dt>Code</dt><dd>{template.code}</dd></div><div><dt>Version</dt><dd>{template.version}</dd></div><div><dt>Stage</dt><dd>{evaluationStageLabels[template.stage]}</dd></div><div><dt>Evaluator</dt><dd>{evaluatorTypeLabels[template.evaluatorType]}</dd></div><div><dt>Status</dt><dd>{template.isActive ? "Published" : "Inactive"}</dd></div><div><dt>Scoring</dt><dd>{template.metadata ? "Individual ratings from 1 to 5; no overall percentage" : template.criteria.reduce((total, criterion) => total + criterion.weight, 0) + "% configured weight"}</dd></div></dl><div className="template-criteria-summary">{template.criteria.map((criterion) => <article key={criterion.code}><div><strong>{criterion.label}</strong><small>{criterion.description || "No criterion guidance provided."}</small></div><b>{template.metadata ? "1–5" : criterion.weight + "%"}</b></article>)}</div><div className="modal-actions"><ActionButton onClick={close}>Done</ActionButton></div></Dialog>;
}

function WorkflowTemplatesPage() {
  const [confirmOfficial, setConfirmOfficial] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publishLock = useRef(false);
  async function publishOfficial() {
    if (publishLock.current) return;
    publishLock.current = true; setPublishing(true); setError("");
    try { await evaluationService.publishOfficial(); await loadTemplates(); setNotice("Official PSU-F-PLU-02 templates are published for HTE and coordinator evaluators. Historical records were preserved."); setConfirmOfficial(false); }
    catch (reason) { setError(userError(reason)); setConfirmOfficial(false); }
    finally { publishLock.current = false; setPublishing(false); }
  }
  const [section, setSection] = useState<"documents" | "evaluations">("documents");
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([]);
  const [evaluationTemplates, setEvaluationTemplates] = useState<EvaluationTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [addingEvaluation, setAddingEvaluation] = useState(false);
  const [selected, setSelected] = useState<DocumentTemplateRecord | null>(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationTemplateRecord | null>(null);

  async function loadTemplates() {
    setLoading(true);
    setError("");
    try {
      const [documents, evaluations] = await Promise.all([
        workflowTemplateService.listDocumentTemplates(),
        workflowTemplateService.listEvaluationTemplates(),
      ]);
      setTemplates(documents);
      setEvaluationTemplates(evaluations);
    }
    catch (reason) { setError(userError(reason, "Workflow templates could not be loaded.")); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([workflowTemplateService.listDocumentTemplates(), workflowTemplateService.listEvaluationTemplates()]).then(([documents, evaluations]) => {
      if (!active) return;
      setTemplates(documents);
      setEvaluationTemplates(evaluations);
    }).catch((reason) => {
      if (active) setError(userError(reason, "Workflow templates could not be loaded."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const nextDisplayOrder = templates.length ? Math.max(...templates.map((template) => template.displayOrder)) + 10 : 10;

  return <><PageHeader title="Workflow templates" subtitle="Configure document requirements and evaluation forms used throughout every internship." action={section === "documents" ? <ActionButton icon={Plus} onClick={() => { setNotice(""); setAdding(true); }}>Create requirement</ActionButton> : <ActionButton icon={Plus} onClick={() => { setNotice(""); setAddingEvaluation(true); }}>Create evaluation form</ActionButton>} />
    <div className="segmented workflow-template-tabs" role="tablist" aria-label="Workflow template type"><button type="button" role="tab" aria-selected={section === "documents"} className={section === "documents" ? "active" : ""} onClick={() => { setSection("documents"); setNotice(""); }}>Document requirements</button><button type="button" role="tab" aria-selected={section === "evaluations"} className={section === "evaluations" ? "active" : ""} onClick={() => { setSection("evaluations"); setNotice(""); }}>Evaluation forms</button></div>
    <div className="verification-principle"><ShieldCheck size={20} /><p><strong>Controlled configuration:</strong> {section === "documents" ? "published requirements are permission-checked, audit logged, and added to current approved and active internships." : "evaluation forms are versioned and audit logged. The official PSU form uses individual 1–5 ratings without an overall percentage formula."}</p></div>
    {notice && <p className="form-success"><CheckCircle2 size={16} /> {notice}</p>}
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    {section === "documents" && <section className="card table-card"><div className="card-title"><h2>{loading ? "Loading document requirements…" : "Document requirement templates"}</h2><StatusBadge status={`${templates.filter((template) => template.isActive).length} published`} /></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Form name / description</th><th>Workflow phase</th><th>Requirement</th><th>Accepted files</th><th>Limit</th><th>Status</th><th>Actions</th></tr></thead><tbody>{templates.map((template) => <tr key={template.id}><td className="record-description"><b>{template.name}</b><small>{template.description || "No description provided."}</small></td><td>{documentTemplatePhaseLabels[template.phase]}</td><td>{template.isRequired ? "Required" : "Optional"}</td><td>{formatTemplateFileTypes(template.allowedMimeTypes)}</td><td>{Math.round(template.maxFileSizeBytes / 1024 / 1024)} MB</td><td><StatusBadge status={template.isActive ? "Published" : "Inactive"} /></td><td><button className="table-link" onClick={() => setSelected(template)}>View</button></td></tr>)}{!loading && templates.length === 0 && <tr><td colSpan={7}>No document requirement templates have been configured.</td></tr>}</tbody></table></div></section>}
    {section === "evaluations" && <div className="card"><h2>Official university evaluation</h2><p>PSU-F-PLU-02 · Rev. No. 00 · January 2, 2026. 18 criteria; individual ratings only.</p><ActionButton disabled={publishing} onClick={() => setConfirmOfficial(true)}>Publish official PSU form</ActionButton></div>}
    {confirmOfficial && <ConfirmDialog title="Publish the official PSU evaluation?" message="The official form will be activated for HTE and coordinator evaluators. Previous forms remain available for existing evaluations and history." confirmLabel={publishing ? "Publishing…" : "Publish official form"} busy={publishing} onConfirm={() => void publishOfficial()} onCancel={() => setConfirmOfficial(false)} />}
    {section === "evaluations" && <section className="card table-card"><div className="card-title"><h2>{loading ? "Loading evaluation forms…" : "Evaluation form templates"}</h2><StatusBadge status={`${evaluationTemplates.filter((template) => template.isActive).length} published`} /></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Form</th><th>Stage</th><th>Evaluator</th><th>Criteria</th><th>Version</th><th>Status</th><th>Actions</th></tr></thead><tbody>{evaluationTemplates.map((template) => <tr key={template.id}><td className="record-description"><b>{template.name}</b><small>{template.description || "No description provided."}</small></td><td>{evaluationStageLabels[template.stage]}</td><td>{evaluatorTypeLabels[template.evaluatorType]}</td><td>{template.criteria.length}</td><td>v{template.version}</td><td><StatusBadge status={template.isActive ? "Published" : "Inactive"} /></td><td><button className="table-link" onClick={() => setSelectedEvaluation(template)}>View</button></td></tr>)}{!loading && evaluationTemplates.length === 0 && <tr><td colSpan={7}>No evaluation forms have been configured. Create one to enable evaluation scoring.</td></tr>}</tbody></table></div></section>}
    {adding && <DocumentTemplateDialog nextDisplayOrder={nextDisplayOrder} close={() => setAdding(false)} onCreated={async (count) => { await loadTemplates(); setNotice(count > 0 ? `Requirement created and added to ${count} current internship${count === 1 ? "" : "s"}.` : "Requirement created. No current internship needed provisioning."); }} />}
    {addingEvaluation && <EvaluationTemplateDialog close={() => setAddingEvaluation(false)} onCreated={async ({ version, criteriaCount }) => { await loadTemplates(); setSection("evaluations"); setNotice(`Evaluation form version ${version} created with ${criteriaCount} scoring ${criteriaCount === 1 ? "criterion" : "criteria"}.`); }} />}
    {selected && <DocumentTemplateDetails template={selected} close={() => setSelected(null)} />}
    {selectedEvaluation && <EvaluationTemplateDetails template={selectedEvaluation} close={() => setSelectedEvaluation(null)} />}
  </>;
}

function RegistrationReviewDialog({ application, close, onReviewed }: { application: RegistrationRecord; close: () => void; onReviewed: () => void }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision: "approved" | "rejected") {
    if (decision === "rejected" && !notes.trim()) {
      setError("A reason is required when rejecting a registration.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await registrationService.review(application.id, decision, notes);
      onReviewed();
    } catch (reason) {
      setError(userError(reason, "The registration decision could not be saved."));
      setLoading(false);
    }
  }
  const visibleDetails = Object.entries(application.details).filter(([key]) => !["requested_role", "first_name", "middle_name", "last_name", "program_ids"].includes(key));
  return <Dialog title={`Review ${application.name}`} onClose={close} busy={loading}><InfoCallout icon={UserCheck}><p><strong>{application.name}</strong><br />{application.email} · {application.role}</p></InfoCallout><dl className="info-list">{visibleDetails.map(([key, value]) => { let displayValue = value; if (key === "program_names") { try { displayValue = (JSON.parse(value) as string[]).join(", "); } catch { displayValue = value; } } return <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{displayValue}</dd></div>; })}</dl><label className="field"><span>Administrator notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add verification notes or a rejection reason…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => void decide("approved")}>Approve and activate</ActionButton><ActionButton variant="danger" disabled={loading || !notes.trim()} onClick={() => void decide("rejected")}>Reject</ActionButton></div></Dialog>;
}

function RegistrationTable({ includeReviewed = false }: { includeReviewed?: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [records, setRecords] = useState<RegistrationRecord[]>([]);
  const [selected, setSelected] = useState<RegistrationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    try { setRecords(await registrationService.listLive(includeReviewed)); }
    catch (reason) { setError(userError(reason, "Pending registrations could not be loaded.")); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void registrationService.listLive(includeReviewed).then((result) => {
      if (active) setRecords(result);
    }).catch((reason) => {
      if (active) setError(userError(reason, "Pending registrations could not be loaded."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [includeReviewed]);
  const shown = records.filter(r => (status === "All" || r.status === status) && [r.name,r.email,r.reference,r.role].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  return <>{includeReviewed && <div className="card-title"><label className="field field-compact"><span>Search applicants</span><input aria-label="Search name or email" placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="field field-compact"><span>Status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="All">All</option>{[...new Set(records.map(r => r.status))].map(s => <option key={s} value={s}>{s}</option>)}</select></label></div>}{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Requested role</th><th>Reference</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td className="email-cell" title={item.email}>{item.email}</td><td>{item.role}</td><td>{item.reference}</td><td>{item.submitted}</td><td><StatusBadge status={item.status} /></td><td>{["Pending","Under Review"].includes(item.status) ? <button className="table-link" onClick={() => setSelected(item)}>Review</button> : "Reviewed"}</td></tr>)}{!loading && shown.length === 0 && <tr><td colSpan={7}>No registration applications match this view.</td></tr>}</tbody></table></div>{selected && <RegistrationReviewDialog application={selected} close={() => setSelected(null)} onReviewed={() => { setSelected(null); void load(); }} />}</>;
}

function RegistrationsPage() {
  return <><PageHeader title="Registrations" subtitle="Verify identities and role requests before account activation." /><section className="card table-card"><RegistrationTable includeReviewed /></section></>;
}

function DashboardRouter({ role, page }: { role: RoleId; page: string }) {
  const allowedPages = new Set([
    ...roles[role].nav.filter((item) => !item.permission || hasPermission(role, item.permission)).map((item) => item.href.split("/").filter(Boolean).at(-1)),
    "profile",
    "settings",
  ]);
  if (!allowedPages.has(page)) return <AppShell role={role} page={page}><EmptyAction icon={ShieldCheck} title="Access restricted" copy="This workspace is not included in your active role permissions." action={<Link className="button button-primary" href={`/${role}/dashboard`}>Return to dashboard</Link>} /></AppShell>;
  let content: ReactNode;
  if (page === "dashboard") content = role === "student" ? <StudentDashboard /> : role === "hte" ? <HteDashboard /> : role === "coordinator" ? <CoordinatorDashboard /> : <AdminDashboard />;
  else if (page === "attendance") content = <AttendancePage role={role} />;
  else if (page === "daily-logs" || page === "logs") content = <DailyLogsPage role={role} />;
  else if (page === "documents") content = <DocumentsPage role={role} />;
  else if (page === "evaluations") content = <EvaluationsPage role={role} />;
  else if (page === "progress") content = <ProgressPage />;
  else if (page === "notifications") content = <NotificationsPage />;
  else if (page === "profile") content = <ProfilePage role={role} />;
  else if (page === "settings") content = <ProfilePage role={role} settings />;
  else if (page === "interns") content = <InternManagementPage role={role} />;
  else if (page === "analytics") content = <AnalyticsPage />;
  else if (page === "reports") content = <ReportsPage />;
  else if (page === "feedback") content = <FeedbackPage />;
  else if (page === "htes") content = <PartnerHtesPage />;
  else if (page === "assignments") content = <AssignmentsPage />;
  else if (page === "users") content = <UserAccountsPage />;
  else if (page === "master-data") content = <MasterDataPage />;
  else if (page === "hte-verification") content = <HteVerificationPage />;
  else if (page === "templates") content = <WorkflowTemplatesPage />;
  else if (page === "roles") content = <RolesPage />;
  else if (page === "audit-logs") content = <AuditLogsPage />;
  else if (page === "registrations") content = <RegistrationsPage />;
  else content = <EmptyAction icon={FileText} title="This workspace is ready" copy="Choose a section from the navigation to continue." />;
  return <AppShell role={role} page={page}>{content}</AppShell>;
}

function PraxizRouter() {
  const pathname = usePathname() || "/";
  const parts = pathname.split("/").filter(Boolean);
  if (pathname === "/") return <LandingPage />;
  if (pathname === "/contact") return <ContactPage />;
  if (pathname === "/privacy") return <PolicyPage kind="privacy" />;
  if (pathname === "/terms") return <PolicyPage kind="terms" />;
  if (pathname === "/signin" || pathname === "/login") return <SignInPage />;
  if (pathname === "/forgot-password") return <ForgotPasswordPage />;
  if (pathname === "/reset-password") return <ResetPasswordPage />;
  if (pathname === "/register/success") return <RegistrationSuccessPage />;
  if (pathname === "/register") return <RegisterPage />;
  if (!roleIds.includes(parts[0] as RoleId)) return <div className="success-page"><PublicHeader /><main><span className="success-icon"><AlertTriangle size={38} /></span><span className="eyebrow dark">Page not found</span><h1>This PRAXIZ page does not exist.</h1><p>Use the public navigation or sign in to open your assigned workspace.</p><Link className="button button-primary button-large" href="/signin">Go to sign in</Link></main></div>;
  const role = parts[0] as RoleId;
  const page = parts[1] || "dashboard";
  return <ProtectedRoute role={role}><DashboardRouter role={role} page={page} /></ProtectedRoute>;
}

export default function PraxizApp() {
  return <AuthProvider><PraxizRouter /></AuthProvider>;
}
