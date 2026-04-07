import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Worksupp",
  description: "Privacy Policy for Worksupp — how we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16 flex-1">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-blue-300 mb-8 transition-colors"
        >
          ← Back to Worksupp
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Privacy Policy for Worksupp
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">Effective Date: April 6, 2026</p>

        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-6 leading-relaxed">
          <p>
            At Worksupp, accessible from https://worksupp.co, one of our main priorities is the privacy of our visitors.
            This Privacy Policy document contains types of information that is collected and recorded by Worksupp and how we use it.
          </p>

          <section>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-2">Information We Collect</h2>
            <p className="mb-2">We only ask for personal information when we truly need it to provide a service to you.</p>
            <p className="mb-2">
              <strong>Account Information:</strong> When you register, we may ask for your name and email address.
            </p>
            <p>
              <strong>Google User Data:</strong> If you choose to log in via Google, we collect your email address and basic
              profile information (such as your name and profile picture) to identify you and provide our services.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-2">How We Use Your Information</h2>
            <p className="mb-2">We use the information we collect in various ways, including to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Provide, operate, and maintain our website.</li>
              <li>Improve, personalize, and expand our website.</li>
              <li>Understand and analyze how you use our website.</li>
              <li>Communicate with you, either directly or through one of our partners, for customer service or updates.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-2">Google API Disclosure</h2>
            <p>
              Worksupp&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. We do not share your Google user data with third-party &quot;AI models&quot; or other external tools.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-2">Data Storage and Security</h2>
            <p>
              We retain collected information for as long as necessary to provide you with your requested service.
              What data we store, we&apos;ll protect within commercially acceptable means to prevent loss and theft,
              as well as unauthorized access, disclosure, copying, use, or modification.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-2">Third-Party Privacy Policies</h2>
            <p>
              Worksupp&apos;s Privacy Policy does not apply to other advertisers or websites. Thus, we are advising you
              to consult the respective Privacy Policies of these third-party servers for more detailed information.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-2">Your Data Protection Rights</h2>
            <p>
              You have the right to request copies of your personal data, request that we correct any information you
              believe is inaccurate, or request that we erase your personal data under certain conditions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white mb-2">Contact Us</h2>
            <p className="mb-1">
              If you have additional questions or require more information about our Privacy Policy, do not hesitate to contact us at:
            </p>
            <p>
              Email:{" "}
              <a href="mailto:support@worksupp.co" className="text-primary hover:underline">
                support@worksupp.co
              </a>
            </p>
          </section>
        </div>
      </div>

      <footer className="shrink-0 py-5 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-200 dark:border-slate-800">
        <Link href="/" className="text-primary hover:underline">
          Worksupp
        </Link>
        {" "}· Built for the trades
      </footer>
    </div>
  );
}
