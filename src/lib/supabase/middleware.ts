import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createSupabaseMiddlewareClient(
  req: NextRequest,
  res: NextResponse,
) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () =>
        req.cookies.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        })),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Use (name, value, opts) overload — avoids fragile object-union typing on `set`.
          res.cookies.set(name, value, options ?? {});
        });
      },
    },
  });
}

