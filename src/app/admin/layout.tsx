import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <nav className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-slate-900 dark:text-white text-sm mr-2">Admin</span>
        {[
          { href: "/admin/users", label: "Users" },
          { href: "/admin/subscribers", label: "Subscribers" },
          { href: "/admin/messages", label: "Messages" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
