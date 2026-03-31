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

    const body = (await request.json()) as {
      projectId: string;
      mode?: "strict" | "custom";
      customInstructions?: string;
    };
    const { projectId, mode = "strict", customInstructions } = body;
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

    // Fetch media
    const { data: media } = await admin
      .from("project_media")
      .select("file_name, media_type, created_at")
      .eq("project_id", projectId)
      .limit(50);

    // Fetch invoices for this project
    const { data: invoices } = await admin
      .from("invoices")
      .select("id, invoice_number, total, status, notes, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5);

    // Fetch invoice line items for this project's invoices
    const invoiceIds = (invoices ?? []).map((inv) => inv.id).filter(Boolean);
    let lineItemsText = "No line item detail available.";
    if (invoiceIds.length > 0) {
      const { data: lineItems } = await admin
        .from("invoice_line_items")
        .select("description, quantity, unit_price, total")
        .in("invoice_id", invoiceIds)
        .limit(30);
      if (lineItems?.length) {
        lineItemsText = lineItems
          .map((li) => `  - ${li.description ?? "Item"}: qty=${li.quantity}, unit=$${li.unit_price}, total=$${li.total}`)
          .join("\n");
      }
    }

    // Fetch profile for company info + invoice design
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, company_name, email, phone, invoice_primary_color, invoice_logo_url, invoice_title_font, invoice_body_font, invoice_footer")
      .eq("id", user.id)
      .single();

    const notesText = notes?.length
      ? notes.map((n) => `- ${n.content}`).join("\n")
      : "(no notes recorded)";

    const invoicesText = invoices?.length
      ? invoices
          .map((inv) => `Invoice #${inv.invoice_number ?? "draft"}: total=$${inv.total}, status=${inv.status}${inv.notes ? `, notes: ${inv.notes}` : ""}`)
          .join("\n")
      : "(no prior invoices for this project)";

    const mediaText = media?.length
      ? `${media.length} file(s): ${media.map((m) => m.file_name ?? m.media_type ?? "file").join(", ")}`
      : "(no media attached)";

    const today = new Date();
    const validUntilDate = new Date(today);
    validUntilDate.setDate(today.getDate() + 30);

    const proj = project as Record<string, unknown>;

    let modeBlock: string;
    if (mode === "strict") {
      modeBlock = `STRICT MODE — ABSOLUTE RULES:
1. You MUST NOT invent, guess, or estimate ANY line item, price, quantity, or description that is not explicitly present in the data above.
2. If no line items or prices are recorded in the notes or invoice line items, output an EMPTY lineItems array [].
3. Do NOT use "typical contractor rates" or any external knowledge to fill in prices.
4. Use ONLY text from the project notes and invoice line items above to populate line items.
5. The scope paragraph must be based exclusively on the project description and notes — do not add anything not mentioned.
6. If terms are not mentioned in the notes, output an empty string "" for terms.
7. Every field you populate must be directly traceable to the data provided above.`;
    } else {
      modeBlock = `CUSTOM MODE — Use the following contractor-provided instructions to shape this document. You may use these instructions to fill in terms, scope language, and any details the contractor specifies. Do NOT invent prices or line items not mentioned in the project data or custom instructions below.

Custom instructions:
${customInstructions?.trim() ?? "(none provided)"}`;
    }

    const prompt = `You are building a contractor quote document from REAL project data stored in a database. Your job is to format this data into a structured JSON — not to write a proposal from scratch.

=== PROJECT DATA ===
Company: ${profile?.company_name ?? "Contractor"}
Contractor: ${profile?.full_name ?? ""}
Project name: ${proj.name ?? "Untitled"}
Client: ${proj.client_name ?? "Client"}
Description: ${proj.description ?? "(no description)"}
Status: ${proj.status ?? "active"}
Location: ${[proj.city, proj.state].filter(Boolean).join(", ") || ((proj.location as string | null) ?? "(none)")}

Project notes (recorded by contractor):
${notesText}

Invoice line items (exactly as stored in DB):
${lineItemsText}

Invoice summaries:
${invoicesText}

Attached files: ${mediaText}

Today: ${today.toLocaleDateString("en-US")}
Valid until: ${validUntilDate.toLocaleDateString("en-US")}
=== END PROJECT DATA ===

${modeBlock}

Return ONLY valid JSON with exactly these fields, no markdown, no explanation:
{
  "title": "short title based on project name",
  "clientName": "client name from data, or 'Valued Client' if not recorded",
  "scope": "paragraph based only on the description and notes",
  "lineItems": [{"description": "exactly as in DB", "qty": 1, "unitPrice": 0}],
  "terms": "from notes/instructions only, empty string if none",
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
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      proposal = JSON.parse(cleaned) as ProposalData;
    } catch {
      return NextResponse.json({ error: "Claude returned invalid JSON", raw: text.slice(0, 500) }, { status: 500 });
    }

    const profileData = profile as Record<string, unknown> | null;

    return NextResponse.json({
      proposal,
      projectName: project.name,
      companyName: profile?.company_name ?? "",
      companyEmail: profile?.email ?? "",
      companyPhone: profile?.phone ?? "",
      clientName: proj.client_name ?? null,
      design: {
        primaryColor: profileData?.invoice_primary_color ?? null,
        logoUrl: profileData?.invoice_logo_url ?? null,
        titleFont: profileData?.invoice_title_font ?? null,
        bodyFont: profileData?.invoice_body_font ?? null,
        footer: profileData?.invoice_footer ?? null,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to generate proposal";
    console.error("[proposals/generate] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
