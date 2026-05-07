import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createIntake } from "@/app/actions/intake";

export default async function IntakePage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "operator") redirect("/customer");

  const [{ data: tenants }, { data: skus }] = await Promise.all([
    supabase.from("tenants").select("id, name").order("name"),
    supabase.from("skus").select("id, code, name, tenant_id, unit_of_measure").order("code"),
  ]);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900">New intake</h1>
      <p className="text-sm text-slate-500 mb-6">
        Receive goods at the dock. This writes a <code className="font-mono text-xs bg-slate-100 px-1 rounded">GoodsReceived</code> event
        and creates a new lot in one transaction.
      </p>

      {searchParams.error && (
        <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-800">
          {searchParams.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Goods receipt</CardTitle>
          <CardDescription>Operator-only. Fill in customer, SKU, lot code, and quantity.</CardDescription>
        </CardHeader>
        <CardBody>
          <form action={createIntake} className="space-y-4">
            <div>
              <Label htmlFor="tenant_id">Customer (depositor)</Label>
              <Select id="tenant_id" name="tenant_id" required>
                <option value="">Select customer…</option>
                {(tenants ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="sku_id">SKU</Label>
              <Select id="sku_id" name="sku_id" required>
                <option value="">Select SKU…</option>
                {(skus ?? []).map((s) => (
                  <option key={s.id} value={s.id} data-tenant={s.tenant_id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">In production, this list is filtered by selected customer.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lot_code">Lot code</Label>
                <Input id="lot_code" name="lot_code" placeholder="LOT-2026-XXX" required />
              </div>
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" name="quantity" type="number" step="0.001" min="0.001" required />
              </div>
            </div>

            <div>
              <Label htmlFor="expiry_date">Expiry (optional)</Label>
              <Input id="expiry_date" name="expiry_date" type="date" />
            </div>

            <div>
              <Label htmlFor="notes">Notes / location (optional)</Label>
              <Input id="notes" name="notes" placeholder="Zone A, rack 12" />
            </div>

            <Button type="submit" size="lg" className="w-full">Receive goods</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
