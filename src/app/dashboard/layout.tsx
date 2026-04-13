import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LanguageProvider } from "@/lib/i18n/client";
import { getServerLang } from "@/lib/i18n/server";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { DashboardRealtimeBridge } from "@/components/dashboard/dashboard-realtime-bridge";
import { OnboardingGuide } from "@/components/onboarding/onboarding-guide";
import { ProfileSetupModal } from "@/components/onboarding/profile-setup-modal";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?redirected=true");
  }

  const [{ data: profile }, lang] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getServerLang(),
  ]);

  // If this user was invited as a team member, link their user_id to the team_members row
  const ownerUserId = user.user_metadata?.owner_user_id as string | undefined;
  if (ownerUserId && user.email) {
    try {
      const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
      const adminClient = createSupabaseAdminClient();
      const { data: row } = await adminClient
        .from("team_members")
        .select("id, status")
        .eq("owner_user_id", ownerUserId)
        .eq("invited_email", user.email)
        .in("status", ["pending"])
        .maybeSingle();
      if (row) {
        await adminClient
          .from("team_members")
          .update({
            member_user_id: user.id,
            status: "active",
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    } catch { /* non-fatal */ }
  }

  const safeProfile = profile ?? {
    id: user.id,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? "User",
    company_name:
      (user.user_metadata?.company_name as string | undefined) ??
      "WorkSupp",
    email: user.email ?? "",
    phone: (user.user_metadata?.phone as string | undefined) ?? "",
    quotes_per_month: null,
    business_areas: null,
    services: null,
    whatsapp_connected: false,
    whatsapp_instance_id: null,
    whatsapp_secondary_connected: false,
    whatsapp_secondary_instance_id: null,
    onboarding_completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const onboardingDone = !!(safeProfile as { onboarding_completed_at?: string | null }).onboarding_completed_at;
  // Google users who bypassed signup have no phone — show profile setup modal instead of onboarding guide
  const needsProfileSetup = !onboardingDone && !safeProfile.phone;
  // Email/password users with phone but haven't completed the onboarding tour
  const showOnboarding = !onboardingDone && !!safeProfile.phone;

  return (
    <LanguageProvider initialLang={lang}>
      <div className="min-h-screen bg-background">
        <div className="flex">
          <Sidebar
            userName={safeProfile.full_name}
            userEmail={safeProfile.email}
            subscriptionPlan={(safeProfile as { subscription_plan?: string | null }).subscription_plan ?? null}
          />
          <div className="flex-1 min-w-0">
            <DashboardRealtimeBridge userId={user.id} />
            <TopBar profile={safeProfile} />
            <ProfileSetupModal show={needsProfileSetup} defaultCompanyName={safeProfile.company_name} />
            <OnboardingGuide show={!needsProfileSetup && showOnboarding} />
            <main className="px-4 py-6 md:px-6">{children}</main>
          </div>
        </div>
      </div>
    </LanguageProvider>
  );
}

