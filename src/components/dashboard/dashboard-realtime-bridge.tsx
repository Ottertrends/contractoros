"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";

export function DashboardRealtimeBridge({ userId }: { userId: string }) {
  const router = useRouter();

  React.useEffect(() => {
    const channel = supabase
      .channel(`projects-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          toast.message("🤖 Project updated via WhatsApp", {
            description: "Refreshing your dashboard…",
          });
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
