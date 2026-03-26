export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-14">
        <div className="flex flex-col gap-6">
          <div>
            <div className="text-4xl font-semibold tracking-tight text-primary">
              WorkSupp
            </div>
            <div className="mt-2 text-slate-600 dark:text-slate-400">
              AI-powered project management for small contractors.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              Sign Up
            </a>
            <a
              href="/auth/login"
              className="inline-flex items-center justify-center rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 transition-colors"
            >
              Log In
            </a>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-xs text-slate-500">
        Powered by{" "}
        <a
          href="https://otterq.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          OtterQ
        </a>
      </footer>
    </div>
  );
}
