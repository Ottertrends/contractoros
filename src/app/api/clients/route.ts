import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("clients")
    .select("*")
    .eq("user_id", user.id)
    .order("client_name");

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { client_name, address, city, state, zip, phone, email, notes } = body;

  if (!client_name?.trim()) return new Response("client_name is required", { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("clients")
    .insert({
      user_id: user.id,
      client_name: client_name.trim(),
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      zip: zip?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
}
