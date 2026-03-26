# ContractorOS (Phase 1 + 2)

Next.js App Router + Supabase (auth + RLS) + Tailwind/shadcn-style UI. **Phase 2** adds Evolution API (WhatsApp), Claude agent, webhooks, and realtime dashboard updates.

## Environment variables

Create `.env.local` (never commit secrets) with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; account deletion, webhooks, agent tools)

### Phase 2 — WhatsApp & AI

- `EVOLUTION_API_URL` — Evolution API base URL (e.g. `http://your-vps:8080`)
- `EVOLUTION_API_KEY` — Evolution global API key
- `NEXT_PUBLIC_APP_URL` — Public app URL for webhooks (Vercel URL or ngrok in dev)
- `ANTHROPIC_API_KEY` — Claude API key
- `EVOLUTION_WEBHOOK_SECRET` *(optional)* — if set, webhook requests must send matching `x-evolution-webhook-secret` or `x-webhook-secret`
- `ANTHROPIC_MODEL` *(optional)* — overrides default (`claude-sonnet-4-6`) for the agent and diagnostics

Apply migration `supabase/migrations/002_enable_realtime.sql` in Supabase so `projects`, `invoices`, and `messages` publish to Realtime.

### Vercel

Add the same variables under **Project → Settings → Environment Variables** for **Production** (and **Preview** if you use it).

`NEXT_PUBLIC_*` values are inlined at **build time**; the build will fail or the app will not authenticate if they are missing.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
