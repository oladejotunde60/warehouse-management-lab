import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";

export default function LandingPage() {
  return (
    <div className="space-y-12">
      <section className="text-center pt-8 pb-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 ring-1 ring-brand-100 px-3 py-1 text-xs font-medium text-brand-700 mb-5">
          Tootechy IT Professional Services · Warehouse Management Solution
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
          Custodial warehouse, <span className="text-brand-600">audit-grade by default</span>.
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
          Intake. Partial withdrawals. OTP-acknowledged release. Every gram, every movement,
          every signature — captured in an append-only ledger your customers can verify.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/login" className="inline-flex h-12 items-center rounded-lg bg-brand-600 px-6 font-medium text-white hover:bg-brand-700">
            Sign in to demo
          </Link>
          <Link href="/signup" className="inline-flex h-12 items-center rounded-lg bg-white ring-1 ring-slate-300 px-6 font-medium text-slate-900 hover:bg-slate-50">
            Create account
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-brand-600 font-semibold">Operator demo</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Warehouse staff view</h3>
            <p className="mt-1 text-sm text-slate-600">Receive goods, approve customer withdrawal requests, issue OTPs, release stock.</p>
            <div className="mt-4 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-4 font-mono text-sm">
              <div><span className="text-slate-500">email:</span> ops@warehouse.demo</div>
              <div><span className="text-slate-500">pass:</span>  demo1234</div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-brand-600 font-semibold">Customer demo (Acme Foods)</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Depositor view</h3>
            <p className="mt-1 text-sm text-slate-600">See your lots, request a partial withdrawal, acknowledge with OTP, download signed receipts.</p>
            <div className="mt-4 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-4 font-mono text-sm">
              <div><span className="text-slate-500">email:</span> alice@acmefoods.demo</div>
              <div><span className="text-slate-500">pass:</span>  demo1234</div>
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {[
          { t: "Append-only ledger", b: "Every receipt, pick, and release is an immutable event. Reconstruct any historical balance in seconds." },
          { t: "OTP acknowledgement", b: "Goods don't leave the dock until the customer acknowledges with a one-time code bound to the release event." },
          { t: "Multi-tenant isolation", b: "Row-level security in Postgres keeps each depositor's data invisible to others — by the database, not by trust." },
        ].map((f) => (
          <Card key={f.t}><CardBody>
            <h4 className="font-semibold text-slate-900">{f.t}</h4>
            <p className="mt-1 text-sm text-slate-600">{f.b}</p>
          </CardBody></Card>
        ))}
      </section>

      <section className="rounded-xl border border-brand-100 bg-brand-50/60 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">First time using the portal?</h3>
          <p className="mt-1 text-sm text-slate-600">
            Plain-English step-by-step guide for warehouse staff and customers — no technical knowledge required.
          </p>
        </div>
        <a
          href="https://github.com/oladejotunde60/warehouse-management-lab/blob/main/docs/USER_GUIDE.md"
          target="_blank" rel="noreferrer"
          className="inline-flex h-10 items-center rounded-lg bg-white ring-1 ring-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50 whitespace-nowrap"
        >
          Open user guide →
        </a>
      </section>

      <footer className="text-center text-xs text-slate-500 pt-8 pb-4">
        © {new Date().getFullYear()} Tootechy IT Professional Services. Demo build. Architecture: see the ADR in the repository.
      </footer>
    </div>
  );
}
