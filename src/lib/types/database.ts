export type QuotesPerMonth = "1-5" | "6-15" | "16-30" | "30+";
export type MediaType = "image" | "video";

export type ProjectStatus = "active" | "completed" | "on_hold" | "cancelled";
export type InvoiceStatus = "draft" | "open" | "sent" | "paid" | "void" | "uncollectible";
export type MessageDirection = "inbound" | "outbound";
export type MessageType = "text" | "image" | "document";

export interface Profile {
  id: string;
  full_name: string;
  company_name: string;
  email: string;
  phone: string;
  quotes_per_month: QuotesPerMonth | null;
  business_areas: string[] | null;
  services: string[] | null;
  whatsapp_connected: boolean;
  whatsapp_instance_id: string | null;
  whatsapp_secondary_connected: boolean;
  whatsapp_secondary_instance_id: string | null;
  invoice_logo_url: string | null;
  invoice_primary_color: string | null;
  invoice_title_font: string | null;
  invoice_body_font: string | null;
  invoice_footer: string | null;
  stripe_connect_account_id?: string | null;
  stripe_connect_charges_enabled?: boolean | null;
  stripe_connect_details_submitted?: boolean | null;
  default_alternate_payment_instructions?: string | null;
  default_zelle_info?: string | null;
  default_venmo_handle?: string | null;
  zip_code?: string | null;
  onboarding_completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  user_id: string;
  client_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type InvoiceFont = "helvetica" | "times" | "courier";

export interface InvoiceDesign {
  logoUrl: string | null;
  primaryColor: string;
  titleFont: InvoiceFont;
  bodyFont: InvoiceFont;
  footer: string | null;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
  client_email?: string | null;
  location: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: ProjectStatus;
  notes: string | null;
  current_work: string | null;
  quoted_amount: string | null; // NUMERIC comes back as string via PostgREST
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  project_id: string;
  user_id: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
  notes: string | null;
  /** Invoice date (ISO date string, e.g. "2026-03-20") */
  date: string | null;
  stripe_payment_link_url?: string | null;
  stripe_payment_link_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_invoice_number?: string | null;
  stripe_hosted_url?: string | null;
  automatic_tax_enabled?: boolean | null;
  open_edit_count?: number | null;
  alternate_payment_instructions?: string | null;
  pay_with_ach_enabled?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  /** Product / service name */
  name: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  total: string;
  tax_rate?: string | null; // NUMERIC(5,2) → string via PostgREST; per-line tax percent
  sort_order: number;
  created_at: string;
}

export interface TaxRate {
  id: string;
  user_id: string;
  name: string;
  rate: string; // NUMERIC(5,2) → string via PostgREST; percentage e.g. "8.75"
  stripe_tax_rate_id?: string | null;
  created_at: string;
}

export interface PriceBookItem {
  id: string;
  user_id: string;
  item_name: string;
  description: string | null;
  unit: string | null;
  unit_price: string;
  supplier: string | null;
  category: string | null;
  last_updated: string;
  created_at: string;
}

export interface MessageLog {
  id: string;
  user_id: string;
  project_id: string | null;
  direction: MessageDirection;
  content: string;
  message_type: MessageType;
  whatsapp_message_id: string | null;
  processed: boolean;
  created_at: string;
}

export interface ProjectMedia {
  id: string;
  user_id: string;
  project_id: string | null;
  storage_path: string;
  media_type: MediaType;
  mime_type: string | null;
  description: string | null;
  whatsapp_message_id: string | null;
  file_size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export type SubscriptionInterval = "week" | "month";
export type SubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "canceled";
export type TaxCategory = "repair" | "landscaping" | "construction" | "materials" | "other";

export interface ServicePlan {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  amount: string; // NUMERIC → string via PostgREST
  interval: SubscriptionInterval;
  setup_fee: string;
  trial_period_days: number;
  tax_category: TaxCategory | null;
  custom_tax_amount: string | null; // Fixed dollar tax (when tax_category === "other")
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_checkout_url: string | null;
  created_at: string;
}

export interface ClientSubscription {
  id: string;
  user_id: string;
  project_id: string | null;
  service_plan_id: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_customer_email: string | null;
  stripe_customer_name: string | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    profiles: Profile;
    projects: Project;
    invoices: Invoice;
    invoice_items: InvoiceItem;
    price_book: PriceBookItem;
    messages: MessageLog;
    project_media: ProjectMedia;
  };
}

