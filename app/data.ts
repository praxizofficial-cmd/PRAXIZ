import type { AcademicTerm, Campus, College, Intern, NavItem, Program, RoleId } from "./types";

export type { Intern, NavItem, RoleId } from "./types";

export const roles: Record<RoleId, {
  label: string;
  user: string;
  initials: string;
  subtitle: string;
  accent: string;
  nav: NavItem[];
}> = {
  student: {
    label: "Student Intern",
    user: "Maria Santos",
    initials: "MS",
    subtitle: "BSIT — 3rd Year",
    accent: "blue",
    nav: [
      { label: "Dashboard", href: "/student/dashboard", icon: "dashboard" },
      { label: "Attendance", href: "/student/attendance", icon: "calendar", permission: "attendance:view" },
      { label: "Daily Logs", href: "/student/daily-logs", icon: "logs", permission: "daily-logs:submit" },
      { label: "Documents", href: "/student/documents", icon: "documents", permission: "documents:upload" },
      { label: "Evaluations", href: "/student/evaluations", icon: "star", permission: "evaluations:view" },
      { label: "Internship Progress", href: "/student/progress", icon: "progress" },
      { label: "Notifications", href: "/student/notifications", icon: "bell" },
      { label: "Profile", href: "/student/profile", icon: "profile" },
    ],
  },
  hte: {
    label: "HTE Representative",
    user: "Allan Maraña",
    initials: "AM",
    subtitle: "TechSouth Philippines",
    accent: "green",
    nav: [
      { label: "Dashboard", href: "/hte/dashboard", icon: "dashboard" },
      { label: "Assigned Interns", href: "/hte/interns", icon: "users" },
      { label: "Attendance Verification", href: "/hte/attendance", icon: "calendar", permission: "attendance:verify" },
      { label: "Daily Logs", href: "/hte/logs", icon: "logs", permission: "daily-logs:review" },
      { label: "Feedback", href: "/hte/feedback", icon: "feedback" },
      { label: "Evaluations", href: "/hte/evaluations", icon: "star", permission: "evaluations:score" },
      { label: "Notifications", href: "/hte/notifications", icon: "bell" },
    ],
  },
  coordinator: {
    label: "Internship Coordinator",
    user: "Engr. John Kevin C. Gavica",
    initials: "JG",
    subtitle: "Program Coordinator",
    accent: "orange",
    nav: [
      { label: "Dashboard", href: "/coordinator/dashboard", icon: "dashboard" },
      { label: "Intern Management", href: "/coordinator/interns", icon: "users" },
      { label: "Partner HTEs", href: "/coordinator/htes", icon: "briefcase" },
      { label: "Internship Assignments", href: "/coordinator/assignments", icon: "assignments", permission: "internships:manage" },
      { label: "Attendance Monitoring", href: "/coordinator/attendance", icon: "calendar", permission: "attendance:verify" },
      { label: "Document Compliance", href: "/coordinator/documents", icon: "documents", permission: "documents:review" },
      { label: "Evaluations", href: "/coordinator/evaluations", icon: "star", permission: "evaluations:finalize" },
      { label: "Analytics", href: "/coordinator/analytics", icon: "analytics" },
      { label: "Reports", href: "/coordinator/reports", icon: "reports", permission: "reports:generate" },
      { label: "Feedback", href: "/coordinator/feedback", icon: "feedback" },
      { label: "Notifications", href: "/coordinator/notifications", icon: "bell" },
    ],
  },
  admin: {
    label: "System Administrator",
    user: "Alex Rivera",
    initials: "AR",
    subtitle: "PRAXIZ Administration",
    accent: "red",
    nav: [
      { label: "Dashboard", href: "/admin/dashboard", icon: "dashboard" },
      { label: "User Accounts", href: "/admin/users", icon: "users", permission: "users:manage" },
      { label: "Pending Registrations", href: "/admin/registrations", icon: "profile" },
      { label: "HTE Verification", href: "/admin/hte-verification", icon: "briefcase", permission: "users:manage" },
      { label: "Institutional Data", href: "/admin/master-data", icon: "settings", permission: "master-data:manage" },
      { label: "Workflow Templates", href: "/admin/templates", icon: "documents", permission: "master-data:manage" },
      { label: "Roles & Access", href: "/admin/roles", icon: "shield", permission: "users:manage" },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: "logs", permission: "audit:view" },
      { label: "System Settings", href: "/admin/settings", icon: "settings" },
    ],
  },
};

export const interns: Intern[] = [
  { initials: "MS", name: "Maria Santos", campus: "Goa Campus", program: "BSIT", hte: "TechSouth PH", hteRepresentative: "Allan Maraña", hours: 245, attendance: 92, requirements: "4/5", status: "Active" },
  { initials: "JD", name: "Juan dela Vega", campus: "Goa Campus", program: "BSCS", hte: "Albay ICT", hteRepresentative: "Carla Mendoza", hours: 310, attendance: 95, requirements: "5/5", status: "Active" },
  { initials: "LC", name: "Liza Camino", campus: "San Jose Campus", program: "BSIT", hte: "Bigasburo Digital", hteRepresentative: "Paolo Reyes", hours: 400, attendance: 98, requirements: "5/5", status: "Completed" },
  { initials: "RF", name: "Ronnie Fajardo", campus: "Sagñay Campus", program: "BSIS", hte: "GovTech PH", hteRepresentative: "HTE representative", hours: 128, attendance: 80, requirements: "3/5", status: "Needs Attention" },
  { initials: "GC", name: "Gena Castillo", campus: "Tinambac Campus", program: "BSCS", hte: "CloudSpark Inc.", hteRepresentative: "HTE representative", hours: 200, attendance: 88, requirements: "4/5", status: "Active" },
  { initials: "CB", name: "Carlo Bernal", campus: "Goa Campus", program: "BSIT", hte: "BIR Legazpi", hteRepresentative: "HTE representative", hours: 172, attendance: 85, requirements: "4/5", status: "Active" },
];

export const attendanceRecords = [
  { date: "Aug 6, 2026", day: "Thursday", timeIn: "7:58 AM", timeOut: "5:02 PM", hours: "8h 4m", status: "Pending Verification", verifiedBy: "—", remarks: "Awaiting HTE review" },
  { date: "Aug 5, 2026", day: "Wednesday", timeIn: "8:00 AM", timeOut: "5:00 PM", hours: "8h 0m", status: "Verified", verifiedBy: "Allan Maraña", remarks: "Confirmed against HTE attendance sheet" },
  { date: "Aug 4, 2026", day: "Tuesday", timeIn: "7:55 AM", timeOut: "5:05 PM", hours: "8h 10m", status: "Verified", verifiedBy: "Allan Maraña", remarks: "Verified" },
  { date: "Aug 1, 2026", day: "Saturday", timeIn: "8:10 AM", timeOut: "5:00 PM", hours: "7h 50m", status: "Verified", verifiedBy: "Allan Maraña", remarks: "Approved scheduled weekend duty" },
  { date: "Jul 31, 2026", day: "Friday", timeIn: "8:02 AM", timeOut: "5:00 PM", hours: "7h 58m", status: "Verified", verifiedBy: "Allan Maraña", remarks: "Verified" },
];

export const campuses: Campus[] = [
  { id: "20000000-0000-4000-8000-000000000002", name: "Partido State University – Main Campus", shortName: "Main Campus" },
];

export const colleges: College[] = [
  { id: "20000000-0000-4000-8000-000000000003", campusId: "20000000-0000-4000-8000-000000000002", name: "College of Engineering and Computational Sciences", shortName: "CECS" },
];

export const programs: Program[] = [
  { id: "40000000-0000-4000-8000-000000000001", collegeId: "20000000-0000-4000-8000-000000000003", code: "BSIT", name: "BS Information Technology" },
  { id: "40000000-0000-4000-8000-000000000002", collegeId: "20000000-0000-4000-8000-000000000003", code: "BSCS", name: "BS Computer Science" },
  { id: "40000000-0000-4000-8000-000000000003", collegeId: "20000000-0000-4000-8000-000000000003", code: "BSIS", name: "BS Information Systems" },
];

export const academicTerms: AcademicTerm[] = [
  { id: "term-2026-1", academicYear: "2026–2027", term: "First Semester", startsOn: "2026-08-10", endsOn: "2026-12-18", isCurrent: true },
  { id: "term-2026-2", academicYear: "2026–2027", term: "Second Semester", startsOn: "2027-01-11", endsOn: "2027-05-28", isCurrent: false },
  { id: "term-2026-midyear", academicYear: "2026–2027", term: "Midyear", startsOn: "2027-06-07", endsOn: "2027-07-30", isCurrent: false },
];

export const dashboardData = {
  student: {
    renderedHours: 245,
    requiredHours: 400,
    attendanceRate: 92,
    logsSubmitted: 18,
    logsRequired: 20,
    documentsApproved: 4,
    documentsRequired: 5,
    coordinator: "Engr. John Kevin C. Gavica",
    hte: "TechSouth Philippines, Inc.",
    campus: "Goa Campus",
    internshipPeriod: "June 2 – September 5, 2026",
  },
  hte: { assignedInterns: 3, attendanceAwaiting: 2, pendingEvaluations: 1, totalHoursLogged: 617 },
  coordinator: { totalInterns: 47, activeInterns: 38, completedInterns: 9, partnerHtes: 14, missingRequirements: 6 },
  admin: { activeAccounts: 132, pendingRegistrations: 3, roleAssignments: 132, securityEvents: 0 },
} as const;

export const dailyLogs = [
  { date: "Aug 6, 2026", week: "Week 8", summary: "Developed frontend components for the inventory module; attended stand-up meeting; reviewed UI states.", submitted: "Aug 6 · 5:42 PM", status: "Submitted" },
  { date: "Aug 5, 2026", week: "Week 8", summary: "Continued API integration planning for the product catalog; documented validation requirements.", submitted: "Aug 5 · 6:10 PM", status: "Approved" },
  { date: "Aug 4, 2026", week: "Week 8", summary: "Participated in sprint planning; updated tickets; began work on the admin user table.", submitted: "Aug 4 · 5:55 PM", status: "Approved" },
  { date: "Aug 1, 2026", week: "Week 7", summary: "Revised login form validation and prepared changes for review.", submitted: "Aug 2 · 8:00 AM", status: "Needs Revision" },
  { date: "Jul 31, 2026", week: "Week 7", summary: "Completed authentication module documentation and presented progress to the supervisor.", submitted: "Jul 31 · 6:00 PM", status: "Approved" },
];

export const documents = [
  { phase: "Pre-Internship", name: "Acceptance Form", file: "acceptance_form_santos.pdf", date: "June 3, 2026", status: "Approved", note: "All fields properly filled." },
  { phase: "Pre-Internship", name: "Memorandum of Agreement", file: "MOA_techsouth_psu.pdf", date: "June 3, 2026", status: "Approved", note: "MOA signed by all parties." },
  { phase: "During Internship", name: "Daily Time Record (DTR)", file: "DTR_week1to8_santos.pdf", date: "Aug 5, 2026", status: "Needs Revision", note: "Week 6 time-out entry has a discrepancy. Please revise." },
  { phase: "During Internship", name: "Weekly Accomplishment Report", file: "WAR_week8_santos.pdf", date: "Aug 5, 2026", status: "Submitted", note: "Awaiting HTE representative review." },
  { phase: "Post-Internship", name: "Final Evaluation Form", file: "No file uploaded", date: "Due Sep 5, 2026", status: "Missing", note: "Submit before the end of the internship period." },
];

export const notifications = [
  { title: "Daily Log Approved", message: "Your daily log for Week 8, Day 2 was approved by Allan Maraña.", time: "2 hours ago", tone: "success", unread: true },
  { title: "Document Needs Revision", message: "Your Daily Time Record (Week 6) requires correction. Review the feedback and resubmit.", time: "5 hours ago", tone: "warning", unread: true },
  { title: "Attendance Verified", message: "Your attendance for August 5, 2026 was verified by your HTE supervisor.", time: "Yesterday", tone: "success", unread: true },
  { title: "Evaluation Submitted", message: "Your midterm evaluation was submitted by Allan Maraña. Scores are available in Evaluations.", time: "2 days ago", tone: "info", unread: false },
  { title: "Internship Requirement Reminder", message: "Your Final Evaluation Form is still missing. Coordinate with your internship coordinator.", time: "3 days ago", tone: "warning", unread: false },
  { title: "New HTE Feedback", message: "Allan Maraña provided feedback on your Week 7 accomplishment report.", time: "4 days ago", tone: "info", unread: false },
];

export const evaluations = [
  { label: "Work Quality", detail: "Accuracy, thoroughness, and quality of outputs", score: 4 },
  { label: "Professionalism", detail: "Conduct, workplace etiquette, and attitude", score: 5 },
  { label: "Communication Skills", detail: "Written and verbal communication effectiveness", score: 4 },
  { label: "Punctuality", detail: "Attendance, timeliness, and meeting deadlines", score: 5 },
  { label: "Initiative", detail: "Proactiveness and self-motivation at work", score: 4 },
  { label: "Technical Competency", detail: "Application of knowledge and technical skills", score: 4 },
  { label: "Teamwork", detail: "Collaboration, cooperation, and team contribution", score: 5 },
];

export const activity = [
  { title: "Daily Log Submitted", detail: "Week 8, Day 3", date: "Aug 6, 2026", status: "Submitted" },
  { title: "Attendance Verified", detail: "Time in/out confirmed", date: "Aug 5, 2026", status: "Verified" },
  { title: "Document Approved", detail: "Weekly Accomplishment Report — Week 7", date: "Aug 4, 2026", status: "Approved" },
  { title: "Supervisor Feedback Received", detail: "Performance review for Week 7", date: "Aug 3, 2026", status: "Submitted" },
  { title: "DTR Needs Revision", detail: "Week 6 contains a time discrepancy", date: "Aug 1, 2026", status: "Needs Revision" },
];

export const feedbackThreads = [
  { student: "Maria Santos", subject: "Week 6 DTR discrepancy", from: "Allan Maraña", status: "Open", date: "Aug 6, 2026" },
  { student: "Ronnie Fajardo", subject: "Attendance follow-up", from: "Engr. John Kevin C. Gavica", status: "In Progress", date: "Aug 5, 2026" },
  { student: "Gena Castillo", subject: "Week 7 report feedback", from: "Paolo Reyes", status: "Resolved", date: "Aug 3, 2026" },
];

export const pendingRegistrations = [
  { name: "Angelica Perez", role: "Student Intern", reference: "2023-01452", submitted: "Aug 12, 2026", status: "Pending" },
  { name: "Northstar Digital Labs", role: "HTE Representative", reference: "HTE-2026-019", submitted: "Aug 11, 2026", status: "Pending" },
];
