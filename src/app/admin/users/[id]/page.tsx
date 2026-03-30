import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { AdminUserDetailClient } from "./AdminUserDetailClient";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const [
    { data: profile },
    { data: projects },
    { data: invoices },
    { data: memory },
    { data: usage },
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("id", id).single(),
    admin.from("projects").select("id, name, status").eq("user_id", id).order("updated_at", { ascending: false }),
    admin.from("invoices").select("id, invoice_number, status, total").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("agent_memory").select("memory_text, updated_at").eq("user_id", id).maybeSingle(),
    admin.from("api_usage").select("*").eq("user_id", id).gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).order("date", { ascending: false }),
  ]);

  if (!profile) redirect("/admin/users");

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/admin/users" className="text-sm text-slate-400 hover:underline">
                &larr; All Users
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {profile.full_name ?? "Unknown"}
            </h1>
            <p className="text-sm text-slate-500">{profile.company_name}</p>
            <p className="text-sm text-slate-400">{profile.email}</p>
            {profile.phone && <p className="text-sm text-slate-400">{profile.phone}</p>}
            <p className="text-xs text-slate-400 mt-1">
              Joined: {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
            </p>
          </div>
        </div>

        <AdminUserDetailClient
          userId={id}
          profile={profile}
          projects={projects ?? []}
          invoices={invoices ?? []}
          memory={memory ?? null}
          usage={usage ?? []}
        />
      </div>
    </div>
  );
}
