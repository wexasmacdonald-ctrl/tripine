import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/infrastructure/env";

export function createAdminClient() {
  const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !secret) throw new Error("Supabase server credentials are not configured");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
