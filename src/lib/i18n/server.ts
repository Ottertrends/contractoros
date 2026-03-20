import { cookies } from "next/headers";

import type { Lang } from "./translations";

/** Read the language preference from the `lang` cookie (server components). */
export async function getServerLang(): Promise<Lang> {
  const store = await cookies();
  const val = store.get("lang")?.value;
  return val === "es" ? "es" : "en";
}
