import type { ReactNode } from "react";

// Auth pages use the browser Supabase client; avoid static prerender during `next build`
// when CI/Vercel env wiring can differ from runtime.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
