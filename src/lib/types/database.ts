export type QuotesPerMonth = "1-5" | "6-15" | "16-30" | "30+";

export type ProjectStatus = "active" | "completed" | "on_hold" | "cancelled";
export type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled";
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
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  total: string;
  sort_order: number;
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

export interface Database {
  public: {
    profiles: Profile;
    projects: Project;
    invoices: Invoice;
    invoice_items: InvoiceItem;
    price_book: PriceBookItem;
    messages: MessageLog;
  };
}

