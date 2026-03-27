"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";

import { useLanguage } from "@/lib/i18n/client";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const pathname = usePathname();

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
    { href: "/dashboard/price-book", label: t.nav.priceBook, icon: Boxes },
    { href: "/dashboard/clients", label: t.nav.clients, icon: Users },
    { href: "/dashboard/invoice-design", label: t.nav.invoiceDesign, icon: Palette },
    { href: "/dashboard/messages", label: t.nav.messages, icon: MessageSquare },
    { href: "/dashboard/settings", label: t.nav.settings, icon: SettingsIcon },
  ];

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="md:hidden flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[998] bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-[999] w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shadow-2xl transform transition-transform duration-200 ease-in-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="text-xl font-bold text-primary dark:text-white">
            {t.nav.brand}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="flex items-center justify-center h-9 w-9 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-4 bg-white dark:bg-slate-900 h-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
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
      </div>
    </>
  );
}
