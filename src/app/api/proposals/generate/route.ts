import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/agent/model";

export interface ProposalLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface ProposalData {
  title: string;
  clientName: string;
  scope: string;
  lineItems: ProposalLineItem[];
  terms: string;
  validUntil: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = (await request.json()) as { projectId: string };
    if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

    const admin = createSupabaseAdminClient();

    // Fetch project
    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    // Fetch notes
    const { data: notes } = await admin
      .from("project_notes")
      .select("content, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch media (just count + names, not full URLs)
    const { data: media } = await admin
      .from("project_media")
      .select("file_name, media_type, created_at")
      .eq("project_id", projectId)
      .limit(50);

    // Fetch invoices for this project
    const { data: invoices } = await admin
      .from("invoices")
      .select("invoice_number, total, status, notes, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5);

    // Fetch profile for company info
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, company_name, email, phone")
      .eq("id", user.id)
      .single();

    // Build context for Claude
    const notesText = notes?.length
      ? notes.map((n) => `- ${n.content}`).join("\n")
      : "No notes recorded.";

    const invoicesText = invoices?.length
      ? invoices
          .map((inv) => `Invoice #${inv.invoice_number ?? "draft"}: $${inv.total} (${inv.status})`)
          .join("\n")
      : "No prior invoices for this project.";

    const mediaText = media?.length
      ? `${media.length} files (${media.map((m) => m.media_type ?? "file").join(", ")})`
      : "No media attached.";

    const today = new Date();
    const validUntilDate = new Date(today);
    validUntilDate.setDate(today.getDate() + 30);

    const prompt = `You are generating a professional contractor proposal/quote document.

Company: ${profile?.company_name ?? "Contractor"}
Contractor: ${profile?.full_name ?? ""}

Project name: ${project.name ?? "Untitled"}
Client: ${(project as Record<string, unknown>).client_name ?? "Client"}
Description: ${project.description ?? "No description"}
Status: ${project.status ?? "active"}
Location: ${[(project as Record<string, unknown>).city, (project as Record<string, unknown>).state].filter(Boolean).join(", ") || ((project as Record<string, unknown>).location ?? "")}

Project notes:
${notesText}

Prior invoices / billing history:
${invoicesText}

Attached media: ${mediaText}

Today: ${today.toLocaleDateString("en-US")}
Valid until: ${validUntilDate.toLocaleDateString("en-US")}

Generate a professional proposal JSON. Use the notes and project description to infer realistic line items with quantities and unit prices. If no specific prices are mentioned, use typical contractor market rates.

Return ONLY valid JSON, no markdown, no explanation:
{
  "title": "Proposal title (e.g. 'Bathroom Remodel Proposal')",
  "clientName": "Client name or 'Valued Client' if unknown",
  "scope": "2-4 sentence paragraph describing the full scope of work",
  "lineItems": [
    {"description": "...", "qty": 1, "unitPrice": 0}
  ],
  "terms": "1-2 sentence payment terms and warranty",
  "validUntil": "${validUntilDate.toLocaleDateString("en-US")}"
}`;

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let proposal: ProposalData;
    try {
      // Strip potential markdown code fences
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      proposal = JSON.parse(cleaned) as ProposalData;
    } catch {
      return NextResponse.json({ error: "Claude returned invalid JSON", raw: text.slice(0, 500) }, { status: 500 });
    }

    return NextResponse.json({
      proposal,
      projectName: project.name,
      companyName: profile?.company_name ?? "",
      companyEmail: profile?.email ?? "",
      companyPhone: profile?.phone ?? "",
      clientName: (project as Record<string, unknown>).client_name ?? null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to generate proposal";
    console.error("[proposals/generate] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
