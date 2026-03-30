import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { AdminMessagesClient } from "./AdminMessagesClient";

export default async function AdminMessagesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const admin = createSupabaseAdminClient();

  const { data: messages } = await admin
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false });

  return <AdminMessagesClient messages={messages ?? []} />;
}
