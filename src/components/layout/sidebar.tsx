import Link from "next/link";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Boxes,
  BarChart3,
  Settings as SettingsIcon,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/price-book", label: "Price Book", icon: Boxes },
  { href: "/dashboard/stats", label: "Stats", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  return (
    <aside className="hidden md:block md:w-64 md:shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="p-4">
        <div className="text-lg font-semibold text-primary mb-6">
          ContractorOS
        </div>
        <nav className="flex flex-col gap-1">
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
      </div>
    </aside>
  );
}

