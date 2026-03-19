import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SettingsPageClient } from "@/components/settings/settings-page-client";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return <SettingsPageClient userId={user.id} profile={profile} />;
}

