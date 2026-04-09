import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/subscriptions
 * Returns all service plans + client subscriptions for the authenticated contractor.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: plans }, { data: subscriptions }] = await Promise.all([
    supabase
      .from("service_plans")
      .select("*, projects(name, client_name, client_email)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("client_subscriptions")
      .select("*, projects(name, client_name, client_email), service_plans(name, amount, interval)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({ plans: plans ?? [], subscriptions: subscriptions ?? [] });
}
