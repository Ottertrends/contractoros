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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const quotesOptions = ["1-5", "6-15", "16-30", "30+"] as const;

const signupSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  company_name: z.string().min(1, "Company name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  quotes_per_month: z.enum(quotesOptions),
  business_areas: z.array(z.string()).min(1, "Select at least one business area"),
  services: z.array(z.string()).min(1, "Select at least one service"),
});

type SignupValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const ta = t.auth;
  const ts = t.settings;

  const businessAreaOptions = [
    { value: "residential", label: ts.residential },
    { value: "commercial", label: ts.commercial },
    { value: "industrial", label: ts.industrial },
    { value: "government", label: ts.government },
    { value: "other", label: ts.other },
  ];

  const serviceOptions = [
    { value: "concrete", label: ts.concrete },
    { value: "framing", label: ts.framing },
    { value: "remodeling", label: ts.remodeling },
    { value: "roofing", label: ts.roofing },
    { value: "electrical", label: ts.electrical },
    { value: "plumbing", label: ts.plumbing },
    { value: "drywall", label: ts.drywall },
    { value: "excavation", label: ts.excavation },
  ];

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      full_name: "",
      company_name: "",
      email: "",
      phone: "",
      password: "",
      quotes_per_month: "1-5",
      business_areas: [],
      services: [],
    },
    mode: "onChange",
  });

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = form;

  const selectedBusinessAreas = watch("business_areas");
  const selectedServices = watch("services");

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) router.push("/dashboard");
      },
    );
    return () => sub.subscription.unsubscribe();
  }, [router]);

  async function onSubmit(values: SignupValues) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback`,
          data: {
            full_name: values.full_name,
            company_name: values.company_name,
            phone: values.phone,
            quotes_per_month: values.quotes_per_month,
            business_areas: values.business_areas,
            services: values.services,
            whatsapp_connected: false,
          },
        },
      });

      if (error) throw error;

      toast.success("Account created. Redirecting...");
      if (data?.session?.access_token) {
        router.push("/dashboard");
      } else {
        router.push("/dashboard");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create account";
      toast.error(message);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{ta.signupTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="full_name">{ta.fullName} *</Label>
                <Input id="full_name" {...register("full_name")} />
                {errors.full_name ? (
                  <div className="text-sm text-danger">{errors.full_name.message}</div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company_name">{ta.companyName} *</Label>
                <Input id="company_name" {...register("company_name")} />
                {errors.company_name ? (
                  <div className="text-sm text-danger">{errors.company_name.message}</div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{ta.email} *</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email ? (
                  <div className="text-sm text-danger">{errors.email.message}</div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">{ta.phone} *</Label>
                <Input id="phone" {...register("phone")} />
                {errors.phone ? (
                  <div className="text-sm text-danger">{errors.phone.message}</div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">{ta.password} *</Label>
                <Input id="password" type="password" {...register("password")} />
                {errors.password ? (
                  <div className="text-sm text-danger">{errors.password.message}</div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label>{ta.quotesPerMonth}</Label>
                <Select
                  value={watch("quotes_per_month")}
                  onValueChange={(v) =>
                    setValue("quotes_per_month", v as SignupValues["quotes_per_month"], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {quotesOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.quotes_per_month ? (
                  <div className="text-sm text-danger">{errors.quotes_per_month.message}</div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-medium">{ta.businessAreas} *</div>
                <div className="text-xs text-slate-500">{ta.selectAll}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {businessAreaOptions.map((opt) => {
                  const checked = selectedBusinessAreas.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          const next = c
                            ? Array.from(new Set([...selectedBusinessAreas, opt.value]))
                            : selectedBusinessAreas.filter((v) => v !== opt.value);
                          setValue("business_areas", next, { shouldDirty: true, shouldValidate: true });
                        }}
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-50">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
              {errors.business_areas ? (
                <div className="text-sm text-danger">{errors.business_areas.message}</div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-medium">{ta.servicesProvided} *</div>
                <div className="text-xs text-slate-500">{ta.selectAll}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {serviceOptions.map((opt) => {
                  const checked = selectedServices.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          const next = c
                            ? Array.from(new Set([...selectedServices, opt.value]))
                            : selectedServices.filter((v) => v !== opt.value);
                          setValue("services", next, { shouldDirty: true, shouldValidate: true });
                        }}
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-50">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
              {errors.services ? (
                <div className="text-sm text-danger">{errors.services.message}</div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? ta.signingUp : ta.signupButton}
              </Button>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {ta.alreadyAccount}{" "}
                <a href="/auth/login" className="text-primary hover:underline">
                  {ta.logIn}
                </a>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
