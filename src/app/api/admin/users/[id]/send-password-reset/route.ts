import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  return !!token && verifyAdminToken(token);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: user, error: userError } = await admin.auth.admin.getUserById(id);
  if (userError || !user.user?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const redirectTo = `${appUrl}/auth/callback?redirect=/auth/reset-password`;

  // generateLink with type=recovery triggers Supabase to send the recovery email
  const { error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: user.user.email,
    options: { redirectTo },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
