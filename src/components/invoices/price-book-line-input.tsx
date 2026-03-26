"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import type { PriceBookItem } from "@/lib/types/database";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: PriceBookItem) => void;
  priceBook: PriceBookItem[];
  placeholder?: string;
}

function fmt(n: string | number) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    isNaN(num) ? 0 : num,
  );
}

export function PriceBookLineInput({ value, onChange, onSelect, priceBook, placeholder }: Props) {
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Show top 8 when empty, filter when typing
  const filtered = React.useMemo(() => {
    const base = value.trim()
      ? priceBook.filter(
          (pb) =>
            pb.item_name.toLowerCase().includes(value.toLowerCase()) ||
            (pb.category ?? "").toLowerCase().includes(value.toLowerCase()),
        )
      : priceBook;
    return base.slice(0, 10);
  }, [value, priceBook]);

  const showDropdown = open && filtered.length > 0;

  // Close when clicking outside
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        onSelect(filtered[highlighted]);
        setOpen(false);
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => {
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Product or service name"}
        className="text-sm"
        autoComplete="off"
      />

      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg overflow-hidden">
          {filtered.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
                onChange(item.item_name);
                setOpen(false);
              }}
              onMouseEnter={() => setHighlighted(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 ${
                idx === highlighted
                  ? "bg-primary/8 dark:bg-primary/15"
                  : "hover:bg-slate-50 dark:hover:bg-slate-900"
              }`}
            >
              {/* Left: name + category */}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-medium truncate ${
                    idx === highlighted
                      ? "text-primary"
                      : "text-slate-900 dark:text-slate-50"
                  }`}
                >
                  {item.item_name}
                </div>
                {item.category && (
                  <div className="text-xs text-slate-400 mt-0.5">{item.category}</div>
                )}
              </div>

              {/* Right: unit + price */}
              <div className="shrink-0 text-right">
                {item.unit && (
                  <div className="text-xs text-slate-400">per {item.unit}</div>
                )}
                <div className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {fmt(item.unit_price)}
                </div>
              </div>
            </button>
          ))}

          {priceBook.length > 10 && value.trim() === "" && (
            <div className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
              Showing top 10 — type to filter all {priceBook.length} items
            </div>
          )}
        </div>
      )}
    </div>
  );
}
