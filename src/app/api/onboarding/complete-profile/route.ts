import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    phone?: string;
    company_name?: string;
    zip_code?: string;
    quotes_per_month?: string;
    business_areas?: string[];
    services?: string[];
  };

  const { phone, company_name, zip_code, quotes_per_month, business_areas, services } = body;

  if (!phone?.trim()) {
    return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  }
  if (!company_name?.trim()) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      phone: phone.trim(),
      company_name: company_name.trim(),
      zip_code: zip_code?.trim() ?? null,
      quotes_per_month: quotes_per_month ?? "1-5",
      business_areas: business_areas ?? [],
      services: services ?? [],
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[complete-profile]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
