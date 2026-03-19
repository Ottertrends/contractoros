"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";

export function TopBar({ profile }: { profile: Profile }) {
  const router = useRouter();
  const initials = useMemo(() => {
    const parts = profile.full_name?.trim().split(/\s+/).filter(Boolean) ?? [];
    const first = parts[0]?.[0] ?? "";
    const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
    return (first + second).toUpperCase() || "CO";
  }, [profile.full_name]);

  async function onSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex flex-col">
          <div className="text-sm text-slate-500">Welcome</div>
          <div className="text-base font-semibold text-slate-900 dark:text-slate-50">
            {profile.company_name}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-50">
              {profile.full_name}
            </div>
            <div className="text-xs text-slate-500">{profile.email}</div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="User menu">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void onSignOut()}>
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

