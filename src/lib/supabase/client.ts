"use client";

import { createBrowserClient } from "@supabase/ssr";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let browserClient: BrowserClient | undefined;

function getBrowserClient(): BrowserClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them in Vercel → Project → Settings → Environment Variables (required at build time for NEXT_PUBLIC_*).",
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}

/**
 * Lazy Supabase browser client. Do not call `createBrowserClient` at module load —
 * Next.js prerenders `/auth/*` during `next build`, and env vars may not be applied
 * until the client runs; deferring avoids prerender crashes on Vercel.
 */
export const supabase = new Proxy({} as BrowserClient, {
  get(_target, prop, receiver) {
    const client = getBrowserClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
