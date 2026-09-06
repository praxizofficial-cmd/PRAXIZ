/** Existing database codes only. Historical roles are not current workspace roles. */
export const supportedRoleCodes = ['student_intern', 'internship_coordinator', 'hte_supervisor', 'system_admin'] as const;
export type SupportedRoleCode = typeof supportedRoleCodes[number];

export function isSupportedRoleCode(code: string): code is SupportedRoleCode {
  return supportedRoleCodes.some(supported => supported === code);
}

export const supportedRoleNames: Record<SupportedRoleCode, string> = {
  student_intern: 'Student Intern',
  internship_coordinator: 'Internship Coordinator',
  hte_supervisor: 'HTE Representative',
  system_admin: 'System Administrator',
};
