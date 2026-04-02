import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { ContentBlock, ProposalLineItem, ProposalDesign } from "@/lib/types/proposals";
import { SharedProposalView } from "./shared-view";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharedProposalPage({ params }: Props) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: proposal } = await admin
    .from("proposals")
    .select("*")
    .eq("share_token", token)
    .single();

  if (!proposal) notFound();

  const blocks = (proposal.content_blocks ?? []) as ContentBlock[];
  for (const block of blocks) {
    if (block.type === "image" && block.storagePath) {
      const { data: urlData } = await admin.storage
        .from("project-media")
        .createSignedUrl(block.storagePath, 3600);
      if (urlData?.signedUrl) block.imageUrl = urlData.signedUrl;
    }
  }

  return (
    <SharedProposalView
      proposal={{
        title: proposal.title as string,
        clientName: (proposal.client_name as string) ?? "Client",
        scope: (proposal.scope as string) ?? "",
        lineItems: (proposal.line_items ?? []) as ProposalLineItem[],
        terms: (proposal.terms as string) ?? "",
        validUntil: (proposal.valid_until as string) ?? "",
      }}
      companyName={(proposal.company_name as string) ?? ""}
      companyEmail={(proposal.company_email as string) ?? ""}
      companyPhone={(proposal.company_phone as string) ?? ""}
      projectName={(proposal.project_name as string) ?? ""}
      design={(proposal.design as ProposalDesign) ?? null}
      contentBlocks={blocks.filter((b) => b.included)}
    />
  );
}
