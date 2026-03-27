import { LoginForm } from "@/components/auth/login-form";

const features = [
  {
    icon: "💬",
    title: "WhatsApp AI Assistant",
    desc: "Text your job details and your AI replies instantly — drafts invoices, looks up material prices, and tracks projects. No app switching needed.",
  },
  {
    icon: "🧾",
    title: "Professional Invoices",
    desc: "Create and send invoices in seconds. Track what's paid, pending, and outstanding — all in one clean view.",
  },
  {
    icon: "📋",
    title: "Project & Client Tracking",
    desc: "Keep every job, client, and update organized without the paperwork. Know exactly where each project stands.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-bold text-primary dark:text-white tracking-tight">WorkSupp</span>
          <a
            href="/auth/signup"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            Get Started Free
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-12 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-start">

          {/* Left: hero + features */}
          <div className="lg:col-span-3 flex flex-col gap-10">
            {/* Hero */}
            <div className="flex flex-col gap-4">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300 text-sm font-medium px-3 py-1 rounded-full w-fit">
                <span>🤖</span> AI-powered for contractors
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
                Run your business<br className="hidden sm:block" /> from your phone
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
                Track jobs, generate invoices, and get material prices — all through WhatsApp and a simple dashboard built for contractors.
              </p>
            </div>

            {/* Feature cards */}
            <div className="flex flex-col gap-4">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="flex items-start gap-4 bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm"
                >
                  <div className="text-2xl shrink-0 mt-0.5">{f.icon}</div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white mb-1">{f.title}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Social proof / tagline */}
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Trusted by independent contractors. No setup fees. Cancel anytime.
            </p>
          </div>

          {/* Right: login card */}
          <div className="lg:col-span-2 lg:sticky lg:top-24">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg p-8">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sign in</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Welcome back — pick up right where you left off.
                </p>
              </div>
              <LoginForm />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-200 dark:border-slate-800">
        Powered by{" "}
        <a
          href="https://otterq.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          OtterQ
        </a>
        {" "}· Built for the trades
      </footer>
    </div>
  );
}
