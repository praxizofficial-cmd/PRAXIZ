const missingMessage = (name: string) =>
  `Missing ${name}. Copy .env.example to .env.local and add the value from Supabase Project Settings -> API.`;

export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error(missingMessage("NEXT_PUBLIC_SUPABASE_URL"));
  if (!publishableKey) throw new Error(missingMessage("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"));

  return { url, publishableKey };
}
