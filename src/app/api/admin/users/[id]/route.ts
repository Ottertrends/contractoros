import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  return !!token && verifyAdminToken(token);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [{ data: profile }, { data: projects }, { data: invoices }, { data: memory }, { data: usage }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", id).single(),
    admin.from("projects").select("id, name, status").eq("user_id", id).order("updated_at", { ascending: false }),
    admin.from("invoices").select("id, invoice_number, status, total").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("agent_memory").select("memory_text, updated_at").eq("user_id", id).maybeSingle(),
    admin.from("api_usage").select("*").eq("user_id", id).gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).order("date", { ascending: false }),
  ]);

  return NextResponse.json({ profile, projects, invoices, memory, usage });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  // Only allow changing subscription_plan and subscription_status
  const allowed = ["subscription_plan", "subscription_status"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { error } = await admin.from("profiles").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
