"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  FolderKanban,
  FileText,
  MessageSquare,
  Boxes,
  Users,
  Palette,
  Settings as SettingsIcon,
  CreditCard,
  HelpCircle,
  CalendarDays,
  ClipboardList,
  Languages,
} from "lucide-react";

import Image from "next/image";
import { useLanguage } from "@/lib/i18n/client";
import { HelpModal } from "@/components/help/help-modal";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type Props = {
  userName?: string;
  userEmail?: string;
};

export function MobileNav({ userName, userEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { t, lang, setLang } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();

  function toggleLang() {
    setLang(lang === "en" ? "es" : "en");
    router.refresh();
  }

  // Mount guard for createPortal (SSR-safe)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const navItems = [
    { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/dashboard/projects", label: t.nav.projects, icon: FolderKanban },
    { href: "/dashboard/invoices", label: t.nav.invoices, icon: FileText },
    { href: "/dashboard/proposals", label: t.nav.proposals, icon: ClipboardList },
    { href: "/dashboard/calendar", label: t.nav.calendar, icon: CalendarDays },
    { href: "/dashboard/price-book", label: t.nav.priceBook, icon: Boxes },
    { href: "/dashboard/clients", label: t.nav.clients, icon: Users },
    { href: "/dashboard/invoice-design", label: t.nav.invoiceDesign, icon: Palette },
    { href: "/dashboard/messages", label: t.nav.messages, icon: MessageSquare },
    { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    { href: "/dashboard/settings", label: t.nav.settings, icon: SettingsIcon },
  ];

  const overlay = (
    <>
      <div
        className={`fixed inset-0 md:hidden transition-opacity duration-200 bg-black/65 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ zIndex: 9998 }}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        className={`fixed inset-y-0 left-0 md:hidden flex flex-col w-80 transform transition-transform duration-200 ease-in-out bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 shadow-2xl ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ zIndex: 9999 }}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="WorkSupp" width={48} height={48} className="object-contain" />
            <span className="text-xl font-bold text-primary dark:text-white">{t.nav.brand}</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="flex items-center justify-center h-9 w-9 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto bg-white dark:bg-slate-950">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-base font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 dark:bg-primary/20 text-primary dark:text-white"
                    : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Theme + Language toggles */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-5 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Appearance</span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={toggleLang}
              className="text-xs font-semibold px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
              title="Toggle language"
            >
              <span className="flex items-center gap-1">
                <Languages className="h-3.5 w-3.5" />
                {lang === "en" ? "ES" : "EN"}
              </span>
            </button>
          </div>
        </div>

        {/* Help button at the bottom of the drawer */}
        <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <button
            type="button"
            onClick={() => { setOpen(false); setHelpOpen(true); }}
            className="flex items-center gap-4 px-4 py-3.5 w-full rounded-xl text-base font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <HelpCircle className="h-5 w-5 shrink-0" />
            <span>Help</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="md:hidden flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Menu className="h-4 w-4" />
      </button>

      {mounted && createPortal(overlay, document.body)}

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        userName={userName}
        userEmail={userEmail}
      />
    </>
  );
}
