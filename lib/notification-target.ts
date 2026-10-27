/** Keep notification navigation inside the active workspace. Authorization remains server enforced. */
export function notificationTarget(path: string | null | undefined, role: string): string | null {
  if (!path || !["student", "hte", "coordinator", "placement", "admin"].includes(role)) return null;
  if (!path.startsWith(`/${role}/`) || /[\\\r\n]/.test(path)) return null;
  try {
    const url = new URL(path, "https://praxiz.local");
    if (url.origin !== "https://praxiz.local" || !url.pathname.startsWith(`/${role}/`)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
