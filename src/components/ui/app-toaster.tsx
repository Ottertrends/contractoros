"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      richColors
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-white text-slate-900 border border-slate-200 shadow-sm dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800",
        },
      }}
    />
  );
}

