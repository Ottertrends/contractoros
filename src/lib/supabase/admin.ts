import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Service-role Supabase client. Server-only (webhooks, agent tools).
 * Bypasses RLS — always scope queries by user_id.
 */
export function createSupabaseAdminClient() {
  if (!supabaseUrl?.trim() || !serviceRoleKey?.trim()) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
