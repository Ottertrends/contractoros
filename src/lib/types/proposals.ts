export interface ProposalLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface ContentBlock {
  type: "note" | "image";
  content: string;
  imageUrl?: string;
  storagePath?: string;
  description?: string | null;
  mediaId?: string;
  mediaType?: string;
  createdAt: string;
  included: boolean;
}

export interface ProposalData {
  title: string;
  clientName: string;
  scope: string;
  lineItems: ProposalLineItem[];
  terms: string;
  validUntil: string;
}

export interface ProposalDesign {
  primaryColor?: string | null;
  logoUrl?: string | null;
  titleFont?: string | null;
  bodyFont?: string | null;
  footer?: string | null;
}

export interface SavedProposal {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  client_name: string | null;
  scope: string | null;
  terms: string | null;
  valid_until: string | null;
  line_items: ProposalLineItem[];
  content_blocks: ContentBlock[];
  status: ProposalStatus;
  company_name: string | null;
  company_email: string | null;
  company_phone: string | null;
  project_name: string | null;
  design: ProposalDesign | null;
  share_token: string | null;
  pdf_storage_path: string | null;
  created_at: string;
  updated_at: string;
}

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected";

export interface ProposalTemplate {
  id: string;
  user_id: string;
  name: string;
  scope_template: string | null;
  terms_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateResult {
  proposal: ProposalData;
  projectName: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  design: ProposalDesign | null;
  contentBlocks: ContentBlock[];
}

export function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
