"use client";

import * as React from "react";
import { RefreshCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { SubscriptionBuilder } from "@/components/subscriptions/subscription-builder";
import {
  ActiveSubscriptionsTable,
  SubscriptionPlansTable,
} from "@/components/subscriptions/subscriptions-list";
import type { Project, ServicePlan, ClientSubscription } from "@/lib/types/database";

type PlanWithProject = ServicePlan & {
  projects?: { name: string; client_name: string | null; client_email: string | null } | null;
};
type SubWithRelations = ClientSubscription & {
  projects?: { name: string; client_name: string | null; client_email: string | null } | null;
  service_plans?: { name: string; amount: string; interval: string } | null;
};

export default function SubscriptionsPage() {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = React.useState(false);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [plans, setPlans] = React.useState<PlanWithProject[]>([]);
  const [subscriptions, setSubscriptions] = React.useState<SubWithRelations[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [builderOpen, setBuilderOpen] = React.useState(false);

  async function loadData(uid: string) {
    const [{ data: profileData }, { data: projectsData }, { data: plansData }, { data: subsData }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("stripe_connect_account_id, stripe_connect_charges_enabled")
          .eq("id", uid)
          .single(),
        supabase
          .from("projects")
          .select("*")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("name"),
        supabase
          .from("service_plans")
          .select("*, projects(name, client_name, client_email)")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
        supabase
          .from("client_subscriptions")
          .select("*, projects(name, client_name, client_email), service_plans(name, amount, interval)")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
      ]);

    const profile = profileData as Record<string, unknown> | null;
    setStripeConnected(!!(profile?.stripe_connect_account_id && profile?.stripe_connect_charges_enabled));
    setProjects((projectsData as Project[]) ?? []);
    setPlans((plansData as PlanWithProject[]) ?? []);
    setSubscriptions((subsData as SubWithRelations[]) ?? []);
  }

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: import("@supabase/supabase-js").User | null } }) => {
      if (!user) return;
      setUserId(user.id);
      loadData(user.id).finally(() => setLoading(false));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    if (userId) void loadData(userId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400">
        Loading…
      </div>
    );
  }

  // Gate: Stripe not connected
  if (!stripeConnected) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center flex flex-col items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <RefreshCcw className="w-7 h-7 text-slate-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-2">
            Connect Stripe to use Subscriptions
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Subscription links require Stripe Connect. Connect your Stripe account to generate
            recurring billing plans for your clients.
          </p>
        </div>
        <a href="/dashboard/settings">
          <Button>Connect Stripe →</Button>
        </a>
      </div>
    );
  }

  const activeCount = subscriptions.filter((s) =>
    ["active", "trialing", "past_due"].includes(s.status),
  ).length;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-6 px-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Subscriptions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate recurring billing links for your clients — they pay once, Stripe handles the rest.
          </p>
        </div>
        <Button
          onClick={() => {
            if (projects.length === 0) {
              alert("You need at least one active project to create a subscription plan.");
              return;
            }
            setBuilderOpen(true);
          }}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Plan
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 mb-1">Active Clients</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{activeCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 mb-1">Plans Created</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{plans.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 mb-1">Total Subscriptions</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{subscriptions.length}</div>
        </div>
      </div>

      {/* Active client subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Client Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <ActiveSubscriptionsTable subscriptions={subscriptions} onRefresh={refresh} />
        </CardContent>
      </Card>

      {/* Subscription plans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <SubscriptionPlansTable plans={plans} subscriptions={subscriptions} />
        </CardContent>
      </Card>

      {/* Builder modal */}
      {builderOpen && (
        <SubscriptionBuilder
          projects={projects}
          onClose={() => setBuilderOpen(false)}
          onCreated={() => {
            refresh();
            setBuilderOpen(false);
          }}
        />
      )}
    </div>
  );
}
