import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { mediaId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json()) as { description?: string | null; sort_order?: number };
  const patch: Record<string, unknown> = {};
  if ("description" in body) patch.description = body.description ?? null;
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;

  if (Object.keys(patch).length === 0)
    return new Response(JSON.stringify({ error: "Nothing to update" }), { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("project_media")
    .update(patch)
    .eq("id", mediaId)
    .eq("user_id", user.id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { mediaId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const admin = createSupabaseAdminClient();

  const { data: media, error: fetchErr } = await admin
    .from("project_media")
    .select("storage_path")
    .eq("id", mediaId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !media) return new Response("Not found", { status: 404 });

  // Delete from storage
  await admin.storage.from("project-media").remove([media.storage_path]);

  // Delete DB record
  await admin.from("project_media").delete().eq("id", mediaId).eq("user_id", user.id);

  return new Response(null, { status: 204 });
}
