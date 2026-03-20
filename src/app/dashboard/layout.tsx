import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LanguageProvider } from "@/lib/i18n/client";
import { getServerLang } from "@/lib/i18n/server";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { DashboardRealtimeBridge } from "@/components/dashboard/dashboard-realtime-bridge";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const safeProfile = profile ?? {
    id: user.id,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? "User",
    company_name:
      (user.user_metadata?.company_name as string | undefined) ??
      "ContractorOS",
    email: user.email ?? "",
    phone: (user.user_metadata?.phone as string | undefined) ?? "",
    quotes_per_month: null,
    business_areas: null,
    services: null,
    whatsapp_connected: false,
    whatsapp_instance_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const lang = await getServerLang();

  return (
    <LanguageProvider initialLang={lang}>
      <div className="min-h-screen bg-background">
        <div className="flex">
          <Sidebar />
          <div className="flex-1 min-w-0">
            <DashboardRealtimeBridge userId={user.id} />
            <TopBar profile={safeProfile} />
            <main className="px-4 py-6 md:px-6">{children}</main>
          </div>
        </div>
      </div>
    </LanguageProvider>
  );
}

