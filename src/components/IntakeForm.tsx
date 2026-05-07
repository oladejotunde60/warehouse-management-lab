"use client";

import { useMemo, useState } from "react";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createIntake } from "@/app/actions/intake";
import { createTenant, createSku } from "@/app/actions/onboarding";

type Tenant = { id: string; name: string };
type Sku = {
  id: string;
  code: string;
  name: string;
  tenant_id: string;
  unit_of_measure: string;
};

type Props = {
  tenants: Tenant[];
  skus: Sku[];
  initialTenantId?: string;
  initialSkuId?: string;
  onboarded?: boolean;
  skuAdded?: boolean;
};

export function IntakeForm({
  tenants, skus, initialTenantId, initialSkuId, onboarded, skuAdded,
}: Props) {
  const [tenantId, setTenantId] = useState(initialTenantId ?? "");
  const [skuId, setSkuId] = useState(initialSkuId ?? "");
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [showAddSku, setShowAddSku] = useState(false);

  const filteredSkus = useMemo(
    () => skus.filter((s) => s.tenant_id === tenantId),
    [skus, tenantId]
  );
  const selectedTenantName = tenants.find(t => t.id === tenantId)?.name;

  return (
    <>
      {onboarded && (
        <div className="mb-4 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-sm text-emerald-800">
          New customer added. They're pre-selected below — add their first SKU next, or pick an existing one.
        </div>
      )}
      {skuAdded && (
        <div className="mb-4 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-sm text-emerald-800">
          SKU added and pre-selected. Fill in the lot code and quantity to complete the intake.
        </div>
      )}

      {/* Inline: add new customer */}
      {showAddTenant && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4 mb-5">
          <h4 className="font-semibold text-slate-900 mb-3">Onboard a new customer</h4>
          <form action={createTenant} className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="new_tenant_name">Company name</Label>
              <Input id="new_tenant_name" name="name" required placeholder="e.g., Acme Foods Ltd" autoFocus />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Create customer</Button>
              <Button type="button" variant="ghost" onClick={() => setShowAddTenant(false)}>Cancel</Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Creates a tenant in the system. You can add their SKUs immediately after.
          </p>
        </div>
      )}

      {/* Inline: add new SKU for selected customer */}
      {showAddSku && tenantId && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4 mb-5">
          <h4 className="font-semibold text-slate-900 mb-3">
            Add SKU for <span className="text-brand-700">{selectedTenantName}</span>
          </h4>
          <form action={createSku} className="space-y-3">
            <input type="hidden" name="tenant_id" value={tenantId} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new_sku_code">Code</Label>
                <Input id="new_sku_code" name="code" required placeholder="RICE-50KG" autoFocus />
              </div>
              <div>
                <Label htmlFor="new_sku_uom">Unit of measure</Label>
                <Input id="new_sku_uom" name="unit_of_measure" defaultValue="unit" placeholder="bag, drum, kg, …" />
              </div>
            </div>
            <div>
              <Label htmlFor="new_sku_name">Description</Label>
              <Input id="new_sku_name" name="name" required placeholder="Premium Basmati Rice 50kg bag" />
            </div>
            <div>
              <Label htmlFor="new_sku_tags">Tags (comma-separated, optional)</Label>
              <Input id="new_sku_tags" name="tags" placeholder="cold-chain, hazardous, high-value" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit">Create SKU</Button>
              <Button type="button" variant="ghost" onClick={() => setShowAddSku(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <form action={createIntake} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="tenant_id">Customer (depositor)</Label>
            <button
              type="button"
              onClick={() => setShowAddTenant(true)}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              + New customer
            </button>
          </div>
          <Select
            id="tenant_id"
            name="tenant_id"
            required
            value={tenantId}
            onChange={(e) => { setTenantId(e.target.value); setSkuId(""); }}
          >
            <option value="">Select customer…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          {tenants.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              No customers yet. Click "+ New customer" above to onboard one.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="sku_id">SKU</Label>
            {tenantId && (
              <button
                type="button"
                onClick={() => setShowAddSku(true)}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                + New SKU for this customer
              </button>
            )}
          </div>
          <Select
            id="sku_id"
            name="sku_id"
            required
            value={skuId}
            onChange={(e) => setSkuId(e.target.value)}
            disabled={!tenantId}
          >
            <option value="">{tenantId ? "Select SKU…" : "Select a customer first"}</option>
            {filteredSkus.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </Select>
          {tenantId && filteredSkus.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              This customer has no SKUs yet. Click "+ New SKU" above to add their first one.
            </p>
          )}
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

        <Button type="submit" size="lg" className="w-full" disabled={!tenantId || !skuId}>
          Receive goods
        </Button>
      </form>
    </>
  );
}
