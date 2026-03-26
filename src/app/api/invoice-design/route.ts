import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("invoice_logo_url, invoice_primary_color, invoice_title_font, invoice_body_font, invoice_footer")
    .eq("id", user.id)
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { invoice_primary_color, invoice_title_font, invoice_body_font, invoice_footer, invoice_logo_url } = body;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({
      ...(invoice_logo_url !== undefined && { invoice_logo_url }),
      ...(invoice_primary_color && { invoice_primary_color }),
      ...(invoice_title_font && { invoice_title_font }),
      ...(invoice_body_font && { invoice_body_font }),
      invoice_footer: invoice_footer?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("invoice_logo_url, invoice_primary_color, invoice_title_font, invoice_body_font, invoice_footer")
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}
