import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProposalLineItem, ContentBlock, ProposalDesign } from "@/lib/types/proposals";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !data)
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const blocks = (data.content_blocks ?? []) as ContentBlock[];
    for (const block of blocks) {
      if (block.type === "image" && block.storagePath) {
        const { data: urlData } = await admin.storage
          .from("project-media")
          .createSignedUrl(block.storagePath, 3600);
        if (urlData?.signedUrl) block.imageUrl = urlData.signedUrl;
      }
    }

    return NextResponse.json({ proposal: { ...data, content_blocks: blocks } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to get proposal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      title?: string;
      clientName?: string;
      scope?: string;
      terms?: string;
      validUntil?: string;
      lineItems?: ProposalLineItem[];
      contentBlocks?: ContentBlock[];
      status?: string;
      design?: ProposalDesign | null;
    };

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) update.title = body.title;
    if (body.clientName !== undefined) update.client_name = body.clientName;
    if (body.scope !== undefined) update.scope = body.scope;
    if (body.terms !== undefined) update.terms = body.terms;
    if (body.validUntil !== undefined) update.valid_until = body.validUntil;
    if (body.lineItems !== undefined) update.line_items = body.lineItems;
    if (body.contentBlocks !== undefined) {
      update.content_blocks = body.contentBlocks.map((b) => ({ ...b, imageUrl: undefined }));
    }
    if (body.status !== undefined) update.status = body.status;
    if (body.design !== undefined) update.design = body.design;

    const { error } = await supabase
      .from("proposals")
      .update(update)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update proposal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await supabase
      .from("proposals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete proposal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
