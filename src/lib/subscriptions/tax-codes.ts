import type { TaxCategory } from "@/lib/types/database";

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  repair:       "Repair & Maintenance",
  landscaping:  "Landscaping",
  construction: "Construction",
  materials:    "Materials & Supplies",
  other:        "Other (Fixed Amount)",
};

// Stripe product tax codes — https://stripe.com/docs/tax/tax-codes
// "other" uses a fixed TaxRate instead of a tax_code, so it's omitted here.
export const TAX_CODE_MAP: Partial<Record<TaxCategory, string>> = {
  repair:       "txcd_30060006", // Repair / maintenance services
  landscaping:  "txcd_30060006", // General services (closest match)
  construction: "txcd_30060001", // Construction services
  materials:    "txcd_91050007", // Tangible personal property (supplies)
};
