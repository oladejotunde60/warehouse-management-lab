import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatQty } from "@/lib/utils";
import Link from "next/link";

export default async function WithdrawalsList() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "operator") redirect("/customer");

  const { data: wds } = await supabase.from("withdrawals")
    .select(`
      id, status, requested_qty, created_at, otp_code,
      lots ( lot_code, skus ( name, unit_of_measure ) ),
      tenants ( name )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">All withdrawals</h1>
        <p className="text-sm text-slate-500">Live queue across tenants.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Recent 50</CardTitle></CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-6 py-2 font-medium">Created</th>
                <th className="text-left px-6 py-2 font-medium">Tenant</th>
                <th className="text-left px-6 py-2 font-medium">Lot · SKU</th>
                <th className="text-right px-6 py-2 font-medium">Qty</th>
                <th className="text-left px-6 py-2 font-medium">Status</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(wds ?? []).map((w: any) => (
                <tr key={w.id} className="border-t border-slate-100">
                  <td className="px-6 py-3 text-slate-600">{formatDateTime(w.created_at)}</td>
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
              {(!wds || wds.length === 0) && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">No withdrawals yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
