import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { requestWithdrawal } from "@/app/actions/withdrawals";
import { formatQty } from "@/lib/utils";

export default async function WithdrawPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role, tenant_id").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "operator") redirect("/operator");
  if (!profile?.tenant_id) redirect("/customer");

  const { data: lots } = await supabase
    .from("lots")
    .select(`id, lot_code, on_hand_qty, skus(name, unit_of_measure)`)
    .eq("tenant_id", profile.tenant_id)
    .gt("on_hand_qty", 0)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900">Request a withdrawal</h1>
      <p className="text-sm text-slate-500 mb-6">
        Pick a lot and the quantity you want to collect. An operator will approve, you'll get a one-time release code by email,
        and goods are released only after you enter that code.
      </p>

      {searchParams.error && (
        <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-800">
          {searchParams.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New withdrawal</CardTitle>
          <CardDescription>You can request any quantity up to the on-hand balance.</CardDescription>
        </CardHeader>
        <CardBody>
          <form action={requestWithdrawal} className="space-y-4">
            <div>
              <Label htmlFor="lot_id">Lot</Label>
              <Select id="lot_id" name="lot_id" required>
                <option value="">Select lot…</option>
                {(lots ?? []).map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.lot_code} — {l.skus?.name} ({formatQty(l.on_hand_qty, l.skus?.unit_of_measure)} available)
                  </option>
                ))}
              </Select>
              {(!lots || lots.length === 0) && (
                <p className="mt-1 text-xs text-rose-700">You have no lots with available stock.</p>
              )}
            </div>

            <div>
              <Label htmlFor="requested_qty">Quantity</Label>
              <Input id="requested_qty" name="requested_qty" type="number" step="0.001" min="0.001" required />
              <p className="mt-1 text-xs text-slate-500">Partial withdrawals allowed — you can come back for the rest later.</p>
            </div>

            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" name="notes" placeholder="Pickup driver: John, truck XYZ-123" />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={!lots || lots.length === 0}>
              Submit request
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
