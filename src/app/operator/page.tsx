import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { formatDateTime, formatQty } from "@/lib/utils";
import Link from "next/link";

export default async function OperatorDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "operator") redirect("/customer");

  const [{ data: pendingWds }, { data: recentEvents }, { data: lots }] = await Promise.all([
    supabase.from("withdrawals")
      .select(`
        id, status, requested_qty, created_at,
        lots ( lot_code, skus ( name, unit_of_measure ) ),
        tenants ( name )
      `)
      .in("status", ["requested", "awaiting_ack"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("movement_events")
      .select(`
        id, event_type, quantity, recorded_at, reason,
        lots ( lot_code, skus ( name, unit_of_measure ) ),
        tenants ( name )
      `)
      .order("recorded_at", { ascending: false })
      .limit(10),
    supabase.from("lots")
      .select(`id, lot_code, on_hand_qty, initial_qty,
        skus ( name, unit_of_measure ),
        tenants ( name )`)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const totalOnHand = (lots ?? []).reduce((s, l) => s + Number(l.on_hand_qty), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Operator dashboard</h1>
        <p className="text-sm text-slate-500">All tenants. Pending requests, recent movements, on-hand snapshot.</p>
      </div>

      <section className="grid sm:grid-cols-3 gap-4">
        <KPI label="Pending requests" value={(pendingWds ?? []).filter(w => w.status === "requested").length} />
        <KPI label="Awaiting customer ack" value={(pendingWds ?? []).filter(w => w.status === "awaiting_ack").length} />
        <KPI label="Total units on hand" value={formatQty(totalOnHand)} />
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pending withdrawals</CardTitle>
            <CardDescription>Approve to issue OTP, or reject.</CardDescription>
          </CardHeader>
          <CardBody className="p-0">
            {pendingWds && pendingWds.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-6 py-2 font-medium">Tenant</th>
                    <th className="text-left px-6 py-2 font-medium">Lot</th>
                    <th className="text-right px-6 py-2 font-medium">Qty</th>
                    <th className="text-left px-6 py-2 font-medium">Status</th>
                    <th className="px-6 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingWds.map((w: any) => (
                    <tr key={w.id} className="border-t border-slate-100">
                      <td className="px-6 py-3">{w.tenants?.name}</td>
                      <td className="px-6 py-3">
                        <div className="font-mono text-xs">{w.lots?.lot_code}</div>
                        <div className="text-xs text-slate-500">{w.lots?.skus?.name}</div>
                      </td>
                      <td className="px-6 py-3 text-right font-medium">
                        {formatQty(w.requested_qty, w.lots?.skus?.unit_of_measure)}
                      </td>
                      <td className="px-6 py-3"><StatusBadge status={w.status} /></td>
                      <td className="px-6 py-3 text-right">
                        <Link href={`/operator/withdrawals/${w.id}`} className="text-brand-600 font-medium text-sm hover:underline">Open →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-6 py-8 text-center text-sm text-slate-500">No pending requests.</div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent movements</CardTitle>
            <CardDescription>Append-only ledger, all tenants.</CardDescription>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100">
              {(recentEvents ?? []).map((e: any) => (
                <li key={e.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                  <EventTypeBadge type={e.event_type} />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{e.tenants?.name}</div>
                    <div className="text-xs text-slate-500">
                      {e.lots?.lot_code} · {e.lots?.skus?.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">
                      {Number(e.quantity) > 0 ? "+" : ""}{formatQty(e.quantity, e.lots?.skus?.unit_of_measure)}
                    </div>
                    <div className="text-xs text-slate-500">{formatDateTime(e.recorded_at)}</div>
                  </div>
                </li>
              ))}
              {(!recentEvents || recentEvents.length === 0) && (
                <li className="px-6 py-8 text-center text-sm text-slate-500">No events yet.</li>
              )}
            </ul>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle>On-hand by lot</CardTitle></CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-6 py-2 font-medium">Tenant</th>
                <th className="text-left px-6 py-2 font-medium">Lot</th>
                <th className="text-left px-6 py-2 font-medium">SKU</th>
                <th className="text-right px-6 py-2 font-medium">Initial</th>
                <th className="text-right px-6 py-2 font-medium">On hand</th>
              </tr>
            </thead>
            <tbody>
              {(lots ?? []).map((l: any) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-6 py-3">{l.tenants?.name}</td>
                  <td className="px-6 py-3 font-mono text-xs">{l.lot_code}</td>
                  <td className="px-6 py-3">{l.skus?.name}</td>
                  <td className="px-6 py-3 text-right">{formatQty(l.initial_qty, l.skus?.unit_of_measure)}</td>
                  <td className="px-6 py-3 text-right font-semibold">
                    {formatQty(l.on_hand_qty, l.skus?.unit_of_measure)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: number | string }) {
  return (
    <Card><CardBody>
      <div className="text-xs uppercase text-slate-500 tracking-wide">{label}</div>
      <div className="mt-1 text-3xl font-bold text-slate-900">{value}</div>
    </CardBody></Card>
  );
}
