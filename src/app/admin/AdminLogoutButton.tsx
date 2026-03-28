"use client";

export function AdminLogoutButton() {
  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-slate-400 hover:text-slate-600"
    >
      Logout
    </button>
  );
}
