import type { ReactNode } from "react";

import { LanguageProvider } from "@/lib/i18n/client";
import { getServerLang } from "@/lib/i18n/server";

// Auth pages use the browser Supabase client; avoid static prerender during `next build`
// when CI/Vercel env wiring can differ from runtime.
export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const lang = await getServerLang();
  return <LanguageProvider initialLang={lang}>{children}</LanguageProvider>;
}
