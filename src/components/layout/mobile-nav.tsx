"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  const { t } = useLanguage();
  const pathname = usePathname();

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
    { href: "/dashboard/price-book", label: t.nav.priceBook, icon: Boxes },
    { href: "/dashboard/clients", label: t.nav.clients, icon: Users },
    { href: "/dashboard/invoice-design", label: t.nav.invoiceDesign, icon: Palette },
    { href: "/dashboard/messages", label: t.nav.messages, icon: MessageSquare },
    { href: "/dashboard/settings", label: t.nav.settings, icon: SettingsIcon },
  ];

  // Rendered via portal directly into document.body so it escapes
  // the TopBar's backdrop-filter stacking context (iOS Safari fix)
  const overlay = (
    <>
      {/* Full-screen opaque backdrop */}
      <div
        className={`fixed inset-0 md:hidden transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ zIndex: 9998, backgroundColor: "rgba(0,0,0,0.65)" }}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-in drawer — solid, no transparency */}
      <div
        className={`fixed inset-y-0 left-0 md:hidden flex flex-col transform transition-transform duration-200 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          zIndex: 9999,
          width: "320px",
          backgroundColor: "#ffffff",
          borderRight: "1px solid #e2e8f0",
          boxShadow: "4px 0 24px 0 rgba(0,0,0,0.18)",
        }}
      >
        {/* Header */}
        <div
          style={{ backgroundColor: "#ffffff", borderBottom: "1px solid #e2e8f0" }}
          className="flex items-center justify-between px-5 py-4 shrink-0"
        >
          <div className="text-xl font-bold text-primary">
            {t.nav.brand}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="flex items-center justify-center h-9 w-9 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav
          className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto"
          style={{ backgroundColor: "#ffffff" }}
        >
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
                    ? "text-primary"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                style={isActive ? { backgroundColor: "rgba(var(--primary-rgb, 59,130,246),0.1)" } : {}}
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

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="md:hidden flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Portal: renders directly in document.body, outside all stacking contexts */}
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
