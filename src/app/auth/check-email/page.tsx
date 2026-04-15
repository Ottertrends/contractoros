import Link from "next/link";
import { Mail } from "lucide-react";

export default function CheckEmailPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center flex flex-col items-center gap-6">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Check your email</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            We sent a verification link to your email address. Click the link to activate your
            account, then log in.
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
            Didn&apos;t receive it? Check your spam folder or try signing up again.
          </p>
        </div>
        <Link
          href="/auth/login"
          className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Go to Login
        </Link>
      </div>
    </div>
  );
}
