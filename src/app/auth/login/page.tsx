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

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const ta = t.auth;
  const [redirected, setRedirected] = React.useState(false);

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
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) throw error;
      toast.success("Logged in");
      router.push("/dashboard");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Login failed";
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
