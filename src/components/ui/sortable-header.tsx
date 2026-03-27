import Link from "next/link";

interface SortableHeaderProps {
  label: string;
  field: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  buildHref: (field: string, dir: "asc" | "desc") => string;
  right?: boolean;
}

export function SortableHeader({ label, field, sortBy, sortDir, buildHref, right }: SortableHeaderProps) {
  const isActive = sortBy === field;
  const nextDir = isActive && sortDir === "asc" ? "desc" : "asc";
  return (
    <th className={`pb-3 pr-4 whitespace-nowrap ${right ? "text-right" : ""}`}>
      <Link
        href={buildHref(field, nextDir)}
        className={`inline-flex items-center gap-1 text-xs uppercase font-medium transition-colors hover:text-slate-700 dark:hover:text-slate-300 ${
          isActive
            ? "text-slate-700 dark:text-slate-300"
            : "text-slate-400 dark:text-slate-500"
        }`}
      >
        {label}
        <span className="text-[10px] leading-none">
          {isActive ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </Link>
    </th>
  );
}
