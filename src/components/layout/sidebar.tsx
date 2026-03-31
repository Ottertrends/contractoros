"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
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
} from "lucide-react";

import { useLanguage } from "@/lib/i18n/client";
import { HelpModal } from "@/components/help/help-modal";

type Props = {
  userName?: string;
  userEmail?: string;
};

export function Sidebar({ userName, userEmail }: Props) {
  const { t } = useLanguage();
  const [helpOpen, setHelpOpen] = React.useState(false);

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

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 min-h-screen">
      <div className="flex flex-col flex-1 p-4">
        <div className="flex items-center gap-2 mb-6">
          <Image src="/logo.png" alt="WorkSupp" width={42} height={42} className="object-contain" />
          <span className="text-lg font-semibold text-primary dark:text-white">{t.nav.brand}</span>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <Icon className="h-4 w-4 opacity-80" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Help button at the bottom */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Help</span>
          </button>
        </div>
      </div>

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        userName={userName}
        userEmail={userEmail}
      />
    </aside>
  );
}
