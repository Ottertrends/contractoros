"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

function extractAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error && typeof error === "object") {
    const maybe = error as Record<string, unknown>;
    const candidates = [
      maybe.message,
      maybe.error_description,
      maybe.error,
      maybe.msg,
      maybe.code,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
    try {
      const serialized = JSON.stringify(maybe);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Ignore stringify errors and use generic fallback below.
    }
  }
  return "Login failed";
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const ta = t.auth;
  const [redirected, setRedirected] = React.useState(false);
  const [debugError, setDebugError] = React.useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
  } = form;

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) router.push("/dashboard");
      },
    );
    return () => sub.subscription.unsubscribe();
  }, [router]);

  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      setRedirected(url.searchParams.get("redirected") === "true");
    } catch {
      setRedirected(false);
    }
  }, []);

  async function onSubmit(values: LoginValues) {
    try {
      setDebugError(null);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      if (!supabaseUrl || !supabaseAnonKey) {
        const message = "Missing Supabase URL or anon key in environment variables.";
        setDebugError(message);
        toast.error(message);
        return;
      }

      const tokenRes = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: values.email,
            password: values.password,
          }),
        },
      );

      const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!tokenRes.ok) {
        const message = extractAuthErrorMessage(tokenJson);
        setDebugError(message);
        toast.error(message);
        return;
      }

      const accessToken =
        typeof tokenJson.access_token === "string" ? tokenJson.access_token : null;
      const refreshToken =
        typeof tokenJson.refresh_token === "string"
          ? tokenJson.refresh_token
          : null;
      if (!accessToken || !refreshToken) {
        const message = "Supabase auth response is missing access/refresh token.";
        setDebugError(message);
        toast.error(message);
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        const message = extractAuthErrorMessage(sessionError);
        setDebugError(message);
        toast.error(message);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const message =
          "Login succeeded but no session was created. Check Supabase URL/anon key and Auth settings.";
        setDebugError(message);
        toast.error(message);
        return;
      }
      toast.success("Logged in");
      router.push("/dashboard");
    } catch (e: unknown) {
      console.error("Login error details:", e);
      const message = extractAuthErrorMessage(e);
      setDebugError(message);
      toast.error(message);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{ta.loginTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {redirected ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900">
              {ta.loginSubtitle}
            </div>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{ta.email}</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email ? (
                <div className="text-sm text-danger">{errors.email.message}</div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{ta.password}</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password ? (
                <div className="text-sm text-danger">{errors.password.message}</div>
              ) : null}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? ta.loggingIn : ta.loginButton}
            </Button>
            <div className="text-sm text-slate-600 text-center">
              {ta.noAccount}{" "}
              <a href="/auth/signup" className="text-primary hover:underline">
                {ta.createAccount}
              </a>
            </div>
            {debugError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 break-words">
                {debugError}
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
