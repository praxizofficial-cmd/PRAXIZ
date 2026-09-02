function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getSiteOrigin(fallback = "http://localhost:3000") {
  return normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL
      ?? process.env.NEXT_PUBLIC_VERCEL_URL
      ?? fallback,
  );
}
