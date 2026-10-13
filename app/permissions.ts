import type { Permission, RoleId } from "./types";

const rolePermissions: Record<RoleId, ReadonlySet<Permission>> = {
  student: new Set([
    "attendance:view",
    "attendance:record",
    "daily-logs:submit",
    "documents:upload",
    "evaluations:view",
  ]),
  hte: new Set([
    "attendance:view",
    "attendance:verify",
    "daily-logs:review",
    "evaluations:view",
    "evaluations:score",
    "hte-offerings:manage",
  ]),
  coordinator: new Set([
    "attendance:view",
    "attendance:verify",
    "daily-logs:review",
    "documents:review",
    "evaluations:view",
    "evaluations:finalize",
    "hte-offerings:manage",
    "internships:manage",
    "reports:generate",
  ]),
  placement: new Set([
    "attendance:view",
    "documents:review",
    "evaluations:view",
    "reports:generate",
    "placement:read",
    "placement:manage",
    "file-formats:submit",
  ]),
  admin: new Set([
    "attendance:view",
    "attendance:record",
    "attendance:verify",
    "daily-logs:submit",
    "daily-logs:review",
    "documents:upload",
    "documents:review",
    "evaluations:view",
    "hte-offerings:manage",
    "internships:manage",
    "reports:generate",
    "users:manage",
    "master-data:manage",
    "audit:view",
    "placement:read",
    "placement:manage",
    "file-formats:publish",
  ]),
};

export function hasPermission(role: RoleId, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export function permissionsFor(role: RoleId): Permission[] {
  return [...rolePermissions[role]];
}
