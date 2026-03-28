"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

function extractAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const maybe = error as Record<string, unknown>;
    for (const candidate of [maybe.message, maybe.error_description, maybe.error, maybe.msg, maybe.code]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    try {
      const s = JSON.stringify(maybe);
      if (s && s !== "{}") return s;
    } catch { /* ignore */ }
  }
  return "Login failed";
}

export function LoginForm() {
  const router = useRouter();
  const [debugError, setDebugError] = React.useState<string | null>(null);

  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) router.push("/dashboard");
      },
    );
    return () => sub.subscription.unsubscribe();
  }, [router]);

  async function onSubmit(values: LoginValues) {
    try {
      setDebugError(null);
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        const msg = extractAuthErrorMessage(error);
        setDebugError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Logged in");
      router.refresh(); // flush server components so DashboardLayout sees the new session
      router.push("/dashboard");
    } catch (e: unknown) {
      const msg = extractAuthErrorMessage(e);
      setDebugError(msg);
      toast.error(msg);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="lf-email">Email</Label>
        <Input id="lf-email" type="email" placeholder="you@example.com" {...register("email")} />
        {errors.email && <div className="text-sm text-red-500">{errors.email.message}</div>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="lf-password">Password</Label>
        <Input id="lf-password" type="password" placeholder="••••••••" {...register("password")} />
        {errors.password && <div className="text-sm text-red-500">{errors.password.message}</div>}
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Signing in…" : "Sign In"}
      </Button>
      <div className="text-sm text-slate-500 text-center">
        No account?{" "}
        <a href="/auth/signup" className="text-primary hover:underline font-medium">
          Create one free
        </a>
      </div>
      {debugError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 break-words">
          {debugError}
        </div>
      )}
    </form>
  );
}
