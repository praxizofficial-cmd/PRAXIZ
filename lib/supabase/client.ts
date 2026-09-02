"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const { url, publishableKey } = getPublicSupabaseEnv();
  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}
