import type { NavItem, RoleId } from "./types";

export type { NavItem, RoleId } from "./types";

export const roles: Record<RoleId, { label: string; user: string; initials: string; subtitle: string; accent: string; nav: NavItem[] }> = {
  student: {
    label: "Student Intern", user: "Student Intern", initials: "SI", subtitle: "Student workspace", accent: "blue",
    nav: [
      { label: "Dashboard", href: "/student/dashboard", icon: "dashboard" },
      { label: "Attendance", href: "/student/attendance", icon: "calendar", permission: "attendance:view" },
      { label: "Daily Logs", href: "/student/daily-logs", icon: "logs", permission: "daily-logs:submit" },
      { label: "Documents", href: "/student/documents", icon: "documents", permission: "documents:upload" },
      { label: "Evaluations", href: "/student/evaluations", icon: "star", permission: "evaluations:view" },
      { label: "Feedback", href: "/student/feedback", icon: "feedback" },
      { label: "Internship Progress", href: "/student/progress", icon: "progress" },
      { label: "Notifications", href: "/student/notifications", icon: "bell" },
      { label: "Profile", href: "/student/profile", icon: "profile" },
    ],
  },
  hte: {
    label: "HTE Representative", user: "HTE Representative", initials: "HT", subtitle: "HTE workspace", accent: "green",
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
    label: "Internship Coordinator", user: "Internship Coordinator", initials: "IC", subtitle: "Program coordinator", accent: "orange",
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
    label: "System Administrator", user: "System Administrator", initials: "SA", subtitle: "PRAXIZ administration", accent: "red",
    nav: [
      { label: "Dashboard", href: "/admin/dashboard", icon: "dashboard" },
      { label: "User Accounts", href: "/admin/users", icon: "users", permission: "users:manage" },
      { label: "Registrations", href: "/admin/registrations", icon: "profile" },
      { label: "HTE Verification", href: "/admin/hte-verification", icon: "briefcase", permission: "users:manage" },
      { label: "Institutional Data", href: "/admin/master-data", icon: "settings", permission: "master-data:manage" },
      { label: "Workflow Templates", href: "/admin/templates", icon: "documents", permission: "master-data:manage" },
      { label: "Roles & Access", href: "/admin/roles", icon: "shield", permission: "users:manage" },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: "logs", permission: "audit:view" },
      { label: "System Settings", href: "/admin/settings", icon: "settings" },
    ],
  },
};
