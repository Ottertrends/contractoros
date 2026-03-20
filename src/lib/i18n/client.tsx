"use client";

import * as React from "react";

import { getT, type Lang, type Translations } from "./translations";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
}

const LanguageContext = React.createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: getT("en"),
});

export function LanguageProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang: Lang;
}) {
  const [lang, setLangState] = React.useState<Lang>(initialLang);

  function setLang(next: Lang) {
    setLangState(next);
    // Persist in cookie so server components pick it up on next request
    document.cookie = `lang=${next};path=/;max-age=31536000;SameSite=Lax`;
  }

  const t = React.useMemo(() => getT(lang), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Use inside any client component to access translations and the toggle. */
export function useLanguage(): LanguageContextValue {
  return React.useContext(LanguageContext);
}
