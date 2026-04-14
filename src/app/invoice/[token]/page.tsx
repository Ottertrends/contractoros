import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

function fmt(n: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n ?? 0),
  );
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-600" },
  open: { label: "Open", color: "bg-blue-100 text-blue-700" },
  sent: { label: "Sent", color: "bg-yellow-100 text-yellow-700" },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-700" },
  void: { label: "Void", color: "bg-slate-100 text-slate-500" },
  uncollectible: { label: "Uncollectible", color: "bg-red-100 text-red-600" },
};

export default async function SharedInvoicePage({ params }: Props) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  // Fetch invoice by share token
  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("share_token", token)
    .single();

  if (!invoice) notFound();

  // Fetch invoice items
  const { data: items } = await admin
    .from("invoice_items")
    .select("description, quantity, unit_price, total, tax_rate")
    .eq("invoice_id", invoice.id)
    .order("created_at", { ascending: true });

  // Fetch project for client name
  const { data: project } = await admin
    .from("projects")
    .select("name, client_name, client_email")
    .eq("id", invoice.project_id)
    .single();

  // Fetch profile for company info
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, company_name, email, phone")
    .eq("id", invoice.user_id)
    .single();

  const statusInfo = STATUS_LABELS[invoice.status as string] ?? { label: invoice.status as string, color: "bg-slate-100 text-slate-600" };
  const paymentUrl = (invoice.stripe_hosted_url as string | null) ?? (invoice.stripe_payment_link_url as string | null);
  const invoiceNumber = (invoice.stripe_invoice_number as string | null) ?? (invoice.invoice_number as string | null) ?? "—";
  const invoiceDate = invoice.date ? new Date(invoice.date as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-8 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="WorkSupp" width={36} height={36} className="object-contain" />
            <div>
              <p className="font-semibold text-slate-900 text-sm">{profile?.company_name ?? profile?.full_name ?? "WorkSupp"}</p>
              {profile?.email && <p className="text-xs text-slate-500">{profile.email}</p>}
              {profile?.phone && <p className="text-xs text-slate-500">{profile.phone}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">Invoice</p>
            <p className="text-sm text-slate-500 mt-0.5">#{invoiceNumber}</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 mt-2 rounded-full text-xs font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* Bill To + Date */}
        <div className="grid grid-cols-2 gap-6 px-8 py-6 border-b border-slate-100">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Bill To</p>
            <p className="text-sm font-semibold text-slate-900">{project?.client_name ?? "Client"}</p>
            {project?.client_email && <p className="text-xs text-slate-500">{project.client_email}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Invoice Date</p>
            <p className="text-sm text-slate-900">{invoiceDate}</p>
            {project?.name && (
              <>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1 mt-3">Project</p>
                <p className="text-sm text-slate-900">{project.name}</p>
              </>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div className="px-8 py-6 border-b border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left pb-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Description</th>
                <th className="text-right pb-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Qty</th>
                <th className="text-right pb-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Unit Price</th>
                <th className="text-right pb-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 text-slate-800 pr-4">{item.description}</td>
                  <td className="py-2.5 text-right text-slate-600">{item.quantity}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmt(item.unit_price)}</td>
                  <td className="py-2.5 text-right font-medium text-slate-900">{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-8 py-6 border-b border-slate-100">
          <div className="flex flex-col gap-1.5 max-w-xs ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-900">{fmt(invoice.subtotal as string)}</span>
            </div>
            {Number(invoice.tax_amount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Tax ({invoice.tax_rate as string}%)</span>
                <span className="text-slate-900">{fmt(invoice.tax_amount as string)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
              <span className="text-slate-900">Total</span>
              <span className="text-slate-900">{fmt(invoice.total as string)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="px-8 py-5 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{invoice.notes as string}</p>
          </div>
        )}

        {/* Pay Now CTA */}
        {paymentUrl && invoice.status !== "paid" && invoice.status !== "void" && (
          <div className="px-8 py-6 flex justify-center">
            <a
              href={paymentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm"
            >
              Pay Now
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Powered by WorkSupp</p>
        </div>
      </div>
    </div>
  );
}
