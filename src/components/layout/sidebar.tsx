"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  MessageSquare,
  Boxes,
  Users,
  UserPlus2,
  Palette,
  Settings as SettingsIcon,
  CreditCard,
  HelpCircle,
  CalendarDays,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
} from "lucide-react";
import { isPremiumTeam } from "@/lib/billing/access";

import { useLanguage } from "@/lib/i18n/client";
import { HelpModal } from "@/components/help/help-modal";

type Props = {
  userName?: string;
  userEmail?: string;
  subscriptionPlan?: string | null;
};

export function Sidebar({ userName, userEmail, subscriptionPlan }: Props) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  const showTeam = isPremiumTeam({ subscription_plan: subscriptionPlan });

  const primaryNav = [
    { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/dashboard/projects", label: t.nav.projects, icon: FolderKanban },
    { href: "/dashboard/invoices", label: t.nav.invoices, icon: FileText },
    { href: "/dashboard/proposals", label: t.nav.proposals, icon: ClipboardList },
    { href: "/dashboard/calendar", label: t.nav.calendar, icon: CalendarDays },
    { href: "/dashboard/price-book", label: t.nav.priceBook, icon: Boxes },
    { href: "/dashboard/clients", label: t.nav.clients, icon: Users },
    { href: "/dashboard/subscriptions", label: "Subscriptions", icon: RefreshCcw },
    ...(showTeam ? [{ href: "/dashboard/team", label: "Team", icon: UserPlus2 }] : []),
  ];

  const secondaryNav = [
    { href: "/dashboard/invoice-design", label: t.nav.invoiceDesign, icon: Palette },
    { href: "/dashboard/messages", label: t.nav.messages, icon: MessageSquare },
    { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    { href: "/dashboard/settings", label: t.nav.settings, icon: SettingsIcon },
  ];

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
    const active = isActive(href);
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          active
            ? "bg-slate-100 text-slate-900 font-medium dark:bg-slate-800 dark:text-white"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        } ${collapsed ? "justify-center" : ""}`}
      >
        <Icon className="h-4 w-4 flex-shrink-0 opacity-80" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  }

  return (
    <aside
      className={`hidden md:flex md:flex-col md:shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 sticky top-0 h-screen transition-all duration-200 ${
        collapsed ? "md:w-[60px]" : "md:w-64"
      }`}
    >
      {/* Toggle collapse button */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      <div className="flex flex-col h-full overflow-y-auto p-3">
        {/* Logo + brand */}
        <div className={`flex items-center gap-2 mb-5 px-1 ${collapsed ? "justify-center" : ""}`}>
          <Image src="/logo.png" alt="WorkSupp" width={36} height={36} className="object-contain flex-shrink-0" />
          {!collapsed && (
            <span className="text-base font-semibold text-primary dark:text-white truncate">{t.nav.brand}</span>
          )}
        </div>

        {/* Primary nav */}
        <nav className="flex flex-col gap-0.5">
          {primaryNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        {/* Divider */}
        <div className="my-3 border-t border-slate-100 dark:border-slate-800" />

        {/* Secondary nav */}
        <nav className="flex flex-col gap-0.5">
          {secondaryNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        {/* Spacer pushes Help to bottom */}
        <div className="flex-1" />

        {/* Help */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-2 mt-2">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title={collapsed ? "Help" : undefined}
            className={`flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <HelpCircle className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Help</span>}
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
