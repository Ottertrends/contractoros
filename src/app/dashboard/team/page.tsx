import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { isPremiumTeam, maxTeamSeats } from "@/lib/billing/access";
import { TeamPageClient } from "./TeamPageClient";
import Link from "next/link";

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirected=true");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_plan, subscription_status, subscription_seats")
    .eq("id", user.id)
    .single();

  const isTeam = isPremiumTeam(profile ?? {});

  if (!isTeam) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <div className="text-4xl mb-4">👥</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Team Management</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          Team collaboration is available on the <strong>Premium Team</strong> plan.
          Invite team members to share your workspace and AI agent.
        </p>
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          Upgrade to Premium Team — $49/mo
        </Link>
        <p className="text-xs text-slate-400 mt-4">
          Includes 2 seats (owner + 1 member). Extra seats $10/mo each.
        </p>
      </div>
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: members } = await admin
    .from("team_members")
    .select("*")
    .eq("owner_user_id", user.id)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  const maxSeats = maxTeamSeats(profile ?? {});

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Team</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Invite team members to share your workspace. They'll see your projects, clients, and invoices.
        </p>
      </div>
      <TeamPageClient
        initialMembers={(members ?? []) as Parameters<typeof TeamPageClient>[0]["initialMembers"]}
        maxSeats={maxSeats}
      />
    </div>
  );
}
