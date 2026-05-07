import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { StatusBadge } from "@/components/StatusBadge";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { formatDateTime, formatQty } from "@/lib/utils";
import { acknowledgeWithdrawal } from "@/app/actions/withdrawals";

export default async function CustomerWithdrawalDetail({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string; released?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role, tenant_id").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "operator") redirect(`/operator/withdrawals/${params.id}`);

  const { data: w } = await supabase
    .from("withdrawals")
    .select(`
      id, status, requested_qty, otp_expires_at, created_at,
      approved_at, acknowledged_at, released_at, notes,
      lots ( lot_code, on_hand_qty, skus ( name, unit_of_measure ) )
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
            {wd.lots?.lot_code} · {wd.lots?.skus?.name}
          </p>
        </div>
        <StatusBadge status={wd.status} />
      </div>

      {searchParams.released && (
        <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-4 flex items-center justify-between">
          <div className="text-sm text-emerald-900">
            <strong>Released.</strong> The goods have been issued to you and your balance has been updated.
          </div>
          <a
            href={`/api/receipts/${wd.id}`}
            target="_blank" rel="noreferrer"
            className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Download signed receipt
          </a>
        </div>
      )}

      {searchParams.error && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-800">
          {searchParams.error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Status</CardTitle></CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Row label="Lot"           value={wd.lots?.lot_code} mono />
            <Row label="SKU"           value={wd.lots?.skus?.name} />
            <Row label="Requested"     value={formatQty(wd.requested_qty, wd.lots?.skus?.unit_of_measure)} />
            <Row label="Lot remaining" value={formatQty(wd.lots?.on_hand_qty, wd.lots?.skus?.unit_of_measure)} />
            <Row label="Created"       value={formatDateTime(wd.created_at)} />
            <Row label="Approved"      value={formatDateTime(wd.approved_at)} />
            <Row label="Released"      value={formatDateTime(wd.released_at)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acknowledge & release</CardTitle>
            <CardDescription>
              {wd.status === "awaiting_ack"
                ? "Enter the release code we just emailed you."
                : "This panel becomes active once an operator approves your request."}
            </CardDescription>
          </CardHeader>
          <CardBody>
            {wd.status === "awaiting_ack" ? (
              <form action={acknowledgeWithdrawal} className="space-y-4">
                <input type="hidden" name="withdrawal_id" value={wd.id} />
                <div>
                  <Label htmlFor="otp">Release code</Label>
                  <Input
                    id="otp" name="otp" required
                    placeholder="6-digit code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    className="font-mono text-lg tracking-widest text-center"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Code expires {formatDateTime(wd.otp_expires_at)}.
                  </p>
                </div>
                <Button type="submit" size="lg" className="w-full">Acknowledge & release goods</Button>
                <p className="text-xs text-slate-500 text-center">
                  Tip for the demo: an operator can also see this code on their screen.
                </p>
              </form>
            ) : (
              <div className="text-sm text-slate-600">Current state: <StatusBadge status={wd.status} /></div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Audit trail (this withdrawal)</CardTitle></CardHeader>
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
