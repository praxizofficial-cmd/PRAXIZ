"use client";

import type { AnchorHTMLAttributes, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
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
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
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
import {
  academicTerms,
  campuses,
  colleges,
  programs,
  roles,
} from "./data";
import { AuthProvider, ProtectedRoute, useAuth } from "./auth/supabase-auth";
import { formatCoordinatorSidebarSubtitle, formatStudentSidebarSubtitle } from "./auth/student-stabilization";
import { hasPermission } from "./permissions";
import {
  adminService,
  attendanceService,
  dailyLogService,
  documentService,
  evaluationService,
  feedbackService,
  internshipService,
  institutionalService,
  notificationService,
  registrationService,
  workflowTemplateService,
  type AcademicYearRecord,
  type AttendanceHistoryRow,
  type DailyLogRecord,
  type DocumentRecord,
  type DocumentTemplateRecord,
  type EvaluationAssignment,
  type EvaluationCriterionRecord,
  type EvaluationRecord,
  type NotificationRecord,
  type RegistrationRecord,
  type StudentProgressSummary,
} from "./services/praxiz-services";
import { programsForCollege, unitsForCampus } from "./services/institutional-stabilization";
import { mimeTypesForPreset, type DocumentTemplateMimePreset, type DocumentTemplatePhase } from "./services/workflow-template-stabilization";
import { roleIds, type AttendanceSession, type Campus, type College, type Intern, type RoleId } from "./types";

function Link({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...props}>{children}</a>;
}

const attendanceRecords = attendanceService.listHistory();
const feedbackThreads = feedbackService.list();
const interns = internshipService.listInterns();
const currentAcademicTerm = academicTerms.find((term) => term.isCurrent) ?? academicTerms[0];

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

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark"><GraduationCap size={24} strokeWidth={1.8} /></span>
      {!compact && <span><strong>PRAXIZ</strong><small>PARTIDO STATE UNIVERSITY</small></span>}
    </div>
  );
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
  const tone = key.includes("approved") || key.includes("verified") || key.includes("active") || key.includes("complete") || key.includes("resolved") || key.includes("finalized") || key.includes("available") || key === "good"
    ? "success"
    : key.includes("revision") || key.includes("missing") || key.includes("rejected") || key.includes("flagged")
      ? "danger"
      : key.includes("attention") || key.includes("pending") || key.includes("progress") || key.includes("review") || key.includes("awaiting")
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
      <div className={`stat-icon stat-${tone}`}><Icon size={22} /></div>
      <p>{label}</p>
      <div className="stat-value"><strong>{value}</strong>{detail && <span>{detail}</span>}</div>
      {typeof progress === "number" && <ProgressBar value={progress} tone={tone === "green" ? "green" : tone === "orange" ? "orange" : "blue"} />}
    </article>
  );
}

function PublicHeader() {
  return (
    <header className="public-header">
      <Link href="/" aria-label="PRAXIZ home"><Logo /></Link>
      <nav aria-label="Public navigation">
        <Link href="/signin" className="public-link">Sign in</Link>
        <Link href="/register" className="button button-light">Create account</Link>
      </nav>
    </header>
  );
}

function LandingPage() {
  return (
    <div className="landing">
      <PublicHeader />
      <main>
        <section className="hero">
          <div className="hero-orb hero-orb-one" /><div className="hero-orb hero-orb-two" />
          <span className="semester"><span /> AY {currentAcademicTerm.academicYear} · {currentAcademicTerm.term}</span>
          <p className="eyebrow">What is PRAXIZ?</p>
          <h1>The complete internship journey, <em>clearly monitored.</em></h1>
          <p className="hero-copy">PRAXIZ is an AI-powered internship monitoring and management platform for Partido State University. It brings attendance, daily activities, document submissions, evaluations, progress monitoring, and decision-support insights into one secure institutional workspace.</p>
          <div className="hero-actions">
            <Link className="button button-light button-large" href="/signin">Sign in to PRAXIZ <ChevronRight size={19} /></Link>
            <Link className="button button-outline-light button-large" href="/register">Create an account</Link>
          </div>
          <div className="feature-grid" aria-label="Platform highlights">
            <article><span><CalendarCheck2 size={21} /></span><h2>Event-driven attendance</h2><p>Record Time In and Time Out events and track verified hours.</p></article>
            <article><span><FileText size={21} /></span><h2>Logs and documents</h2><p>Submit work records and requirements with traceable reviews.</p></article>
            <article><span><Star size={21} /></span><h2>Evaluations and progress</h2><p>Follow evaluation completion, requirements, and milestones.</p></article>
            <article><span><ChartNoAxesCombined size={21} /></span><h2>Institutional insights</h2><p>Support coordinators with campus-aware monitoring and reports.</p></article>
          </div>
        </section>
      </main>
      <footer className="landing-footer"><span>© 2026 Partido State University</span><span>PRAXIZ · Secure internship monitoring platform</span></footer>
    </div>
  );
}

function AuthAside({ title, copy, children }: { title: string; copy: string; children?: ReactNode }) {
  return (
    <aside className="auth-aside">
      <Link href="/" className="back-link"><ArrowLeft size={17} /> Back to welcome</Link>
      <Logo />
      <div className="auth-aside-copy"><h1>{title}</h1><p>{copy}</p>{children}</div>
      <div className="security-notes"><span><LockKeyhole size={16} /> Secure PSU authentication</span><span><ShieldCheck size={16} /> Role-based dashboard access</span><span><Activity size={16} /> Verified-data analytics foundation</span></div>
    </aside>
  );
}

function SignInPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
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
      const account = await signIn(email, password);
      window.location.href = `/${account.role}/dashboard`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in was unsuccessful.");
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
            <label className="remember-row"><input type="checkbox" /> <span>Remember my email on this device</span></label>
            {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
            <ActionButton type="submit" disabled={loading}>{loading ? "Recognizing account…" : "Sign in to PRAXIZ"}</ActionButton>
          </form>
          <p className="auth-switch">Don’t have an account yet? <Link href="/register">Create an account</Link></p>
          <p className="secure-form-note"><ShieldCheck size={16} /> Authentication and role access are verified by Supabase.</p>
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
      setError(reason instanceof Error ? reason.message : "The reset request could not be sent.");
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
      setError(reason instanceof Error ? reason.message : "The password could not be updated.");
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

function RegistrationFields({ role }: { role: RoleId }) {
  const isHte = role === "hte";
  const isStudent = role === "student";
  const hasProgramScope = isStudent || role === "coordinator";
  const [campusId, setCampusId] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [programId, setProgramId] = useState("");
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

  return (
    <>
      <div className="two-fields">
        <label className="field"><span>{isHte ? "Organization / company name" : "Full name"} *</span><input required name={isHte ? "organizationName" : "fullName"} placeholder={isHte ? "e.g. TechSouth Philippines, Inc." : "e.g. Maria B. Santos"} /></label>
        <label className="field"><span>{isStudent ? "Student number" : isHte ? "Representative full name" : "Employee number"} *</span><input required name={isStudent ? "studentNumber" : isHte ? "representativeName" : "employeeNumber"} placeholder={isStudent ? "e.g. 2023-00123" : isHte ? "e.g. Allan D. Maraña" : "Enter official identifier"} /></label>
      </div>
      {isHte && <div className="two-fields"><label className="field"><span>Position / title *</span><input required name="position" placeholder="e.g. OJT Supervisor" /></label><label className="field"><span>Contact number *</span><input required name="contactNumber" inputMode="tel" placeholder="e.g. +63 9XX XXX XXXX" /></label></div>}
      <label className="field"><span>{isStudent ? "Institutional email" : "Official email address"} *</span><input required name="email" type="email" autoComplete="email" placeholder={isStudent ? "studentid.pbox@parsu.edu.ph" : "name@organization.edu.ph"} /></label>
      {!isHte && <><div className="two-fields"><label className="field"><span>Campus *</span><select required name="campusId" value={campusId} disabled={!registrationOptions} onChange={(event) => { setCampusId(event.target.value); setCollegeId(""); setProgramId(""); }}><option value="" disabled>{registrationOptions ? "Select campus" : "Loading institutional options..."}</option>{campusOptions.map((campus) => <option key={campus.id} value={campus.id}>{campus.shortName}</option>)}</select></label><label className="field"><span>College / academic unit *</span><select required name="collegeId" value={collegeId} disabled={!campusId} onChange={(event) => { setCollegeId(event.target.value); setProgramId(""); }}><option value="" disabled>Select college or unit</option>{collegeOptions.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}</select></label></div>{hasProgramScope && <div className="two-fields"><label className="field"><span>{isStudent ? "Program / course" : "Coordinated program"} *</span><select required name="programId" value={programId} disabled={!collegeId} onChange={(event) => setProgramId(event.target.value)}><option value="" disabled>Select program</option>{programOptions.map((program) => <option key={program.id} value={program.id}>{program.code} — {program.name}</option>)}</select></label>{isStudent && <label className="field"><span>Year level *</span><select required name="yearLevel" defaultValue=""><option value="" disabled>Select year level</option><option value="1">First Year</option><option value="2">Second Year</option><option value="3">Third Year</option><option value="4">Fourth Year</option><option value="5">Fifth Year</option></select></label>}</div>}{institutionalError && <p className="form-error"><AlertTriangle size={16} /> {institutionalError}</p>}</>}
      {isHte && <><label className="field"><span>Office address *</span><textarea required name="officeAddress" placeholder="Enter the official business address" /></label><label className="field"><span>Available internship slots *</span><input required name="availableSlots" type="number" min="1" placeholder="e.g. 5" /></label></>}
      <div className="two-fields"><label className="field"><span>Password *</span><input required name="password" type="password" minLength={8} autoComplete="new-password" placeholder="Create a password" /></label><label className="field"><span>Confirm password *</span><input required name="confirmPassword" type="password" minLength={8} autoComplete="new-password" placeholder="Re-enter password" /></label></div>
    </>
  );
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
      setError(reason instanceof Error ? reason.message : "Registration could not be submitted.");
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
          {!role ? <div className="role-empty"><UsersRound size={34} /><h3>Select a role to begin</h3><p>Each stakeholder receives a form and access level tailored to their responsibility.</p></div> : <form className="registration-form" onSubmit={submit}><div className="form-card-heading"><span className={`role-dot role-${role}`}>{roleOptions.find((r) => r.id === role)?.short}</span><span><strong>{roles[role].label} registration</strong><small>Fields marked * are required for verification</small></span></div><RegistrationFields role={role} /><label className="consent"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I confirm the information is accurate and agree to PRAXIZ’s <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</span></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<ActionButton type="submit" disabled={!agree || loading}>{loading ? "Creating secure account…" : "Submit registration"}</ActionButton></form>}
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
  const [bellOpen, setBellOpen] = useState(false);
  const [shellNotifications, setShellNotifications] = useState<NotificationRecord[]>([]);
  const current = roles[role];
  const visibleNavigation = current.nav.filter((item) => !item.permission || hasPermission(role, item.permission));
  const active = visibleNavigation.find((item) => item.href.endsWith(`/${page}`));
  const title = active?.label ?? "Dashboard";
  const displayName = user?.fullName ?? current.user;
  const displayInitials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || current.initials;
  const displaySubtitle = role === "student"
    ? formatStudentSidebarSubtitle(user?.academicProgram, user?.yearLevel, current.subtitle)
    : role === "coordinator"
      ? formatCoordinatorSidebarSubtitle(user?.college, user?.scopeProgramCode, current.subtitle)
      : current.subtitle;
  const unread = shellNotifications.filter((item) => item.unread).length;
  useEffect(() => {
    let activeRequest = true;
    if (user) {
      void notificationService.listLive().then((items) => {
        if (activeRequest) setShellNotifications(items);
      }).catch(() => undefined);
    }
    return () => { activeRequest = false; };
  }, [user]);
  async function markShellNotificationsRead() {
    try {
      await notificationService.markAllRead();
      setShellNotifications(shellNotifications.map((item) => ({ ...item, unread: false })));
    } catch { /* The full notifications page displays recoverable errors. */ }
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Link href={`/${role}/dashboard`}><Logo /></Link><button className="sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={20} /></button></div>
        <div className="role-label">{current.label}</div>
        <nav className="side-nav" aria-label={`${current.label} navigation`}>{visibleNavigation.map((item) => { const Icon = iconMap[item.icon] ?? Gauge; const selected = item.href.endsWith(`/${page}`); return <Link className={selected ? "active" : ""} href={item.href} key={item.href}><Icon size={20} /><span>{item.label}</span></Link>; })}</nav>
        <div className="sidebar-user"><span className={`avatar avatar-${current.accent}`}>{displayInitials}</span><span><strong>{displayName}</strong><small>{displaySubtitle}</small></span></div>
        <Link className={`settings-link ${page === "settings" ? "active" : ""}`} href={`/${role}/settings`}><Settings size={20} /> Settings</Link>
      </aside>
      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <section className="app-area">
        <header className="app-header">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="crumb"><strong>{title}</strong><small>PRAXIZ <ChevronRight size={12} /> {title}</small></div>
          <div className="header-actions">
            <div className="popover-wrap"><button className="icon-button" aria-label={`${unread} unread notifications`} onClick={() => setBellOpen(!bellOpen)}><Bell size={21} />{unread > 0 && <b>{unread}</b>}</button>{bellOpen && <div className="header-popover notification-popover"><strong>Notifications</strong>{shellNotifications.slice(0, 3).map((item) => <Link href={`/${role}/notifications`} key={item.id}><span className={`mini-dot dot-${item.tone}`} /><span><b>{item.title}</b><small>{item.time}</small></span></Link>)}{shellNotifications.length === 0 && <small>No notifications yet.</small>}{unread > 0 && <button onClick={() => { void markShellNotificationsRead(); }}>Mark all as read</button>}</div>}</div>
            <div className="popover-wrap"><button className="user-trigger" onClick={() => setMenu(!menu)} aria-expanded={menu}><span className={`avatar avatar-${current.accent}`}>{displayInitials}</span><span><strong>{displayName}</strong><small>{current.label}</small></span><ChevronDown size={16} /></button>{menu && <div className="header-popover user-popover">{user?.roles.filter((availableRole) => availableRole !== role).map((availableRole) => <Link href={`/${availableRole}/dashboard`} key={availableRole}><ShieldCheck size={17} /> {roles[availableRole].label} workspace</Link>)}<Link href={`/${role}/profile`}><UserRound size={17} /> Profile</Link><Link href={`/${role}/settings`}><Settings size={17} /> Settings</Link><hr /><button className="sign-out" onClick={() => { void signOut().finally(() => { window.location.href = "/signin"; }); }}><LogOut size={17} /> Sign out</button></div>}</div>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </section>
    </div>
  );
}

function EmptyAction({ icon: Icon, title, copy, action }: { icon: LucideIcon; title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-action"><span><Icon size={26} /></span><h3>{title}</h3><p>{copy}</p>{action}</div>;
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><span className="modal-icon"><Clock3 /></span><h2 id="confirm-title">{title}</h2><p id="confirm-message">{message}</p><div className="modal-actions"><ActionButton variant="secondary" onClick={onCancel}>Cancel</ActionButton><ActionButton onClick={onConfirm}>{confirmLabel}</ActionButton></div></section></div>;
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
      if (activeRequest) setError(reason instanceof Error ? reason.message : "Your internship dashboard could not be loaded.");
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
      if (active) setError(reason instanceof Error ? reason.message : "The supervision dashboard could not be loaded.");
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
  const [rows, setRows] = useState<Intern[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void internshipService.listLiveInterns().then((records) => {
      if (active) setRows(records);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "The coordinator dashboard could not be loaded.");
    });
    return () => { active = false; };
  }, []);
  const totalInterns = rows.length;
  const activeInterns = rows.filter((intern) => intern.status === "Active" || intern.status === "Needs Attention").length;
  const completedInterns = rows.filter((intern) => intern.status === "Completed").length;
  const partnerHtes = new Set(rows.map((intern) => intern.hte)).size;
  const requirementCounts = rows.map((intern) => intern.requirements.split("/").map(Number)).map(([approved = 0, required = 0]) => ({ approved, required }));
  const missingRequirements = requirementCounts.reduce((sum, item) => sum + Math.max(0, item.required - item.approved), 0);
  const completeDocuments = requirementCounts.filter((item) => item.required > 0 && item.approved >= item.required).length;
  const partialDocuments = requirementCounts.filter((item) => item.approved > 0 && item.approved < item.required).length;
  const missingDocuments = Math.max(0, totalInterns - completeDocuments - partialDocuments);
  const averageAttendance = totalInterns ? Math.round(rows.reduce((sum, row) => sum + row.attendance, 0) / totalInterns) : 0;
  const hteCounts = [...rows.reduce((counts, intern) => counts.set(intern.hte, (counts.get(intern.hte) ?? 0) + 1), new Map<string, number>()).entries()].sort((left, right) => right[1] - left[1]);
  const maxHteCount = Math.max(1, ...hteCounts.map(([, count]) => count));
  const attentionRows = rows.filter((intern) => {
    const [approved = 0, required = 0] = intern.requirements.split("/").map(Number);
    return intern.status === "Needs Attention" || approved < required;
  });
  return <><PageHeader title={`Good day, ${user?.fullName ?? "Internship Coordinator"}`} subtitle={`Live internship overview for AY ${currentAcademicTerm.academicYear}, ${currentAcademicTerm.term}.`} />
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="stats-grid five"><StatCard label="Total interns" value={String(totalInterns)} detail="within your authorized scope" icon={UsersRound} /><StatCard label="Active interns" value={String(activeInterns)} detail={totalInterns ? `${Math.round(activeInterns / totalInterns * 100)}% of total` : "No assignments yet"} icon={CheckCircle2} /><StatCard label="Completed" value={String(completedInterns)} detail={totalInterns ? `${Math.round(completedInterns / totalInterns * 100)}% completed` : "No assignments yet"} icon={GraduationCap} tone="green" /><StatCard label="Partner HTEs" value={String(partnerHtes)} detail="with visible assignments" icon={BriefcaseBusiness} tone="orange" /><StatCard label="Missing requirements" value={String(missingRequirements)} detail="needs follow-up" icon={AlertTriangle} tone="red" /></div>
    <div className="chart-grid"><section className="card"><h2>Portfolio attendance verification</h2><div className="progress-card"><div className="metric-row"><span>Average verified-session rate</span><strong>{averageAttendance}%</strong></div><ProgressBar value={averageAttendance} /><p className="muted-note">Calculated from the attendance sessions visible within your coordinator scope.</p></div></section><section className="card donut-card"><h2>Document compliance</h2><div className="donut"><strong>{totalInterns}<small>interns</small></strong></div><ul className="legend"><li><i className="green" /> Complete <b>{completeDocuments}</b></li><li><i className="orange" /> Partial <b>{partialDocuments}</b></li><li><i className="red" /> Missing <b>{missingDocuments}</b></li></ul></section></div>
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
      if (active) setError(reason instanceof Error ? reason.message : "Administrative totals could not be loaded.");
    });
    return () => { active = false; };
  }, []);
  return <><PageHeader title="System administration" subtitle="Manage access, registrations, institutional master data, and system activity." action={<Link className="button button-primary" href="/admin/registrations"><UserCheck size={18} /> Review registrations</Link>} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="stats-grid four"><StatCard label="Active accounts" value={String(data.activeAccounts)} detail="live Supabase profiles" icon={UsersRound} /><StatCard label="Pending registrations" value={String(data.pendingRegistrations)} icon={Clock3} tone="orange" /><StatCard label="Role assignments" value={String(data.roleAssignments)} detail="active scopes" icon={ShieldCheck} tone="green" /><StatCard label="Audit events" value={String(data.securityEvents)} detail="last 24 hours" icon={LockKeyhole} tone="violet" /></div><div className="dashboard-grid"><section className="card table-card"><h2>Pending registrations</h2><RegistrationTable /></section><aside className="card"><h2>System health</h2><div className="health-list"><div><CheckCircle2 /><span><strong>Supabase services</strong><small>Connected</small></span><StatusBadge status="Healthy" /></div><div><CheckCircle2 /><span><strong>Row Level Security</strong><small>45 public tables protected</small></span><StatusBadge status="Healthy" /></div><div><CheckCircle2 /><span><strong>Private file storage</strong><small>Signed access only</small></span><StatusBadge status="Healthy" /></div></div></aside></div></>;
}

function InternTable({ rows, compact = false }: { rows: Intern[]; compact?: boolean }) {
  return <div className="table-scroll"><table className={`data-table ${compact ? "compact-table" : ""}`}><thead><tr><th>Student</th>{!compact && <th>Campus</th>}{!compact && <th>Program</th>}<th>HTE</th>{!compact && <th>HTE representative</th>}<th>Hours</th><th>Attendance</th>{!compact && <th>Requirements</th>}<th>Status</th></tr></thead><tbody>{rows.map((intern) => { const requiredHours = intern.requiredHours ?? 400; return <tr key={intern.name}><td><span className="person-cell"><i>{intern.initials}</i><b>{intern.name}</b></span></td>{!compact && <td>{intern.campus}</td>}{!compact && <td>{intern.program}</td>}<td>{intern.hte}</td>{!compact && <td>{intern.hteRepresentative}</td>}<td><span className="hours-cell">{intern.hours}/{requiredHours}<ProgressBar value={requiredHours ? Math.min(100, intern.hours / requiredHours * 100) : 0} /></span></td><td>{intern.attendance}%</td>{!compact && <td>{intern.requirements}</td>}<td><StatusBadge status={intern.status} /></td></tr>; })}</tbody></table></div>;
}

function AttendanceReviewDialog({ record, close, onSaved }: { record: AttendanceHistoryRow; close: () => void; onSaved: () => void }) {
  const [remarks, setRemarks] = useState(record.remarks === "—" ? "" : record.remarks);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision: "verified" | "flagged" | "rejected") {
    if (decision !== "verified" && !remarks.trim()) return;
    setLoading(true);
    setError("");
    try {
      await attendanceService.review(record.id, decision, remarks);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The attendance decision could not be saved.");
      setLoading(false);
    }
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal attendance-review-modal" role="dialog" aria-modal="true" aria-label="Review attendance session"><button className="modal-close" onClick={close} aria-label="Close attendance review"><X size={20} /></button><span className="modal-icon"><ShieldCheck /></span><h2>Review attendance session</h2><p><strong>{record.studentName}</strong> · {record.date}</p><div className="readonly-event-grid"><div><span>Time In</span><strong>{record.timeIn}</strong><small>Original event · read-only</small></div><div><span>Time Out</span><strong>{record.timeOut}</strong><small>Original event · read-only</small></div></div><label className="field"><span>Verification remarks</span><textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Add the basis for your review decision…" /></label><p className="form-hint">A reason is required when flagging or rejecting a session.</p>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions review-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => void decide("verified")}>Verify</ActionButton><ActionButton variant="secondary" disabled={loading || !remarks.trim()} onClick={() => void decide("flagged")}>Flag</ActionButton><ActionButton variant="danger" disabled={loading || !remarks.trim()} onClick={() => void decide("rejected")}>Reject</ActionButton></div></section></div>;
}

function AttendancePage({ role }: { role: RoleId }) {
  const student = role === "student";
  const hte = role === "hte";
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [attendanceRows, setAttendanceRows] = useState(attendanceRecords);
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
      if (active) setAttendanceError(reason instanceof Error ? reason.message : "Attendance could not be loaded.");
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
      if (active) setAttendanceError(reason instanceof Error ? reason.message : "Progress totals could not be loaded.");
    });
    return () => { active = false; };
  }, [student]);

  async function recordTimeIn() {
    setAttendanceLoading(true);
    setAttendanceError("");
    try {
      setCurrentSession(await attendanceService.timeIn());
      setAttendanceRows(await attendanceService.listLiveHistory());
    } catch (reason) {
      setAttendanceError(reason instanceof Error ? reason.message : "Time In could not be recorded.");
    } finally {
      setAttendanceLoading(false);
    }
  }

  async function recordTimeOut() {
    if (!currentSession) return;
    setAttendanceLoading(true);
    setAttendanceError("");
    try {
      setCurrentSession(await attendanceService.timeOut(currentSession));
      setAttendanceRows(await attendanceService.listLiveHistory());
      setConfirmTimeOut(false);
    } catch (reason) {
      setAttendanceError(reason instanceof Error ? reason.message : "Time Out could not be recorded.");
    } finally {
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
      setAttendanceError(reason instanceof Error ? reason.message : "Attendance could not be refreshed.");
    } finally {
      setAttendanceLoading(false);
    }
  }

  function exportAttendanceCsv() {
    const escape = (value: string) => `"${(/^[=+\-@]/.test(value) ? "'" : "")}${value.replaceAll('"', '""')}"`;
    const header = ["Student", "Date", "Day", "Time In", "Time Out", "Rendered Hours", "Status", "Verified By", "Remarks"];
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
    {attendanceError && <p className="form-error"><AlertTriangle size={16} /> {attendanceError}</p>}
    {student ? <><section className={`attendance-action-card card ${currentSession?.status === "Active" ? "session-active" : ""}`}><div className="attendance-action-copy"><span className="eyebrow dark">Today’s attendance session</span><h2>{!currentSession ? "Ready to record Time In" : currentSession.status === "Active" ? "Attendance session active" : "Attendance submitted for verification"}</h2><p>{!currentSession ? "Press Time In when you begin work at your assigned HTE. Supabase will record the authoritative server timestamp." : currentSession.status === "Active" ? "Your original Time In event is locked. Press Time Out only when your work session ends." : "Both original events are locked. Verified hours will be added to progress only after an authorized reviewer confirms this session."}</p><div className="integrity-note"><ShieldCheck size={18} /><span>Attendance timestamps cannot be typed or edited. They are generated and protected by the PRAXIZ database.</span></div></div><div className="attendance-action-panel">{!currentSession ? <><Clock3 size={32} /><strong>{attendanceLoading ? "Checking today’s session…" : "No active session"}</strong><ActionButton icon={Clock3} disabled={attendanceLoading || !progress} onClick={recordTimeIn}>{attendanceLoading ? "Please wait…" : "Time In"}</ActionButton></> : <><StatusBadge status={currentSession.status} /><dl><div><dt>Time In</dt><dd>{formatTimestamp(currentSession.timeIn.occurredAt)}</dd></div><div><dt>Time Out</dt><dd>{currentSession.timeOut ? formatTimestamp(currentSession.timeOut.occurredAt) : "Not recorded"}</dd></div></dl>{currentSession.status === "Active" && <ActionButton icon={Clock3} disabled={attendanceLoading} onClick={() => setConfirmTimeOut(true)}>Time Out</ActionButton>}{currentSession.status === "Pending Verification" && <span className="pending-copy"><Clock3 size={17} /> Awaiting authorized review</span>}</>}</div></section><section className="card hours-overview"><div><strong>{renderedHours} hrs</strong><span>Verified rendered hours</span></div><div><strong>{requiredHours} hrs</strong><span>Required internship hours</span></div><div><strong className="orange-text">{remainingHours} hrs</strong><span>Remaining verified hours</span></div><div className="hours-progress"><div className="metric-row"><span>{renderedHours} of {requiredHours} verified hours</span><strong>{hoursPercent}%</strong></div><ProgressBar value={hoursPercent} /></div></section><div className="stats-grid three"><StatCard label="Attendance rate" value={`${progress?.attendanceRate ?? 0}%`} icon={CalendarCheck2} /><StatCard label="Recorded sessions" value={String(attendanceRows.length)} detail="loaded from Supabase" icon={CheckCircle2} tone="green" /><StatCard label="Timestamp source" value="Server" icon={Clock3} tone="violet" /></div></> : <><div className="verification-principle"><ShieldCheck size={20} /><p><strong>Original event protection:</strong> reviewers may verify, flag, or reject a session and add remarks. Time In and Time Out values are read-only.</p></div><div className="stats-grid three"><StatCard label="Visible sessions" value={String(attendanceRows.length)} icon={Clock3} tone="orange" /><StatCard label="Verified" value={String(attendanceRows.filter((row) => row.status === "Verified").length)} icon={CheckCircle2} tone="green" /><StatCard label="Flagged or rejected" value={String(attendanceRows.filter((row) => row.status === "Flagged" || row.status === "Rejected").length)} icon={AlertTriangle} tone="red" /></div></>}
    <section className="card table-card"><div className="card-title"><h2>{student ? "Attendance history" : "Sessions for review"}</h2><div className="inline-actions"><ActionButton variant="secondary" icon={Download} disabled={attendanceRows.length === 0} onClick={exportAttendanceCsv}>Export CSV</ActionButton></div></div><div className="table-scroll"><table className="data-table"><thead><tr>{!student && <th>Student</th>}<th>Date</th><th>Day</th><th>Time In</th><th>Time Out</th><th>Rendered hours</th><th>Status</th><th>Verified by</th><th>Remarks</th>{!student && <th>Action</th>}</tr></thead><tbody>{attendanceRows.map((record) => <tr key={record.id}>{!student && <td><b>{record.studentName}</b></td>}<td><b>{record.date}</b></td><td>{record.day}</td><td>{record.timeIn}</td><td>{record.timeOut}</td><td>{record.hours}</td><td><StatusBadge status={record.status} /></td><td>{record.verifiedBy}</td><td>{record.remarks}</td>{!student && <td><button className="table-link" onClick={() => setSelectedReview(record)}>Review</button></td>}</tr>)}{!attendanceLoading && attendanceRows.length === 0 && <tr><td colSpan={student ? 8 : 10}>No attendance sessions are available yet.</td></tr>}</tbody></table></div></section>{confirmTimeOut && <ConfirmDialog title="End attendance session?" message="Time Out will be recorded using the Supabase server timestamp. The resulting event cannot be edited." confirmLabel={attendanceLoading ? "Recording…" : "Record Time Out"} onCancel={() => setConfirmTimeOut(false)} onConfirm={recordTimeOut} />}{selectedReview && <AttendanceReviewDialog record={selectedReview} close={() => setSelectedReview(null)} onSaved={() => { void refreshAttendance(); }} />}</>;
}

function StudentDailyLogDialog({ log, close, onSaved }: { log: DailyLogRecord | null; close: () => void; onSaved: () => void }) {
  const [logDate, setLogDate] = useState(log?.logDate ?? new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState(String(log?.hours ?? 8));
  const [activities, setActivities] = useState(log?.summary ?? "");
  const [learnings, setLearnings] = useState(log?.learnings ?? "");
  const [challenges, setChallenges] = useState(log?.challenges ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function save(status: "draft" | "submitted") {
    setLoading(true);
    setError("");
    try {
      await dailyLogService.save({ id: log?.id, logDate, hours: Number(hours), activities, learnings, challenges }, status);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The daily log could not be saved.");
      setLoading(false);
    }
  }
  if (log && !["Draft", "Needs Revision"].includes(log.status)) return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label="View daily log"><button className="modal-close" onClick={close} aria-label="Close daily log"><X size={20} /></button><span className="modal-icon"><FileText /></span><h2>Daily log</h2><p><strong>{log.date}</strong> · {log.hours} hours · <StatusBadge status={log.status} /></p><div className="readonly-summary"><strong>Activities performed</strong><p>{log.summary}</p>{log.learnings && <><strong>Key learnings</strong><p>{log.learnings}</p></>}{log.challenges && <><strong>Challenges</strong><p>{log.challenges}</p></>}{log.latestFeedback && <><strong>Latest reviewer feedback</strong><p>{log.latestFeedback}</p></>}</div><div className="modal-actions"><ActionButton onClick={close}>Done</ActionButton></div></section></div>;
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label={log ? "Edit daily log" : "Add daily log"}><button className="modal-close" onClick={close} aria-label="Close daily log form"><X size={20} /></button><span className="modal-icon"><FileText /></span><h2>{log ? "Edit daily log" : "Add daily log"}</h2><p>The entry will be stored in Supabase and routed to your assigned reviewers.</p><form onSubmit={(event) => { event.preventDefault(); void save("submitted"); }}><div className="two-fields"><label className="field"><span>Work date</span><input required type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} /></label><label className="field"><span>Rendered hours</span><input required type="number" min="0.25" max="24" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} /></label></div><label className="field"><span>Activities performed</span><textarea required value={activities} onChange={(event) => setActivities(event.target.value)} placeholder="Describe the work completed during this internship day…" /></label><label className="field"><span>Key learnings</span><textarea value={learnings} onChange={(event) => setLearnings(event.target.value)} placeholder="What did you learn?" /></label><label className="field"><span>Challenges encountered</span><textarea value={challenges} onChange={(event) => setChallenges(event.target.value)} placeholder="Optional challenges or blockers" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton type="button" variant="secondary" onClick={close}>Cancel</ActionButton><ActionButton type="button" variant="secondary" disabled={loading} onClick={() => void save("draft")}>Save Draft</ActionButton><ActionButton type="submit" disabled={loading}>{loading ? "Submitting…" : "Submit daily log"}</ActionButton></div></form></section></div>;
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
      setError(reason instanceof Error ? reason.message : "The review decision could not be recorded.");
      setLoading(false);
    }
  }

  if (student) return <StudentDailyLogDialog log={log} close={close} onSaved={onSaved} />;

  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label="Review daily log"><button className="modal-close" onClick={close} aria-label="Close daily log review"><X size={20} /></button><span className="modal-icon"><ShieldCheck /></span><h2>Review daily log</h2>{log && <><p><strong>{log.studentName}</strong> · {log.date} · {log.hours} hours</p><div className="readonly-summary"><strong>Activities performed</strong><p>{log.summary}</p>{log.learnings && <><strong>Key learnings</strong><p>{log.learnings}</p></>}{log.challenges && <><strong>Challenges</strong><p>{log.challenges}</p></>}</div><label className="field"><span>Review feedback</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Enter clear, traceable feedback…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions review-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => void review("approved")}>Approve</ActionButton><ActionButton variant="secondary" disabled={loading || !feedback.trim()} onClick={() => void review("needs_revision")}>Request revision</ActionButton><ActionButton variant="danger" disabled={loading || !feedback.trim()} onClick={() => void review("rejected")}>Reject</ActionButton></div></>}</section></div>;
}

function DailyLogsPage({ role }: { role: RoleId }) {
  const student = role === "student";
  const [records, setRecords] = useState<DailyLogRecord[]>([]);
  const [selected, setSelected] = useState<DailyLogRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    try { setRecords(await dailyLogService.listLive()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Daily logs could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void dailyLogService.listLive().then((result) => {
      if (active) setRecords(result);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Daily logs could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const approved = records.filter((log) => log.status === "Approved").length;
  const pending = records.filter((log) => log.status === "Submitted").length;
  return <><PageHeader title="Daily logs" subtitle={student ? "Record and track your daily internship activities." : "Review internship activities submitted by your assigned interns."} action={student ? <ActionButton icon={Plus} onClick={() => setSelected(null)}>Add daily log</ActionButton> : undefined} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="stats-grid three"><StatCard label="Total records" value={String(records.length)} detail="loaded from Supabase" icon={FileText} /><StatCard label="Approved" value={String(approved)} detail="by an authorized reviewer" icon={CheckCircle2} tone="green" /><StatCard label="Pending review" value={String(pending)} detail="awaiting feedback" icon={Clock3} tone="orange" /></div><section className="card table-card"><h2>Log history</h2><div className="table-scroll"><table className="data-table"><thead><tr>{!student && <th>Student</th>}<th>Date</th><th>Hours</th><th>Activities summary</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>{records.map((log) => <tr key={log.id}>{!student && <td><b>{log.studentName}</b></td>}<td><b>{log.date}</b></td><td>{log.hours}</td><td className="summary-cell">{log.summary}</td><td>{log.submitted}</td><td><StatusBadge status={log.status} /></td><td>{student && ["Draft", "Needs Revision"].includes(log.status) ? <button className="table-link" onClick={() => setSelected(log)}>Edit</button> : <button className="table-link" onClick={() => setSelected(log)}>{student ? "View" : "Review"}</button>}</td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={student ? 6 : 7}>No daily logs are available yet.</td></tr>}</tbody></table></div></section>{selected !== undefined && <DailyLogDialog log={selected} student={student} close={() => setSelected(undefined)} onSaved={() => { setSelected(undefined); setLoading(true); setError(""); void load(); }} />}</>;
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
      setError(reason instanceof Error ? reason.message : "The document could not be uploaded.");
      setLoading(false);
    }
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label={`Upload ${record.templateName}`}><button className="modal-close" onClick={close} aria-label="Close document upload"><X size={20} /></button><span className="modal-icon"><Upload /></span><h2>{record.status === "Needs Revision" ? "Replace" : "Upload"} {record.templateName}</h2><p>The file will be stored in the private PRAXIZ document bucket and submitted as a new immutable version.</p><form onSubmit={submit}><label className="field"><span>Document file</span><input type="file" required accept={record.allowedMimeTypes.join(",")} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /><small>Maximum {Math.round(record.maxFileSizeBytes / 1024 / 1024)} MB · {record.allowedMimeTypes.join(", ")}</small></label><label className="field"><span>Submission notes (optional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for the reviewer…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton variant="secondary" onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading || !selectedFile}>{loading ? "Uploading…" : "Upload and submit"}</ActionButton></div></form></section></div>;
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
      setError(reason instanceof Error ? reason.message : "The document decision could not be saved.");
      setLoading(false);
    }
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label={`Review ${record.templateName}`}><button className="modal-close" onClick={close} aria-label="Close document review"><X size={20} /></button><span className="modal-icon"><FileCheck2 /></span><h2>Review document</h2><p><strong>{record.studentName}</strong><br />{record.templateName} · {record.fileName}</p><div className="inline-actions"><ActionButton variant="secondary" icon={Eye} onClick={() => { void documentService.open(record); }}>Open submitted file</ActionButton></div><label className="field"><span>Review feedback</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Enter clear, traceable feedback…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions review-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => void decide("approved")}>Approve</ActionButton><ActionButton variant="secondary" disabled={loading || !feedback.trim()} onClick={() => void decide("needs_revision")}>Request revision</ActionButton><ActionButton variant="danger" disabled={loading || !feedback.trim()} onClick={() => void decide("rejected")}>Reject</ActionButton></div></section></div>;
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
    catch (reason) { setError(reason instanceof Error ? reason.message : "Documents could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void documentService.listLive().then((result) => {
      if (active) setRecords(result);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Documents could not be loaded.");
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
    catch (reason) { setError(reason instanceof Error ? reason.message : "The secure document link could not be opened."); }
  }
  return <><PageHeader title={role === "coordinator" ? "Document compliance" : "Documents"} subtitle={canUpload ? "Manage your internship requirements and secure document submissions." : "Review live requirement status and follow up on incomplete records."} action={canUpload && nextUpload ? <ActionButton icon={Upload} onClick={() => setUploadRecord(nextUpload)}>Upload next requirement</ActionButton> : undefined} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="card compliance-card"><div className="metric-row"><span>Approved document requirements</span><strong>{completed} of {records.length} ({percent}%)</strong></div><ProgressBar value={percent} /></section>{(["Pre-Internship", "During Internship", "Post-Internship"] as const).map((phase) => <section className="card document-group" key={phase}><h2>{phase}</h2>{records.filter((record) => record.phase === phase).map((record) => <article className="document-row" key={record.id}><span className={`document-icon document-${record.status.toLowerCase().replaceAll(" ", "-")}`}><FileText size={21} /></span><div><strong>{record.templateName}</strong><small>{!canUpload && `${record.studentName} · `}{record.fileName} · {record.dueAt}</small><p>{record.latestFeedback || (record.objectPath ? "Submitted securely to PRAXIZ." : "A file has not been submitted yet.")}</p></div><StatusBadge status={record.status} /><div className="document-actions">{record.objectPath && <ActionButton variant="secondary" onClick={() => { void openDocument(record); }}>Preview</ActionButton>}{record.objectPath && <ActionButton variant="secondary" icon={Download} onClick={() => { void openDocument(record, true); }}>Download</ActionButton>}{canUpload && (record.status === "Missing" || record.status === "Needs Revision" || record.status === "Rejected") && <ActionButton onClick={() => setUploadRecord(record)}>{record.status === "Missing" ? "Upload" : "Replace"}</ActionButton>}{!canUpload && record.submissionId && (record.status === "Under Review" || record.status === "Submitted") && <ActionButton onClick={() => setReviewRecord(record)}>Review</ActionButton>}</div></article>)}{!loading && records.filter((record) => record.phase === phase).length === 0 && <p className="muted-note">No visible requirements in this phase.</p>}</section>)}{uploadRecord && <DocumentUploadDialog record={uploadRecord} close={() => setUploadRecord(null)} onSaved={() => { setUploadRecord(null); void load(); }} />}{reviewRecord && <DocumentReviewDialog record={reviewRecord} close={() => setReviewRecord(null)} onSaved={() => { setReviewRecord(null); void load(); }} />}</>;
}

function EvaluationEditorDialog({ record, assignments, template, close, onSaved }: { record: EvaluationRecord | null; assignments: EvaluationAssignment[]; template: { id: string; name: string; criteria: EvaluationCriterionRecord[] }; close: () => void; onSaved: () => void }) {
  const startingCriteria = record?.criteria.length ? record.criteria : template.criteria;
  const [assignmentId, setAssignmentId] = useState(record?.assignmentId ?? assignments[0]?.id ?? "");
  const [criteria, setCriteria] = useState(startingCriteria);
  const [strengths, setStrengths] = useState(record?.strengths ?? "");
  const [areas, setAreas] = useState(record?.areasForImprovement ?? "");
  const [remarks, setRemarks] = useState(record?.overallRemarks ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const complete = Boolean(assignmentId) && criteria.length > 0 && criteria.every((criterion) => criterion.score >= criterion.minimumScore && criterion.score <= criterion.maximumScore);
  async function save(submit: boolean) {
    if (!assignmentId || (submit && !complete)) return;
    setLoading(true);
    setError("");
    try {
      await evaluationService.save({ id: record?.id, assignmentId, templateId: record?.templateId ?? template.id, strengths, areasForImprovement: areas, overallRemarks: remarks, criteria: criteria.map((criterion) => ({ id: criterion.id, score: criterion.score })), submit });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The evaluation could not be saved.");
      setLoading(false);
    }
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal evaluation-editor-modal" role="dialog" aria-modal="true" aria-label="Evaluate intern"><button className="modal-close" onClick={close} aria-label="Close evaluation editor"><X size={20} /></button><span className="modal-icon"><Star /></span><h2>{record ? "Edit evaluation" : template.name}</h2><label className="field"><span>Intern</span><select value={assignmentId} disabled={Boolean(record)} onChange={(event) => setAssignmentId(event.target.value)}><option value="" disabled>Select an assigned intern</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.studentName}</option>)}</select></label><div className="criteria-list">{criteria.map((criterion, index) => <div className="criterion" key={criterion.id}><div><strong>{criterion.label}</strong><small>{criterion.description}</small></div><div className="score-selector" aria-label={`${criterion.label} score`}>{Array.from({ length: criterion.maximumScore - criterion.minimumScore + 1 }, (_, offset) => criterion.minimumScore + offset).map((score) => <button type="button" className={score <= criterion.score ? "filled" : ""} key={score} onClick={() => setCriteria(criteria.map((item, itemIndex) => itemIndex === index ? { ...item, score } : item))}>{score}</button>)}</div><span className="score-text">{criterion.score || "—"} / {criterion.maximumScore}</span></div>)}</div><div className="evaluation-notes"><label className="field"><span>Strengths</span><textarea value={strengths} onChange={(event) => setStrengths(event.target.value)} /></label><label className="field"><span>Areas for improvement</span><textarea value={areas} onChange={(event) => setAreas(event.target.value)} /></label><label className="field full"><span>Overall remarks</span><textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label></div>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton variant="secondary" disabled={loading || !assignmentId} onClick={() => void save(false)}>Save draft</ActionButton><ActionButton icon={Send} disabled={loading || !complete} onClick={() => void save(true)}>{loading ? "Saving…" : "Submit evaluation"}</ActionButton></div></section></div>;
}

function EvaluationDetail({ record, canFinalize, onFinalized }: { record: EvaluationRecord; canFinalize: boolean; onFinalized: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const calculated = record.criteria.length ? record.criteria.reduce((sum, criterion) => sum + criterion.score * criterion.weight, 0) / record.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) : 0;
  const average = (record.weightedScore ?? calculated).toFixed(1);
  async function finalize() {
    setLoading(true);
    setError("");
    try { await evaluationService.finalize(record.id); onFinalized(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The evaluation could not be finalized."); setLoading(false); }
  }
  return <><section className="card evaluation-card"><div className="evaluation-heading"><div><h2>{record.templateName} — {record.studentName}</h2><p>{record.status} · {record.evaluatorName} · {record.submittedAt}</p></div><div><strong>{average}</strong><span>out of 5.0</span></div></div><div className="criteria-list">{record.criteria.map((criterion) => <div className="criterion" key={criterion.id}><div><strong>{criterion.label}</strong><small>{criterion.description}</small></div><div className="score-selector" aria-label={`${criterion.label} score`}>{Array.from({ length: criterion.maximumScore - criterion.minimumScore + 1 }, (_, offset) => criterion.minimumScore + offset).map((score) => <button disabled className={score <= criterion.score ? "filled" : ""} key={score}>{score}</button>)}</div><span className="score-text">{criterion.score}.0 / {criterion.maximumScore}</span></div>)}</div>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}{canFinalize && record.status === "Submitted" && <div className="evaluation-submit"><ActionButton icon={ShieldCheck} disabled={loading} onClick={() => void finalize()}>{loading ? "Finalizing…" : "Finalize evaluation"}</ActionButton></div>}</section><div className="evaluation-notes"><section className="card"><h3>Strengths</h3><p>{record.strengths || "No strengths were entered."}</p></section><section className="card"><h3>Areas for improvement</h3><p>{record.areasForImprovement || "No areas for improvement were entered."}</p></section><section className="card full"><h3>Overall remarks</h3><p>{record.overallRemarks || "No overall remarks were entered."}</p></section></div></>;
}

function EvaluationsPage({ role }: { role: RoleId }) {
  const student = role === "student";
  const canEvaluate = hasPermission(role, "evaluations:score");
  const canFinalize = role === "coordinator" || role === "admin";
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [template, setTemplate] = useState<{ id: string; name: string; criteria: EvaluationCriterionRecord[] } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [editorRecord, setEditorRecord] = useState<EvaluationRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [liveRecords, liveAssignments, liveTemplate] = await Promise.all([evaluationService.listLive(), student ? Promise.resolve([]) : evaluationService.listAssignments(), student ? Promise.resolve(null) : evaluationService.getActiveTemplate()]);
      setRecords(liveRecords);
      setAssignments(liveAssignments);
      setTemplate(liveTemplate);
      setSelectedId((current) => liveRecords.some((record) => record.id === current) ? current : liveRecords[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evaluations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const request = Promise.all([evaluationService.listLive(), student ? Promise.resolve([]) : evaluationService.listAssignments(), student ? Promise.resolve(null) : evaluationService.getActiveTemplate()]);
    void request.then(([liveRecords, liveAssignments, liveTemplate]) => {
      if (!active) return;
      setRecords(liveRecords);
      setAssignments(liveAssignments);
      setTemplate(liveTemplate);
      setSelectedId(liveRecords[0]?.id ?? "");
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Evaluations could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [student]);
  const selected = records.find((record) => record.id === selectedId) ?? null;
  if (!student && !canEvaluate) return <EmptyAction icon={ShieldCheck} title="Evaluation access is restricted" copy="Your current permissions do not allow scoring or viewing evaluator workspaces." />;
  return <><PageHeader title="Evaluations" subtitle={student ? "Access finalized internship evaluations and verified scores." : "Create, submit, and finalize traceable internship evaluations."} action={!student && template && assignments.length ? <ActionButton icon={Star} onClick={() => setEditorRecord(null)}>Evaluate intern</ActionButton> : undefined} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}{student && <div className="verification-principle"><ShieldCheck size={20} /><p>Your evaluation scores are read-only. Draft evaluator responses are never shown; only coordinator-finalized evaluations appear here.</p></div>}{records.length > 0 && <section className="card table-card"><div className="card-title"><h2>{student ? "Finalized evaluations" : "Evaluation records"}</h2><StatusBadge status={`${records.length} record${records.length === 1 ? "" : "s"}`} /></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Intern</th><th>Template</th><th>Evaluator</th><th>Status</th><th>Score</th><th>Action</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><b>{record.studentName}</b></td><td>{record.templateName}</td><td>{record.evaluatorName}</td><td><StatusBadge status={record.status} /></td><td>{record.weightedScore == null ? "Pending finalization" : `${record.weightedScore.toFixed(1)} / 5.0`}</td><td><button className="table-link" onClick={() => setSelectedId(record.id)}>View</button>{!student && (record.status === "Draft" || record.status === "Returned") && <button className="table-link" onClick={() => setEditorRecord(record)}>Edit</button>}</td></tr>)}</tbody></table></div></section>}{selected && <EvaluationDetail record={selected} canFinalize={canFinalize} onFinalized={() => { void load(); }} />}{!loading && records.length === 0 && <EmptyAction icon={Star} title={student ? "No finalized evaluations yet" : "No evaluations yet"} copy={student ? "Finalized results will appear here after coordinator review." : "Choose Evaluate intern to create the first evaluation for an assigned intern."} />}{editorRecord !== undefined && template && <EvaluationEditorDialog record={editorRecord} assignments={assignments} template={template} close={() => setEditorRecord(undefined)} onSaved={() => { setEditorRecord(undefined); void load(); }} />}</>;
}

function ProgressPage() {
  const [data, setData] = useState<StudentProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void internshipService.getStudentProgress().then((summary) => {
      if (active) setData(summary);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Internship progress could not be loaded.");
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
    { title: "Performance evaluation recorded", date: data.evaluationAverage == null ? "Awaiting finalized evaluation" : `${data.evaluationAverage.toFixed(2)} average score`, done: data.evaluationAverage != null },
    { title: `Complete ${data.requiredHours} required hours`, date: `${data.renderedHours} of ${data.requiredHours} verified hours`, done: hoursPercent >= 100 },
    { title: "Final evaluation and clearance", date: `Expected completion ${data.endDate}`, done: data.status === "Completed" },
  ];
  return <><PageHeader title="Internship progress" subtitle="Follow your verified hours, requirements, and internship milestones." />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="progress-hero card"><div><span className="eyebrow dark">Verified-hour completion</span><strong>{hoursPercent}%</strong><p>{data.renderedHours} verified hours · {remainingHours} hours remaining</p></div><div className="progress-ring" style={hoursPercent > 0 ? { background: `conic-gradient(#1768d5 0 ${hoursPercent}%, #dbe6f4 ${hoursPercent}% 100%)` } : undefined} role="img" aria-label={`${hoursPercent}% verified-hour completion`}><span>{hoursPercent}<small>%</small></span></div></section><div className="dashboard-grid"><section className="card"><h2>Milestone timeline</h2><div className="timeline">{milestones.map((item) => <div className={item.done ? "done" : ""} key={item.title}><span>{item.done ? <Check size={16} /> : <Clock3 size={16} />}</span><div><strong>{item.title}</strong><small>{item.date}</small></div></div>)}</div></section><aside className="card"><h2>Completion details</h2><div className="indicator-list"><div><span>Rendered hours</span><b>{hoursPercent}%</b><ProgressBar value={hoursPercent} /></div><div><span>Attendance verification</span><b>{attendancePercent}%</b><ProgressBar value={attendancePercent} tone="green" /></div><div><span>Daily logs</span><b>{logPercent}%</b><ProgressBar value={logPercent} /></div><div><span>Requirements</span><b>{hasDocumentRequirements ? `${documentPercent}%` : "Not configured"}</b><ProgressBar value={documentPercent} tone="orange" /></div></div></aside></div></>;
}

function NotificationsPage() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void notificationService.listLive().then((records) => {
      if (active) setItems(records);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Notifications could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const shown = filter === "unread" ? items.filter((item) => item.unread) : items;
  async function markOne(item: NotificationRecord) {
    if (!item.unread) return;
    setError("");
    try {
      await notificationService.markRead(item.id);
      setItems(items.map((old) => old.id === item.id ? { ...old, unread: false } : old));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The notification could not be marked as read."); }
  }
  async function markAll() {
    setError("");
    try {
      await notificationService.markAllRead();
      setItems(items.map((item) => ({ ...item, unread: false })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Notifications could not be updated."); }
  }
  return <><PageHeader title="Notifications" subtitle={`${items.filter((item) => item.unread).length} unread notifications`} action={<div className="notification-controls"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>Unread</button><button disabled={!items.some((item) => item.unread)} onClick={() => { void markAll(); }}>Mark all read</button></div>} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="notification-list">{shown.map((item) => <button key={item.id} className={`notification-item notification-${item.tone} ${item.unread ? "unread" : ""}`} onClick={() => { void markOne(item); }}><span className="notification-symbol">{item.tone === "success" ? <CheckCircle2 /> : item.tone === "warning" || item.tone === "error" ? <AlertTriangle /> : <MessageSquareText />}</span><span><strong>{item.title}</strong><p>{item.message}</p></span><small>{item.time}</small></button>)}{!loading && shown.length === 0 && <EmptyAction icon={Bell} title="You’re all caught up" copy={filter === "unread" ? "There are no unread notifications." : "No notifications have been sent to this account yet."} />}</div></>;
}

function ProfilePage({ role, settings = false, openModal }: { role: RoleId; settings?: boolean; openModal: (title: string) => void }) {
  const { user } = useAuth();
  const current = roles[role];
  const student = role === "student";
  const displayName = user?.fullName ?? current.user;
  const displayInitials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || current.initials;
  return <><PageHeader title={settings ? "Settings" : "Profile"} subtitle={settings ? "Manage your account preferences and notification choices." : "Review the official details linked to your PRAXIZ account."} /><div className="profile-grid"><section className="card profile-summary"><span className={`avatar avatar-${current.accent}`}>{displayInitials}</span><h2>{displayName}</h2><p>{current.label}</p><StatusBadge status="Verified account" /></section><section className="card profile-form"><h2>{settings ? "Account preferences" : "Official account information"}</h2>{settings ? <><label aria-label="Email notifications" className="toggle-row"><span><strong>Email notifications</strong><small>Receive important submission and verification updates</small></span><input type="checkbox" defaultChecked /></label><label aria-label="Weekly progress summary" className="toggle-row"><span><strong>Weekly progress summary</strong><small>Receive a concise Friday digest</small></span><input type="checkbox" defaultChecked /></label><label aria-label="Monitoring notices" className="toggle-row"><span><strong>Monitoring notices</strong><small>Receive rules-based attendance and compliance reminders</small></span><input type="checkbox" /></label><ActionButton onClick={() => openModal("Preferences saved")}>Save preferences</ActionButton></> : <><div className="two-fields"><label className="field"><span>Full name</span><input value={displayName} readOnly /></label><label className="field"><span>Role</span><input value={current.label} readOnly /></label></div><div className="two-fields"><label className="field"><span>Official email</span><input value={user?.email ?? ""} readOnly /></label><label className="field"><span>Account status</span><input value="Active and verified" readOnly /></label></div>{student && <><div className="two-fields"><label className="field"><span>Student number</span><input value={user?.studentNumber ?? "Not available"} readOnly /></label><label className="field"><span>Year level</span><input value={user?.yearLevel ? String(user.yearLevel) : "Not available"} readOnly /></label></div><div className="two-fields"><label className="field"><span>Section</span><input value={user?.section ?? "Not available"} readOnly /></label><label className="field"><span>Expected graduation</span><input value={user?.expectedGraduationYear ? String(user.expectedGraduationYear) : "Not available"} readOnly /></label></div><div className="two-fields"><label className="field"><span>Academic program</span><input value={user?.academicProgram ?? "Not available"} readOnly /></label><label className="field"><span>College</span><input value={user?.college ?? "Not available"} readOnly /></label></div><div className="two-fields"><label className="field"><span>Campus</span><input value={user?.campus ?? "Not available"} readOnly /></label></div></>}{role === "coordinator" && <><div className="two-fields"><label className="field"><span>Coordinated program</span><input value={user?.scopeProgramCode && user?.scopeProgramName ? `${user.scopeProgramCode} — ${user.scopeProgramName}` : "Not available"} readOnly /></label><label className="field"><span>College</span><input value={user?.college ?? "Not available"} readOnly /></label></div><div className="two-fields"><label className="field"><span>Campus</span><input value={user?.campus ?? "Not available"} readOnly /></label></div></>}<div className="verification-principle"><ShieldCheck size={20} /><p>Institutional identity fields are read-only. Request corrections through your coordinator or system administrator so changes remain traceable.</p></div></>}</section></div></>;
}

function FilterBar({ search, setSearch, campus, setCampus, campusOptions, program, setProgram, programOptions, status, setStatus }: { search: string; setSearch: (value: string) => void; campus: string; setCampus: (value: string) => void; campusOptions: string[]; program: string; setProgram: (value: string) => void; programOptions: string[]; status: string; setStatus: (value: string) => void }) {
  return <div className="filter-bar"><label><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search intern or HTE…" /></label><select value={campus} onChange={(e) => setCampus(e.target.value)} aria-label="Filter by campus"><option>All Campuses</option>{campusOptions.map((item) => <option key={item}>{item}</option>)}</select><select value={program} onChange={(e) => setProgram(e.target.value)} aria-label="Filter by program"><option>All Programs</option>{programOptions.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option>All Statuses</option><option>Active</option><option>Completed</option><option>Needs Attention</option></select></div>;
}

function InternManagementPage({ role }: { role: RoleId }) {
  const { user } = useAuth();
  const [search, setSearch] = useState(""); const [campus, setCampus] = useState("All Campuses"); const [program, setProgram] = useState("All Programs"); const [status, setStatus] = useState("All Statuses");
  const [rows, setRows] = useState<Intern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void internshipService.listLiveInterns().then((records) => {
      if (active) setRows(records);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Intern assignments could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const campusOptions = useMemo(() => [...new Set([user?.campus, ...rows.map((intern) => intern.campus)].filter((value): value is string => Boolean(value)))], [rows, user?.campus]);
  const programOptions = useMemo(() => [...new Set([user?.scopeProgramCode, ...rows.map((intern) => intern.program)].filter((value): value is string => Boolean(value)))], [rows, user?.scopeProgramCode]);
  const visible = useMemo(() => rows.filter((intern) => (!search || `${intern.name} ${intern.hte}`.toLowerCase().includes(search.toLowerCase())) && (campus === "All Campuses" || intern.campus === campus) && (program === "All Programs" || intern.program === program) && (status === "All Statuses" || intern.status === status)), [rows, search, campus, program, status]);
  return <><PageHeader title={role === "coordinator" ? "Intern management" : "Assigned interns"} subtitle={role === "coordinator" ? "Monitor interns by campus, assignment, progress, and requirement status." : "View interns assigned to your authorized supervision scope."} />{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<section className="card table-card"><div className="card-title"><h2>{loading ? "Loading interns…" : `${visible.length} intern${visible.length === 1 ? "" : "s"}`}</h2><FilterBar search={search} setSearch={setSearch} campus={campus} setCampus={setCampus} campusOptions={campusOptions} program={program} setProgram={setProgram} programOptions={programOptions} status={status} setStatus={setStatus} /></div><InternTable rows={visible} />{!loading && visible.length === 0 && <p className="muted-note">No internship assignments match the selected filters.</p>}</section></>;
}

function AnalyticsPage() {
  const metrics = [["Attendance",92,"Good"],["Log submission",72,"Needs Attention"],["Evaluation",88,"Very Good"],["Document compliance",80,"Nearly Complete"],["Work quality",85,"Very Good"],["Punctuality",95,"Excellent"]] as const;
  return <><PageHeader title="Performance analytics preview" subtitle="Frontend visualization of verified PRAXIZ indicators." action={<span className="ai-label"><Clock3 size={16} /> AI not connected</span>} /><div className="ai-disclaimer"><ShieldCheck size={20} /><p><strong>Prototype data only.</strong> This page currently renders deterministic mock indicators; no AI model is connected and no content is AI-generated. A governed decision-support service will be integrated only after the database and verified-data pipeline are approved.</p></div><div className="analytics-grid"><div><section className="card insight-summary"><h2>Rules-based summary preview</h2><p>The current mock record shows <strong>consistent attendance</strong> and <strong>satisfactory to very good evaluation scores</strong>. Three delayed daily log submissions meet the prototype follow-up rule. Document compliance is near complete, with one requirement pending.</p><div className="standing">Prototype standing <StatusBadge status="Good Standing" /></div></section><section className="card"><h2>Key indicators</h2><div className="indicator-cards">{metrics.slice(0,4).map(([label,value,status]) => <article key={label}><span>{label === "Attendance" ? <CheckCircle2 /> : label === "Log submission" ? <AlertTriangle /> : label === "Evaluation" ? <Star /> : <FileText />}</span><div><strong>{label}</strong><p>{value}% · Mock verified record</p><StatusBadge status={status} /></div></article>)}</div></section><section className="card concerns"><h2>Rules-based monitoring prompts</h2><p>Static frontend examples for supervisor awareness—not findings or AI output.</p><div><AlertTriangle /> 3 delayed daily log submissions identified (Weeks 5, 6, and 7)</div><div><AlertTriangle /> Attendance decreased from 95% to 88% this week</div><div><Bell /> Final Evaluation Form is still missing</div></section></div><aside className="card radar-card"><h2>Indicator radar preview</h2><div className="radar"><div className="radar-grid r1"/><div className="radar-grid r2"/><div className="radar-shape"/><span className="radar-top">Attendance</span><span className="radar-r">Log submission</span><span className="radar-br">Evaluation</span><span className="radar-bottom">Documents</span><span className="radar-bl">Work quality</span><span className="radar-l">Punctuality</span></div><div className="indicator-list compact">{metrics.map(([label,value]) => <div key={label}><span>{label}</span><b>{value}%</b><ProgressBar value={value} /></div>)}</div></aside></div></>;
}

function ReportsPage({ openModal }: { openModal: (title: string) => void }) {
  const [selected, setSelected] = useState("Attendance Report");
  const reports = [{ title: "Attendance Report", copy: "Daily time records, rates, and hour summaries", icon: CalendarCheck2 },{ title: "Internship Progress Report", copy: "Rendered hours, completion, and timeline", icon: LineChart },{ title: "Document Compliance Report", copy: "Submission status and missing requirements", icon: FileCheck2 },{ title: "Evaluation Report", copy: "Scores, criteria breakdown, and remarks", icon: Star },{ title: "Intern Performance Summary", copy: "Comprehensive individual performance overview", icon: UserRound },{ title: "Internship Completion Report", copy: "End-of-internship summary and readiness", icon: GraduationCap }];
  return <><PageHeader title="Reports" subtitle="Configure, preview, and export internship monitoring reports." /><section className="card report-filters"><h2>Report filters</h2><div className="report-filter-grid"><label className="field"><span>Academic term</span><select>{academicTerms.map((term) => <option key={term.id}>{term.academicYear} · {term.term}</option>)}</select></label><label className="field"><span>Campus</span><select><option>All Campuses</option>{campuses.map((campus) => <option key={campus.id}>{campus.shortName}</option>)}</select></label><label className="field"><span>College</span><select><option>All Colleges</option>{colleges.map((college) => <option key={college.id}>{college.name}</option>)}</select></label><label className="field"><span>Date from</span><input type="date" defaultValue="2026-06-02" /></label><label className="field"><span>Date to</span><input type="date" defaultValue="2026-09-05" /></label><label className="field"><span>Program</span><select><option>All Programs</option>{programs.map((program) => <option key={program.id}>{program.code}</option>)}</select></label><label className="field"><span>Host training establishment</span><select><option>All HTEs</option><option>TechSouth PH</option><option>Albay ICT</option></select></label></div></section><h2 className="section-label">Select report type</h2><div className="report-grid">{reports.map((report) => { const Icon = report.icon; return <button className={selected === report.title ? "selected" : ""} onClick={() => setSelected(report.title)} key={report.title}><Icon /><strong>{report.title}</strong><span>{report.copy}</span>{selected === report.title && <CheckCircle2 className="report-check" />}</button>; })}</div><section className="report-generate"><div><span>Selected report</span><strong>{selected}</strong></div><ActionButton variant="secondary" icon={Eye} onClick={() => openModal(`Preview ${selected}`)}>Preview</ActionButton><ActionButton icon={Download} onClick={() => openModal(`Generate ${selected}`)}>Generate report</ActionButton></section></>;
}

function FeedbackPage({ openModal }: { openModal: (title: string) => void }) {
  return <><PageHeader title="Feedback & follow-up" subtitle="Keep concerns, guidance, and intervention history traceable." action={<ActionButton icon={Plus} onClick={() => openModal("Create feedback")}>New feedback</ActionButton>} /><div className="stats-grid three"><StatCard label="Open" value="1" icon={MessageSquareText} tone="orange" /><StatCard label="In progress" value="1" icon={Clock3} tone="violet" /><StatCard label="Resolved" value="1" icon={CheckCircle2} tone="green" /></div><section className="card table-card"><h2>Feedback records</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Related issue</th><th>Created by</th><th>Date</th><th>Follow-up</th><th>Action</th></tr></thead><tbody>{feedbackThreads.map((item) => <tr key={item.subject}><td><b>{item.student}</b></td><td>{item.subject}</td><td>{item.from}</td><td>{item.date}</td><td><StatusBadge status={item.status} /></td><td><button className="table-link" onClick={() => openModal("Open feedback thread")}>View</button></td></tr>)}</tbody></table></div></section></>;
}

function DirectoryPage({ kind, openModal }: { kind: "htes" | "assignments" | "users" | "roles" | "audit"; openModal: (title: string) => void }) {
  const [userRows, setUserRows] = useState<string[][]>([]);
  const [usersLoading, setUsersLoading] = useState(kind === "users");
  const [usersError, setUsersError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (kind !== "users") return;
    let active = true;
    void adminService.listUserAccounts().then((records) => {
      if (active) setUserRows(records.map((record) => [record.name, record.role, record.reference, record.status]));
    }).catch((reason) => {
      if (active) setUsersError(reason instanceof Error ? reason.message : "User accounts could not be loaded.");
    }).finally(() => {
      if (active) setUsersLoading(false);
    });
    return () => { active = false; };
  }, [kind]);
  const configs = {
    htes: { title: "Partner HTEs", subtitle: "View partner organizations and authorized representative records.", action: "Add partner HTE", headers: ["Organization", "Representative", "Assigned interns", "Status"], rows: [["TechSouth Philippines","Allan Maraña","8","Active"],["Albay ICT Solutions","Carla Mendoza","6","Active"],["Bigasburo Digital","Paolo Reyes","7","Active"]] },
    assignments: { title: "Internship assignments", subtitle: "Coordinate student and host training establishment assignments.", action: "Create assignment", headers: ["Student", "HTE", "HTE representative", "Status"], rows: interns.slice(0,5).map((i) => [i.name,i.hte,i.hteRepresentative,i.status]) },
    users: { title: "User accounts", subtitle: "View live profiles, active roles, references, and account status.", action: "Review registrations", headers: ["User", "Role", "Reference", "Status"], rows: [] },
    roles: { title: "Roles & access", subtitle: "Review the role boundaries applied across PRAXIZ.", action: "Review policy", headers: ["Role", "Scope", "Accounts", "Status"], rows: [["Student Intern","Own internship record only","47","Configured"],["HTE Representative","Own HTE and assigned interns","14","Configured"],["Internship Coordinator","Program-wide monitoring","2","Configured"],["System Administrator","Accounts and configuration","2","Configured"]] },
    audit: { title: "Audit logs", subtitle: "Trace important account and frontend workflow events.", action: "Export audit", headers: ["Event", "Actor", "Timestamp", "Result"], rows: [["Registration reviewed","Alex Rivera","Aug 12 · 10:42 AM","Recorded"],["Role access updated","Alex Rivera","Aug 12 · 9:18 AM","Recorded"],["Account activated","Alex Rivera","Aug 11 · 4:05 PM","Recorded"],["Security settings viewed","System","Aug 11 · 3:10 PM","Recorded"]] },
  } as const;
  const config = configs[kind];
  const rows: ReadonlyArray<ReadonlyArray<string>> = kind === "users" ? userRows : config.rows;
  const visibleRows = rows.filter((row) => !search || row.join(" ").toLowerCase().includes(search.toLowerCase()));
  const action = kind === "users" ? <Link className="button button-primary" href="/admin/registrations"><UserCheck size={18} /> Review registrations</Link> : <ActionButton icon={Plus} onClick={() => openModal(config.action)}>{config.action}</ActionButton>;
  return <><PageHeader title={config.title} subtitle={config.subtitle} action={action} />{usersError && <p className="form-error"><AlertTriangle size={16} /> {usersError}</p>}<section className="card table-card"><div className="card-title"><h2>{usersLoading ? "Loading accounts…" : `${visibleRows.length} record${visibleRows.length === 1 ? "" : "s"}`}</h2><label className="table-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" /></label></div><div className="table-scroll"><table className="data-table"><thead><tr>{config.headers.map((header) => <th key={header}>{header}</th>)}<th>Action</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${index}-${String(cell)}`}>{index === 0 ? <b>{cell}</b> : index === row.length - 1 ? <StatusBadge status={String(cell)} /> : cell}</td>)}<td><button className="table-link" onClick={() => openModal(`View ${row[0]}`)}>View</button></td></tr>)}</tbody></table></div>{!usersLoading && visibleRows.length === 0 && <p className="muted-note">No live user accounts match this view.</p>}</section></>;
}

function MasterRecordRow({ primary, secondary, onClick }: { primary: string; secondary: string; onClick?: () => void }) {
  const content = <><span className="master-record-copy"><strong>{primary}</strong><small>{secondary}</small></span>{onClick && <ChevronRight size={18} />}</>;
  return onClick ? <button className="master-record-row" onClick={onClick}>{content}</button> : <div className="master-record-row">{content}</div>;
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
      setError(reason instanceof Error ? reason.message : "The record could not be created.");
      setLoading(false);
    }
  }

  const needsCode = kind !== "term";
  const needsShortName = kind === "campus" || kind === "college";
  return <div className="modal-backdrop" role="presentation"><section className="modal master-data-modal" role="dialog" aria-modal="true" aria-label="Add institutional record"><button className="modal-close" onClick={close} aria-label="Close institutional record form"><X size={20} /></button><span className="modal-icon"><Settings /></span><h2>Add institutional record</h2><p>The record will be written to Supabase using the administrator-only Master Data policy and included in the audit trail.</p><form onSubmit={submit}>
    <label className="field"><span>Record type</span><select value={kind} onChange={(event) => setKind(event.target.value as MasterDataKind)}><option value="campus">Campus</option><option value="college">College</option><option value="program">Academic program</option><option value="term">Academic term</option></select></label>
    {needsCode && <div className="two-fields"><label className="field"><span>Code</span><input required value={code} onChange={(event) => { setCode(event.target.value); setError(""); }} placeholder={kind === "campus" ? "PARSU-CAMPUS" : kind === "college" ? "CECS" : "BSIT"} /></label>{needsShortName && <label className="field"><span>Short name</span><input required value={shortName} onChange={(event) => setShortName(event.target.value)} placeholder={kind === "campus" ? "Campus name" : "College acronym"} /></label>}</div>}
    {kind !== "term" && <label className="field"><span>Official name</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "program" ? "Bachelor of Science in…" : "Enter the official name"} /></label>}
    {kind === "campus" && <label className="field"><span>Municipality</span><input required value={municipality} onChange={(event) => setMunicipality(event.target.value)} placeholder="Municipality" /></label>}
    {(kind === "college" || kind === "program") && <label className="field"><span>Campus</span><select required value={campusId} onChange={(event) => selectCampus(event.target.value)}><option value="" disabled>Select a campus</option>{campusRows.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>}
    {kind === "program" && <><label className="field"><span>Owning college</span><select required value={collegeId} onChange={(event) => { setCollegeId(event.target.value); setError(""); }}><option value="" disabled>Select a college</option>{availableColleges.map((college) => <option key={college.id} value={college.id}>{college.shortName} · {college.name}</option>)}</select></label><p className="form-hint">Program codes must be unique within the selected college.</p></>}
    {kind === "term" && <><label className="field"><span>Academic year</span><select required value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)}><option value="" disabled>Select an academic year</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? " · Current" : ""}</option>)}</select></label><label className="field"><span>Term</span><select value={term} onChange={(event) => setTerm(event.target.value as typeof term)}><option value="first_semester">First Semester</option><option value="second_semester">Second Semester</option><option value="midyear">Midyear</option></select></label><div className="two-fields"><label className="field"><span>Starts on</span><input required type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label><label className="field"><span>Ends on</span><input required type="date" min={startsOn || undefined} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label></div><div className="master-current-option"><input aria-label="Make this the current term" type="checkbox" checked={isCurrent} onChange={(event) => setIsCurrent(event.target.checked)} /><span><strong>Make this the current term</strong><small>This switches the active term across PRAXIZ after the record is created.</small></span></div></>}
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="modal-actions"><ActionButton variant="secondary" onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading || (kind === "program" && !collegeId) || (kind === "term" && !academicYearId)}>{loading ? "Saving…" : "Create record"}</ActionButton></div>
  </form></section></div>;
}

function MasterDataPage() {
  const [campusRows, setCampusRows] = useState<Awaited<ReturnType<typeof institutionalService.listActiveCampuses>>>([]);
  const [collegeRows, setCollegeRows] = useState<Awaited<ReturnType<typeof institutionalService.listActiveColleges>>>([]);
  const [programRows, setProgramRows] = useState<Awaited<ReturnType<typeof institutionalService.listActivePrograms>>>([]);
  const [termRows, setTermRows] = useState<Awaited<ReturnType<typeof institutionalService.listAcademicTerms>>>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearRecord[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState("");
  const [selectedCollegeId, setSelectedCollegeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campusesResult, collegesResult, termsResult, yearsResult] = await Promise.all([
      institutionalService.listActiveCampuses(),
      institutionalService.listActiveColleges(),
      institutionalService.listAcademicTerms(),
      institutionalService.listAcademicYears(),
      ]);
      setCampusRows(campusesResult);
      setCollegeRows(collegesResult);
      setTermRows(termsResult);
      setAcademicYears(yearsResult);
      setSelectedCampusId((current) => current && campusesResult.some((campus) => campus.id === current) ? current : campusesResult[0]?.id ?? "");
      setSelectedCollegeId((current) => current && collegesResult.some((college) => college.id === current) ? current : collegesResult.find((college) => college.campusId === campusesResult[0]?.id)?.id ?? "");
    } catch {
      setError("Institutional data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      institutionalService.listActiveCampuses(),
      institutionalService.listActiveColleges(),
      institutionalService.listAcademicTerms(),
      institutionalService.listAcademicYears(),
    ]).then(([campusesResult, collegesResult, termsResult, yearsResult]) => {
      if (!active) return;
      setCampusRows(campusesResult);
      setCollegeRows(collegesResult);
      setTermRows(termsResult);
      setAcademicYears(yearsResult);
      const campusId = campusesResult[0]?.id ?? "";
      setSelectedCampusId(campusId);
      setSelectedCollegeId(collegesResult.find((college) => college.campusId === campusId)?.id ?? "");
    }).catch(() => {
      if (active) setError("Institutional data could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedCollegeId) return;
    let active = true;
    void institutionalService.listProgramsForUnit(selectedCollegeId).then((items) => {
      if (active) setProgramRows(items);
    }).catch(() => {
      if (active) setError("Programs for the selected college could not be loaded.");
    });
    return () => { active = false; };
  }, [selectedCollegeId]);

  const visibleColleges = collegeRows.filter((college) => college.campusId === selectedCampusId);

  return <><PageHeader title="Institutional data" subtitle="Maintain the campus, college, program, and academic-term hierarchy used across PRAXIZ." action={<ActionButton icon={Plus} onClick={() => setAdding(true)}>Add record</ActionButton>} />
    <div className="verification-principle"><ShieldCheck size={20} /><p><strong>Controlled configuration:</strong> these records define registration choices, reporting scopes, and role assignments. Production changes will be permission-checked and audit logged.</p></div>
    {loading && <p>Loading institutional data…</p>}
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="master-data-grid">
      <section className="card master-data-card"><div className="card-title"><h2>Campuses</h2><StatusBadge status={`${campusRows.length} active`} /></div><div className="master-record-list">{campusRows.map((campus) => <MasterRecordRow key={campus.id} primary={campus.shortName} secondary={`${campus.municipality ?? "Campus"}, Camarines Sur`} onClick={() => { setSelectedCampusId(campus.id); setSelectedCollegeId(""); setProgramRows([]); }} />)}</div></section>
      <section className="card master-data-card"><div className="card-title"><h2>Colleges</h2><StatusBadge status={`${collegeRows.length} active`} /></div><div className="master-record-list">{visibleColleges.map((college) => <MasterRecordRow key={college.id} primary={college.shortName} secondary={college.name} onClick={() => setSelectedCollegeId(college.id)} />)}{!visibleColleges.length && <p className="master-record-empty">Select a campus to view its colleges.</p>}</div></section>
      <section className="card master-data-card"><div className="card-title"><h2>Programs</h2><StatusBadge status={`${programRows.length} active`} /></div><div className="master-record-list">{programRows.map((program) => <MasterRecordRow key={program.id} primary={program.code} secondary={program.name} />)}{!programRows.length && <p className="master-record-empty">Select a college to view its programs.</p>}</div></section>
      <section className="card master-data-card"><div className="card-title"><h2>Academic terms</h2><StatusBadge status={`${termRows.filter((term) => term.isCurrent).length} current`} /></div><div className="master-record-list">{termRows.map((term) => <MasterRecordRow key={term.id} primary={`${term.academicYear} · ${term.term}`} secondary={`${term.startsOn} to ${term.endsOn}${term.isCurrent ? " · Current" : ""}`} />)}</div></section>
    </div>{adding && <MasterDataDialog campuses={campusRows} colleges={collegeRows} academicYears={academicYears} close={() => setAdding(false)} onCreated={loadAll} />}</>;
}

function HteVerificationPage({ openModal }: { openModal: (title: string) => void }) {
  const applications = [
    ["Northstar Digital Services", "Leah Villanueva", "Official registration + representative ID", "Pending Review"],
    ["Camarines Sur Tech Hub", "Marco de Vera", "Business permit verified", "Verified"],
    ["Bicol Systems Laboratory", "Ana Cruz", "Authorization letter required", "Needs Revision"],
  ];
  return <><PageHeader title="HTE verification" subtitle="Review partner organizations and authorized representatives before account activation." /><div className="stats-grid three"><StatCard label="Pending review" value="1" icon={Clock3} tone="orange" /><StatCard label="Verified this term" value="12" icon={ShieldCheck} tone="green" /><StatCard label="Needs revision" value="1" icon={AlertTriangle} tone="red" /></div><section className="card table-card"><div className="card-title"><h2>Organization applications</h2><label className="table-search"><Search size={17} /><input placeholder="Search organization…" /></label></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Organization</th><th>Representative</th><th>Verification evidence</th><th>Status</th><th>Action</th></tr></thead><tbody>{applications.map((row) => <tr key={row[0]}><td><b>{row[0]}</b></td><td>{row[1]}</td><td>{row[2]}</td><td><StatusBadge status={row[3]} /></td><td><button className="table-link" onClick={() => openModal(`Review HTE · ${row[0]}`)}>Review</button></td></tr>)}</tbody></table></div></section></>;
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
  const [code, setCode] = useState("");
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
        code,
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
      setError(reason instanceof Error ? reason.message : "The document template could not be created.");
      setLoading(false);
    }
  }

  return <div className="modal-backdrop" role="presentation"><section className="modal master-data-modal" role="dialog" aria-modal="true" aria-label="Create document requirement template"><button className="modal-close" onClick={close} aria-label="Close document template form"><X size={20} /></button><span className="modal-icon"><FileCheck2 /></span><h2>Create document requirement</h2><p>This creates an auditable workflow template. If it is active, PRAXIZ also adds it to current approved and active internships.</p><form onSubmit={submit}>
    <div className="two-fields"><label className="field"><span>Template code</span><input required value={code} onChange={(event) => { setCode(event.target.value); setError(""); }} placeholder="medical-certificate" /></label><label className="field"><span>Workflow phase</span><select value={phase} onChange={(event) => setPhase(event.target.value as DocumentTemplatePhase)}><option value="pre_internship">Pre-Internship</option><option value="during_internship">During Internship</option><option value="post_internship">Post-Internship</option></select></label></div>
    <label className="field"><span>Document name</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Medical Certificate" /></label>
    <label className="field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain what the student must submit…" /></label>
    <div className="two-fields"><label className="field"><span>Accepted files</span><select value={mimePreset} onChange={(event) => setMimePreset(event.target.value as DocumentTemplateMimePreset)}><option value="pdf_images">PDF, JPG, and PNG</option><option value="pdf">PDF only</option></select></label><label className="field"><span>Maximum size (MB)</span><input required type="number" min="1" max="20" step="1" value={maxFileSizeMb} onChange={(event) => setMaxFileSizeMb(event.target.value)} /></label></div>
    <label className="field"><span>Display order</span><input required type="number" min="0" step="1" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} /></label>
    <label className="master-current-option"><input aria-label="Make this a required submission" type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} /><span><strong>Required submission</strong><small>Required templates count toward the student’s document compliance.</small></span></label>
    <label className="master-current-option"><input aria-label="Publish this requirement immediately" type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span><strong>Publish immediately</strong><small>Active templates are assigned to current approved and active internships when created.</small></span></label>
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <div className="modal-actions"><ActionButton variant="secondary" disabled={loading} onClick={close}>Cancel</ActionButton><ActionButton type="submit" disabled={loading}>{loading ? "Creating…" : "Create requirement"}</ActionButton></div>
  </form></section></div>;
}

function DocumentTemplateDetails({ template, close }: { template: DocumentTemplateRecord; close: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label={`View ${template.name}`}><button className="modal-close" onClick={close} aria-label="Close document template details"><X size={20} /></button><span className="modal-icon"><FileCheck2 /></span><h2>{template.name}</h2><p>{template.description || "No description has been provided."}</p><dl className="info-list"><div><dt>Code</dt><dd>{template.code}</dd></div><div><dt>Workflow phase</dt><dd>{documentTemplatePhaseLabels[template.phase]}</dd></div><div><dt>Requirement</dt><dd>{template.isRequired ? "Required" : "Optional"}</dd></div><div><dt>Accepted files</dt><dd>{formatTemplateFileTypes(template.allowedMimeTypes)}</dd></div><div><dt>Maximum size</dt><dd>{Math.round(template.maxFileSizeBytes / 1024 / 1024)} MB</dd></div><div><dt>Display order</dt><dd>{template.displayOrder}</dd></div><div><dt>Status</dt><dd>{template.isActive ? "Published" : "Inactive"}</dd></div></dl><div className="modal-actions"><ActionButton onClick={close}>Done</ActionButton></div></section></div>;
}

function WorkflowTemplatesPage() {
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<DocumentTemplateRecord | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setTemplates(await workflowTemplateService.listDocumentTemplates()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Workflow templates could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void workflowTemplateService.listDocumentTemplates().then((result) => {
      if (active) setTemplates(result);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Workflow templates could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const nextDisplayOrder = templates.length ? Math.max(...templates.map((template) => template.displayOrder)) + 10 : 10;

  return <><PageHeader title="Workflow templates" subtitle="Configure the document requirements students must complete throughout their internship." action={<ActionButton icon={Plus} onClick={() => { setNotice(""); setAdding(true); }}>Create requirement</ActionButton>} />
    <div className="verification-principle"><ShieldCheck size={20} /><p><strong>Controlled configuration:</strong> published requirements are permission-checked, audit logged, and added to current approved and active internships.</p></div>
    {notice && <p className="form-success"><CheckCircle2 size={16} /> {notice}</p>}
    {error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}
    <section className="card table-card"><div className="card-title"><h2>{loading ? "Loading document requirements…" : "Document requirement templates"}</h2><StatusBadge status={`${templates.filter((template) => template.isActive).length} published`} /></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Template</th><th>Workflow phase</th><th>Requirement</th><th>Accepted files</th><th>Limit</th><th>Status</th><th>Action</th></tr></thead><tbody>{templates.map((template) => <tr key={template.id}><td><b>{template.name}</b><small>{template.code}</small></td><td>{documentTemplatePhaseLabels[template.phase]}</td><td>{template.isRequired ? "Required" : "Optional"}</td><td>{formatTemplateFileTypes(template.allowedMimeTypes)}</td><td>{Math.round(template.maxFileSizeBytes / 1024 / 1024)} MB</td><td><StatusBadge status={template.isActive ? "Published" : "Inactive"} /></td><td><button className="table-link" onClick={() => setSelected(template)}>View</button></td></tr>)}{!loading && templates.length === 0 && <tr><td colSpan={7}>No document requirement templates have been configured.</td></tr>}</tbody></table></div></section>
    {adding && <DocumentTemplateDialog nextDisplayOrder={nextDisplayOrder} close={() => setAdding(false)} onCreated={async (count) => { await loadTemplates(); setNotice(count > 0 ? `Requirement created and added to ${count} current internship${count === 1 ? "" : "s"}.` : "Requirement created. No current internship needed provisioning."); }} />}
    {selected && <DocumentTemplateDetails template={selected} close={() => setSelected(null)} />}
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
      setError(reason instanceof Error ? reason.message : "The registration decision could not be saved.");
      setLoading(false);
    }
  }
  const visibleDetails = Object.entries(application.details).filter(([key]) => !["requested_role", "first_name", "middle_name", "last_name"].includes(key));
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label={`Review ${application.name}`}><button className="modal-close" onClick={close} aria-label="Close registration review"><X size={20} /></button><span className="modal-icon"><UserCheck /></span><h2>Review registration</h2><p><strong>{application.name}</strong><br />{application.email} · {application.role}</p><dl className="info-list">{visibleDetails.map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl><label className="field"><span>Administrator notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add verification notes or a rejection reason…" /></label>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="modal-actions"><ActionButton variant="secondary" disabled={loading} onClick={() => void decide("approved")}>Approve and activate</ActionButton><ActionButton variant="danger" disabled={loading || !notes.trim()} onClick={() => void decide("rejected")}>Reject</ActionButton></div></section></div>;
}

function RegistrationTable() {
  const [records, setRecords] = useState<RegistrationRecord[]>([]);
  const [selected, setSelected] = useState<RegistrationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    try { setRecords(await registrationService.listLivePending()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Pending registrations could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void registrationService.listLivePending().then((result) => {
      if (active) setRecords(result);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Pending registrations could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  return <>{error && <p className="form-error"><AlertTriangle size={16} /> {error}</p>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Applicant</th><th>Requested role</th><th>Reference</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.email}</small></td><td>{item.role}</td><td>{item.reference}</td><td>{item.submitted}</td><td><StatusBadge status={item.status} /></td><td><button className="table-link" onClick={() => setSelected(item)}>Review</button></td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={6}>There are no pending registration applications.</td></tr>}</tbody></table></div>{selected && <RegistrationReviewDialog application={selected} close={() => setSelected(null)} onReviewed={() => { setSelected(null); void load(); }} />}</>;
}

function RegistrationsPage() {
  return <><PageHeader title="Pending registrations" subtitle="Verify identities and role requests before account activation." /><section className="card table-card"><RegistrationTable /></section></>;
}

function Modal({ title, close }: { title: string; close: () => void }) {
  const lower = title.toLowerCase();
  const isForm = lower.includes("feedback") || lower.includes("daily log") || lower.includes("revision");
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={close} aria-label="Close dialog"><X size={20} /></button><span className="modal-icon">{isForm ? <FileText /> : <CheckCircle2 />}</span><h2>{title}</h2><p>This supporting workflow is not enabled on this screen yet. No database record was changed.</p><div className="modal-actions"><ActionButton onClick={close}>Close</ActionButton></div></section></div>;
}

function DashboardRouter({ role, page }: { role: RoleId; page: string }) {
  const [modal, setModal] = useState("");
  const openModal = (title: string) => setModal(title);
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
  else if (page === "profile") content = <ProfilePage role={role} openModal={openModal} />;
  else if (page === "settings") content = <ProfilePage role={role} settings openModal={openModal} />;
  else if (page === "interns") content = <InternManagementPage role={role} />;
  else if (page === "analytics") content = <AnalyticsPage />;
  else if (page === "reports") content = <ReportsPage openModal={openModal} />;
  else if (page === "feedback") content = <FeedbackPage openModal={openModal} />;
  else if (page === "htes") content = <DirectoryPage kind="htes" openModal={openModal} />;
  else if (page === "assignments") content = <DirectoryPage kind="assignments" openModal={openModal} />;
  else if (page === "users") content = <DirectoryPage kind="users" openModal={openModal} />;
  else if (page === "master-data") content = <MasterDataPage />;
  else if (page === "hte-verification") content = <HteVerificationPage openModal={openModal} />;
  else if (page === "templates") content = <WorkflowTemplatesPage />;
  else if (page === "roles") content = <DirectoryPage kind="roles" openModal={openModal} />;
  else if (page === "audit-logs") content = <DirectoryPage kind="audit" openModal={openModal} />;
  else if (page === "registrations") content = <RegistrationsPage />;
  else content = <EmptyAction icon={FileText} title="This workspace is ready" copy="Choose a section from the navigation to continue." />;
  return <AppShell role={role} page={page}>{content}{modal && <Modal title={modal} close={() => setModal("")} />}</AppShell>;
}

function PraxizRouter() {
  const pathname = usePathname() || "/";
  const parts = pathname.split("/").filter(Boolean);
  if (pathname === "/") return <LandingPage />;
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
