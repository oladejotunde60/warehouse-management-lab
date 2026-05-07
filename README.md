# Warehouse Management Lab — Sales Demo

A working, free-to-host demo of the warehouse portal described in [docs/adr/0001-warehouse-management-portal-architecture.md](docs/adr/0001-warehouse-management-portal-architecture.md).

**What it shows:** custodial intake, partial withdrawals, OTP-acknowledged release,
realtime balance updates, signed PDF receipts, multi-tenant Postgres with row-level security,
and an append-only movement ledger.

**What it isn't:** the production architecture from the ADR. The demo is one Next.js
app + one Supabase Postgres. Sharding, Merkle anchoring, outbox, snapshots, etc. live
in the ADR — not here.

---

## Quickstart for tomorrow morning (~15 minutes)

You'll do three things: (1) create a Supabase project, (2) deploy to Vercel, (3) create demo users.

### 1. Create a Supabase project (5 min)

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. Create a new project. Pick any name, set a strong DB password (save it — you may need it later), choose the region closest to you.
3. Wait ~2 min for provisioning.
4. Once provisioned, go to **SQL Editor** → **New query** → paste the contents of
   [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) → **Run**.
   You should see "Success. No rows returned."
5. Go to **Authentication → Users → Add user → Create new user** and create the four demo users.
   Set **Auto Confirm User** ON for each.

   | Email                          | Password   | Role               |
   |--------------------------------|------------|--------------------|
   | `ops@warehouse.demo`           | `demo1234` | Operator           |
   | `supervisor@warehouse.demo`    | `demo1234` | Operator           |
   | `alice@acmefoods.demo`         | `demo1234` | Customer (Acme)    |
   | `ben@globalpharma.demo`        | `demo1234` | Customer (Pharma)  |

6. Back to **SQL Editor** → **New query** → paste [supabase/seed.sql](supabase/seed.sql) → **Run**.
   This seeds tenants, SKUs, lots, and links the four users to their roles.
7. Open **Project Settings → API**. Copy three values; you'll paste them into Vercel:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` *(keep secret — server only)*

### 2. Deploy to Vercel (5 min)

1. Push this repo to GitHub (we'll do that for you below — or use the GitHub repo we created).
2. Go to <https://vercel.com> → **Add New → Project** → select the GitHub repo.
3. Framework preset: Next.js (auto-detected). Don't change build settings.
4. Click **Environment Variables** and paste the three Supabase values from step 1.7.
   Optionally add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` if you want real emails (see step 3).
5. Click **Deploy**. ~90 seconds. You'll get a URL like `https://warehouse-management-lab.vercel.app`.

### 3. (Optional) Real emails via Resend (3 min)

Without this, OTPs are still shown in the operator UI. With it, customers get a real email.

1. Go to <https://resend.com> → sign up (free tier: 100 emails/day).
2. **API Keys → Create API Key** → copy.
3. In Vercel → Project → Settings → Environment Variables, add:
   - `RESEND_API_KEY` = the key
   - `RESEND_FROM_EMAIL` = `onboarding@resend.dev` (works without domain verification on the free tier; messages go only to the address that signed up to Resend)
4. Redeploy (Vercel → Deployments → ⋯ → Redeploy).

For real-world emails to *any* recipient, verify a domain in Resend → use `noreply@yourdomain.com`.

### 4. Run locally (optional, 2 min)

```bash
cp .env.local.example .env.local
# fill in the three Supabase values from step 1.7
npm install
npm run dev
# open http://localhost:3000
```

---

## Demo flow to walk the client through

1. Open the deployed URL. Show the landing page — explain "we have two views: warehouse staff and depositors."
2. **Sign in as `ops@warehouse.demo`** — the operator dashboard. Show pending withdrawals, the live ledger, the on-hand snapshot.
3. Open another browser (or incognito). **Sign in as `alice@acmefoods.demo`** — Acme's customer dashboard. Show the lots, the realtime balance bars, the audit trail.
4. As Alice → **Request a withdrawal** of, say, 50 bags from `LOT-RICE-2026-001` (initial 500).
5. Switch to the operator window → the request appears in the queue → click into it → **Approve & issue OTP**. The 6-digit code shows on the operator screen and is emailed to Alice (or logged to the server console if Resend isn't configured).
6. Switch to Alice → her withdrawal page now shows "awaiting acknowledgement." Enter the OTP.
7. Goods released. Alice's lot balance updates from 500 → 450 in real time on the dashboard.
8. **Download the signed PDF receipt** — that's the audit artifact.
9. Show the operator's audit trail panel for the withdrawal — every event, in order, immutable.

The pitch: *"This is the customer-visible flow today. The architecture document explains how we scale this to billions of items, hash-anchor the audit trail, and pass SOC 2."*

---

## Project structure

```
docs/adr/        — the architecture decision record (the production design)
supabase/        — schema migration + seed data
src/
  app/           — Next.js App Router pages
    actions/     — server actions (intake, withdrawals, auth)
    api/         — REST routes (PDF receipts)
    operator/    — operator-only pages
    customer/    — customer-only pages
  components/    — UI primitives + shared components
  lib/
    supabase/    — server, browser, and middleware clients
    pdf.ts       — signed PDF receipt generator
    email.ts     — Resend wrapper with console fallback
```

## Architecture mapping (demo → ADR)

| ADR concept (production)                          | Demo implementation                                       |
|---------------------------------------------------|------------------------------------------------------------|
| Append-only movement ledger                       | `movement_events` table, never updated                     |
| Balance projector                                 | `lots.on_hand_qty` column, updated atomically              |
| Per-lot strict serializability                    | `approve_withdrawal()` with `SELECT … FOR UPDATE`          |
| Withdrawal state machine                          | `withdrawals.status` enum + RPC functions                  |
| OTP-on-release                                    | `approve_withdrawal()` issues 6-digit OTP, emailed         |
| Multi-tenant isolation                            | Postgres RLS policies on every table                       |
| Realtime balance updates                          | Supabase Realtime + `RealtimeRefresher` client component   |
| Signed receipts                                   | `pdf-lib` PDF generation in `/api/receipts/[id]`           |
| Sharding, Merkle anchoring, snapshots, outbox     | **Not in demo** — they're in the ADR                       |

## Running costs

- **$0/mo** if you stay on Supabase Free + Vercel Hobby.
- Free tier limits to know about for tomorrow:
  - Supabase Free pauses projects after 1 week of inactivity. Ping it the morning of your demo (any page load wakes it).
  - Vercel Hobby is technically non-commercial. If the client signs and you keep this URL live, upgrade to Pro ($20/mo).
  - Resend Free is 100 emails/day, only to the address that signed up. Verify a domain to send to anyone.

## Troubleshooting

**"Auth error: invalid login credentials"** — make sure you ticked **Auto Confirm User** when creating demo users in the Supabase dashboard.

**"new row violates row-level security policy for table 'profiles'"** when running the seed — make sure step 1.5 (creating the four auth users) is done *before* running the seed, since the seed looks them up by email.

**OTP doesn't arrive by email** — without a Resend API key, OTPs appear on the operator screen *and* in the server logs (`vercel logs` or local terminal). That's by design — the demo always works.

**Blank dashboard after login** — the user account isn't linked to a profile. Re-run the relevant `INSERT … profiles` block from `seed.sql` for that email, or sign up via `/signup`.

**Realtime not updating** — confirm the migration's `alter publication supabase_realtime add table …` lines ran without error (check Supabase → Database → Replication → `supabase_realtime` should list `lots`, `withdrawals`, `movement_events`).

---

## After the demo: what to build first if the client buys

Order is from the ADR:

1. **Multi-region, real DR.** RPO/RTO is the first hard requirement.
2. **Outbox + Service Bus** — decouple the projector update from notifications.
3. **Hash-chained audit (Merkle batches)** — the legal/regulatory selling point.
4. **Snapshot-based historical "as-of" balances**.
5. **Sharding** — only when growth justifies it; not on day one.

See ADR §10 for the deferred ADR list (mobile, billing, customs, AI/ML, etc.).
