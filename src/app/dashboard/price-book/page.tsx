import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PriceBookClient } from "@/components/price-book/price-book-client";
import type { PriceBookItem } from "@/lib/types/database";

export default async function PriceBookPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("price_book")
    .select("*")
    .eq("user_id", user.id)
    .order("item_name");

  const items = (data ?? []) as PriceBookItem[];

  return <PriceBookClient initialItems={items} />;
}
