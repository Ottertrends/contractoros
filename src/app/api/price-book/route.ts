import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("price_book")
    .select("*")
    .eq("user_id", user.id)
    .order("item_name");

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const { item_name, description, unit, unit_price, supplier, category } = body;

  if (!item_name || item_name.trim() === "") {
    return new Response("item_name is required", { status: 400 });
  }
  if (unit_price === undefined || unit_price === null || unit_price === "") {
    return new Response("unit_price is required", { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("price_book")
    .insert({
      user_id: user.id,
      item_name: item_name.trim(),
      description: description?.trim() || null,
      unit: unit?.trim() || null,
      unit_price: String(unit_price),
      supplier: supplier?.trim() || null,
      category: category?.trim() || null,
    })
    .select()
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data, { status: 201 });
}
