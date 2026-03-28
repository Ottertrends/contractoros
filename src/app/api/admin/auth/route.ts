import { NextRequest, NextResponse } from "next/server";
import { signAdminToken } from "@/lib/admin/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  // Strip actual newlines AND literal \n sequences (Vercel CLI artifact)
  const cleanEnv = (v: string | undefined) =>
    (v ?? "").replace(/\\n/g, "").replace(/[\r\n]/g, "").trim();

  const envUser = cleanEnv(process.env.ADMIN_USERNAME);
  const envPass = cleanEnv(process.env.ADMIN_PASSWORD);

  // Temporary: log for debugging (remove after confirmed working)
  console.log("[admin-auth] user_len=%d pass_len=%d env_user_len=%d env_pass_len=%d match=%s",
    String(username).length, String(password).length,
    envUser.length, envPass.length,
    String(username === envUser && password === envPass));

  if (username !== envUser || password !== envPass) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signAdminToken();

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", "", { maxAge: 0, path: "/" });
  return res;
}
