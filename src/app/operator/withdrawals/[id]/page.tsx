import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { StatusBadge } from "@/components/StatusBadge";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { formatDateTime, formatQty } from "@/lib/utils";
import { approveWithdrawal, rejectWithdrawal } from "@/app/actions/withdrawals";

export default async function OperatorWithdrawalDetail({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "operator") redirect("/customer");

  const { data: w } = await supabase
    .from("withdrawals")
    .select(`
      id, status, requested_qty, otp_code, otp_expires_at, created_at,
      approved_at, acknowledged_at, released_at, notes,
      lots ( id, lot_code, on_hand_qty, skus ( name, unit_of_measure ) ),
      tenants ( name )
    `)
    .eq("id", params.id).maybeSingle();
  if (!w) notFound();

  const { data: events } = await supabase
    .from("movement_events")
    .select("id, event_type, quantity, recorded_at, reason")
    .eq("withdrawal_id", params.id)
    .order("recorded_at", { ascending: true });

  const wd = w as any;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Withdrawal</div>
          <h1 className="text-2xl font-bold text-slate-900 font-mono">{wd.id.slice(0, 8)}…</h1>
          <p className="text-sm text-slate-600">
            {wd.tenants?.name} · {wd.lots?.lot_code} · {wd.lots?.skus?.name}
          </p>
        </div>
        <StatusBadge status={wd.status} />
      </div>

      {searchParams.error && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-800">
          {searchParams.error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Request details</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Row label="Tenant"        value={wd.tenants?.name} />
            <Row label="Lot"           value={wd.lots?.lot_code} mono />
            <Row label="SKU"           value={wd.lots?.skus?.name} />
            <Row label="Requested qty" value={formatQty(wd.requested_qty, wd.lots?.skus?.unit_of_measure)} />
            <Row label="Lot on-hand"   value={formatQty(wd.lots?.on_hand_qty, wd.lots?.skus?.unit_of_measure)} />
            <Row label="Created"       value={formatDateTime(wd.created_at)} />
            <Row label="Approved"      value={formatDateTime(wd.approved_at)} />
            <Row label="Acknowledged"  value={formatDateTime(wd.acknowledged_at)} />
            <Row label="Released"      value={formatDateTime(wd.released_at)} />
            {wd.notes && <Row label="Notes" value={wd.notes} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>What you can do depends on current state.</CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            {wd.status === "requested" && (
              <>
                <form action={approveWithdrawal}>
                  <input type="hidden" name="withdrawal_id" value={wd.id} />
                  <Button type="submit" size="lg" className="w-full">Approve & issue OTP</Button>
                </form>
                <form action={rejectWithdrawal} className="space-y-2">
                  <input type="hidden" name="withdrawal_id" value={wd.id} />
                  <Label htmlFor="reason">Or reject with reason</Label>
                  <Input id="reason" name="reason" placeholder="reason" />
                  <Button type="submit" variant="danger" className="w-full">Reject</Button>
                </form>
              </>
            )}

            {wd.status === "awaiting_ack" && wd.otp_code && (
              <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-4">
                <div className="text-xs uppercase tracking-wide text-amber-700 font-semibold">Release code (demo visible)</div>
                <div className="mt-1 font-mono text-3xl font-bold text-amber-900 tracking-widest">{wd.otp_code}</div>
                <div className="mt-1 text-xs text-amber-800">
                  Expires {formatDateTime(wd.otp_expires_at)}. Customer enters this in their portal to release the goods.
                </div>
                <div className="mt-2 text-xs text-amber-700">
                  An email containing this code was {process.env.RESEND_API_KEY ? "sent to the customer." : "logged to the server console (Resend not configured)."}
                </div>
              </div>
            )}

            {wd.status === "released" && (
              <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-4 text-sm text-emerald-800">
                Goods released to customer.
                <a
                  href={`/api/receipts/${wd.id}`}
                  className="ml-2 underline font-medium"
                  target="_blank" rel="noreferrer"
                >Download release receipt (PDF)</a>
              </div>
            )}
            {wd.status === "rejected" && (
              <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 p-4 text-sm text-rose-800">
                Rejected. {wd.notes ? `Reason: ${wd.notes}` : ""}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ledger events for this withdrawal</CardTitle></CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-slate-100">
            {(events ?? []).map((e: any) => (
              <li key={e.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                <EventTypeBadge type={e.event_type} />
                <div className="flex-1">
                  <div className="text-slate-900">{e.reason}</div>
                  <div className="text-xs text-slate-500">{formatDateTime(e.recorded_at)}</div>
                </div>
                <div className="font-mono text-sm">
                  {Number(e.quantity) > 0 ? "+" : ""}{e.quantity}
                </div>
              </li>
            ))}
            {(!events || events.length === 0) && (
              <li className="px-6 py-6 text-center text-sm text-slate-500">No events yet.</li>
            )}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium text-slate-900"}>{value ?? "—"}</span>
    </div>
  );
}
