import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProposalLineItem, ContentBlock, ProposalDesign } from "@/lib/types/proposals";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      projectId: string;
      title: string;
      clientName?: string;
      scope?: string;
      terms?: string;
      validUntil?: string;
      lineItems: ProposalLineItem[];
      contentBlocks: ContentBlock[];
      companyName?: string;
      companyEmail?: string;
      companyPhone?: string;
      projectName?: string;
      design?: ProposalDesign | null;
      status?: string;
    };

    const persistBlocks = (body.contentBlocks ?? []).map((b) => ({
      ...b,
      imageUrl: undefined,
    }));

    const { data, error } = await supabase
      .from("proposals")
      .insert({
        user_id: user.id,
        project_id: body.projectId,
        title: body.title,
        client_name: body.clientName ?? null,
        scope: body.scope ?? null,
        terms: body.terms ?? null,
        valid_until: body.validUntil ?? null,
        line_items: body.lineItems,
        content_blocks: persistBlocks,
        company_name: body.companyName ?? null,
        company_email: body.companyEmail ?? null,
        company_phone: body.companyPhone ?? null,
        project_name: body.projectName ?? null,
        design: body.design ?? null,
        status: body.status ?? "draft",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to save proposal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
