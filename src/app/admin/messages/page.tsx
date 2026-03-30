import { createClient } from "@supabase/supabase-js";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { AdminMessagesClient } from "./AdminMessagesClient";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function AdminMessagesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const { data: messages } = await admin
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false });

  return <AdminMessagesClient messages={messages ?? []} />;
}
