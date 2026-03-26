import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientsClient } from "@/components/clients/clients-client";
import type { Client } from "@/lib/types/database";

export default async function ClientsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", user.id)
    .order("client_name");

  return <ClientsClient initialClients={(data ?? []) as Client[]} />;
}
