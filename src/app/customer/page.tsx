import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatQty } from "@/lib/utils";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";
import Link from "next/link";

export default async function CustomerDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, tenant_id, full_name, tenants(name)")
    .eq("user_id", user.id).maybeSingle();
  if (profile?.role === "operator") redirect("/operator");
  if (!profile?.tenant_id) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-600">Your account isn't linked to a tenant yet. Contact warehouse operations.</p>
      </div>
    );
  }

  const tenantId = profile.tenant_id;

  const [{ data: lots }, { data: events }, { data: withdrawals }] = await Promise.all([
    supabase.from("lots")
      .select(`id, lot_code, initial_qty, on_hand_qty, expiry_date, notes,
               skus(name, code, unit_of_measure, tags)`)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase.from("movement_events")
      .select(`id, event_type, quantity, recorded_at, reason,
               lots(lot_code, skus(name, unit_of_measure))`)
      .eq("tenant_id", tenantId)
      .order("recorded_at", { ascending: false })
      .limit(15),
    supabase.from("withdrawals")
      .select(`id, status, requested_qty, created_at,
               lots(lot_code, skus(name, unit_of_measure))`)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const totalUnits = (lots ?? []).reduce((s, l: any) => s + Number(l.on_hand_qty), 0);
  const totalLots  = (lots ?? []).length;
  const pendingCount = (withdrawals ?? []).filter((w: any) =>
    ["requested", "awaiting_ack"].includes(w.status)).length;

  return (
    <div className="space-y-8">
      <RealtimeRefresher tenantId={tenantId} />

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Customer dashboard</div>
          <h1 className="text-2xl font-bold text-slate-900">{(profile as any).tenants?.name}</h1>
          <p className="text-sm text-slate-500">Welcome back, {profile.full_name}.</p>
        </div>
        <Link href="/customer/withdraw" className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
          Request a withdrawal
        </Link>
      </div>

      <section className="grid sm:grid-cols-3 gap-4">
        <KPI label="Total units on hand" value={formatQty(totalUnits)} />
        <KPI label="Active lots" value={totalLots} />
        <KPI label="Pending withdrawals" value={pendingCount} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Your lots</CardTitle>
          <CardDescription>Updates live as goods are received or released.</CardDescription>
        </CardHeader>
        <CardBody className="p-0">
          {lots && lots.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-6 py-2 font-medium">Lot</th>
                  <th className="text-left px-6 py-2 font-medium">SKU</th>
                  <th className="text-right px-6 py-2 font-medium">Initial</th>
                  <th className="text-right px-6 py-2 font-medium">On hand</th>
                  <th className="text-right px-6 py-2 font-medium">Withdrawn</th>
                  <th className="text-left px-6 py-2 font-medium">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l: any) => {
                  const initial = Number(l.initial_qty);
                  const onHand  = Number(l.on_hand_qty);
                  const taken   = initial - onHand;
                  const pct     = initial > 0 ? (onHand / initial) * 100 : 0;
                  return (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-6 py-3 font-mono text-xs">{l.lot_code}</td>
                      <td className="px-6 py-3">
                        <div className="font-medium text-slate-900">{l.skus?.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{l.skus?.code}</div>
                      </td>
                      <td className="px-6 py-3 text-right text-slate-600">{formatQty(initial, l.skus?.unit_of_measure)}</td>
                      <td className="px-6 py-3 text-right">
                        <div className="font-semibold text-slate-900">{formatQty(onHand, l.skus?.unit_of_measure)}</div>
                        <div className="mt-1 h-1.5 w-24 ml-auto rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right text-slate-600">
                        {taken > 0 ? `−${formatQty(taken, l.skus?.unit_of_measure)}` : "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-600">{l.expiry_date ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-10 text-center text-sm text-slate-500">No lots yet — your first deposit will appear here.</div>
          )}
        </CardBody>
      </Card>

      <section className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Append-only ledger — every movement, in order.</CardDescription>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100">
              {(events ?? []).map((e: any) => (
                <li key={e.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                  <EventTypeBadge type={e.event_type} />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{e.lots?.skus?.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{e.lots?.lot_code} · {e.reason}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">
                      {Number(e.quantity) > 0 ? "+" : ""}{e.quantity}
                    </div>
                    <div className="text-xs text-slate-500">{formatDateTime(e.recorded_at)}</div>
                  </div>
                </li>
              ))}
              {(!events || events.length === 0) && (
                <li className="px-6 py-8 text-center text-sm text-slate-500">No activity yet.</li>
              )}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your withdrawals</CardTitle>
            <CardDescription>Recent and pending requests.</CardDescription>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100">
              {(withdrawals ?? []).map((w: any) => (
                <li key={w.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">
                      {formatQty(w.requested_qty, w.lots?.skus?.unit_of_measure)} of {w.lots?.skus?.name}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{w.lots?.lot_code} · {formatDateTime(w.created_at)}</div>
                  </div>
                  <StatusBadge status={w.status} />
                  <Link href={`/customer/withdrawals/${w.id}`} className="text-brand-600 text-sm font-medium hover:underline">Open</Link>
                </li>
              ))}
              {(!withdrawals || withdrawals.length === 0) && (
                <li className="px-6 py-8 text-center text-sm text-slate-500">No withdrawal requests yet.</li>
              )}
            </ul>
          </CardBody>
        </Card>
      </section>
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
