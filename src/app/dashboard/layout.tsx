import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";

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
    // Middleware should handle this, but keep a safe fallback.
    throw new Error("Not authenticated");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    throw new Error("Profile not found");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <Sidebar />
        <div className="flex-1 min-w-0">
          <DashboardRealtimeBridge userId={user.id} />
          <TopBar profile={profile} />
          <main className="px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

