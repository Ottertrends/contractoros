import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { proposalId, recipientEmail, shareUrl } = (await request.json()) as {
      proposalId: string;
      recipientEmail: string;
      shareUrl: string;
    };
    if (!proposalId || !recipientEmail)
      return NextResponse.json({ error: "proposalId and recipientEmail required" }, { status: 400 });

    const { data: proposal } = await supabase
      .from("proposals")
      .select("title, client_name, company_name")
      .eq("id", proposalId)
      .eq("user_id", user.id)
      .single();

    if (!proposal)
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    const resendKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || "noreply@contractoros.com";
    if (!resendKey) {
      return NextResponse.json(
        { error: "Email service not configured (RESEND_API_KEY missing)" },
        { status: 500 },
      );
    }

    const companyName = proposal.company_name || "Your contractor";
    const clientName = proposal.client_name || "Valued Client";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipientEmail,
        subject: `Quote: ${proposal.title}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
            <h2 style="color: #1e293b;">Quote from ${companyName}</h2>
            <p>Hi ${clientName},</p>
            <p>${companyName} has prepared a quote for you: <strong>${proposal.title}</strong></p>
            <p>
              <a href="${shareUrl}" style="display: inline-block; background: #1e293b; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                View Quote
              </a>
            </p>
            <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
              This link will show you the full quote with all details. You can download it as a PDF from there.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      return NextResponse.json(
        { error: (errData as Record<string, string> | null)?.message ?? "Email send failed" },
        { status: 500 },
      );
    }

    await supabase
      .from("proposals")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", proposalId)
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to send email";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
