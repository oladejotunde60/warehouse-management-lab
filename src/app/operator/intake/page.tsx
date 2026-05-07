import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { IntakeForm } from "@/components/IntakeForm";

export default async function IntakePage({
  searchParams,
}: {
  searchParams: {
    error?: string;
    customer_id?: string;
    sku_id?: string;
    onboarded?: string;
    sku_added?: string;
  };
}) {
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
        Receive goods at the dock. Onboard a new customer or add a new SKU on the spot if needed —
        no need to leave this page.
      </p>

      {searchParams.error && (
        <div className="mb-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-800">
          {searchParams.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Goods receipt</CardTitle>
          <CardDescription>
            Pick the customer and SKU, or use "+ New" to add either inline.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <IntakeForm
            tenants={tenants ?? []}
            skus={(skus ?? []) as any}
            initialTenantId={searchParams.customer_id}
            initialSkuId={searchParams.sku_id}
            onboarded={Boolean(searchParams.onboarded)}
            skuAdded={Boolean(searchParams.sku_added)}
          />
        </CardBody>
      </Card>
    </div>
  );
}
