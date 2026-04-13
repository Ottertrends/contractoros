"use client";

import { useState } from "react";
import { UserPlus, Trash2, Clock, CheckCircle } from "lucide-react";

interface TeamMember {
  id: string;
  invited_email: string;
  invited_phone: string | null;
  status: "pending" | "active" | "removed";
  accepted_at: string | null;
  invited_at: string;
}

interface Props {
  initialMembers: TeamMember[];
  maxSeats: number; // total seats including owner (Infinity for free_premium_team)
}

export function TeamPageClient({ initialMembers, maxSeats }: Props) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const activeCount = members.filter((m) => m.status !== "removed").length;
  // Seats for members = maxSeats - 1 (owner occupies 1 seat)
  const memberLimit = isFinite(maxSeats) ? maxSeats - 1 : Infinity;
  const atLimit = isFinite(memberLimit) && activeCount >= memberLimit;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteMsg({ type: "ok", text: `Invite sent to ${email.trim()}` });
        setEmail("");
        setPhone("");
        // Refresh members list
        const refreshRes = await fetch("/api/team/members");
        if (refreshRes.ok) setMembers(await refreshRes.json());
      } else {
        setInviteMsg({ type: "error", text: data.error ?? "Failed to send invite" });
      }
    } catch {
      setInviteMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(memberId: string) {
    setRemovingId(memberId);
    try {
      const res = await fetch("/api/team/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Seat usage */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Seat Usage</h2>
        {isFinite(memberLimit) ? (
          <>
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 mb-2">
              <span>{activeCount} of {memberLimit} member seats used</span>
              {atLimit && (
                <a href="/dashboard/billing" className="text-primary text-xs hover:underline font-medium">
                  Add more seats →
                </a>
              )}
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${atLimit ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${Math.min(100, (activeCount / memberLimit) * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">{activeCount} members · Unlimited seats</p>
        )}
      </div>

      {/* Invite form */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Invite Team Member</h2>
        <form onSubmit={invite} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 uppercase font-medium">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="teammate@email.com"
                disabled={atLimit}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 uppercase font-medium">WhatsApp Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                disabled={atLimit}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
              <span className="text-xs text-slate-400">Their WhatsApp number so the AI agent pairs to this workspace</span>
            </div>
          </div>
          <div>
            <button
              type="submit"
              disabled={inviting || atLimit || !email.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              {inviting ? "Sending…" : "Send Invite"}
            </button>
            {atLimit && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Seat limit reached. <a href="/dashboard/billing" className="underline">Add more seats</a> to invite more members.
              </p>
            )}
          </div>
          {inviteMsg && (
            <p className={`text-sm ${inviteMsg.type === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {inviteMsg.text}
            </p>
          )}
        </form>
      </div>

      {/* Members list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Team Members</h2>
        {members.length === 0 ? (
          <p className="text-sm text-slate-400">No members invited yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((m) => (
              <li key={m.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {m.status === "active" ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.invited_email}</div>
                    {m.invited_phone && (
                      <div className="text-xs text-slate-400">{m.invited_phone}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    m.status === "active"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}>
                    {m.status === "active" ? "Active" : "Pending"}
                  </span>
                  <button
                    onClick={() => removeMember(m.id)}
                    disabled={removingId === m.id}
                    title="Remove member"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
