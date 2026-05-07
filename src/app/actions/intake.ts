"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createIntake(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tenant_id = String(formData.get("tenant_id") ?? "");
  const sku_id    = String(formData.get("sku_id") ?? "");
  const lot_code  = String(formData.get("lot_code") ?? "").trim();
  const qty       = Number(formData.get("quantity") ?? 0);
  const expiry    = String(formData.get("expiry_date") ?? "") || null;
  const notes     = String(formData.get("notes") ?? "").trim() || null;

  if (!tenant_id || !sku_id || !lot_code || !qty || qty <= 0) {
    redirect(`/operator/intake?error=${encodeURIComponent("All required fields must be filled and quantity > 0")}`);
  }

  const svc = createServiceClient();
  const { data, error } = await svc.rpc("create_intake", {
    p_tenant_id: tenant_id,
    p_sku_id:    sku_id,
    p_lot_code:  lot_code,
    p_qty:       qty,
    p_expiry:    expiry,
    p_notes:     notes,
    p_actor:     user.id,
  });

  if (error) {
    redirect(`/operator/intake?error=${encodeURIComponent(error.message)}`);
  }

  const lotId = (data as { lot_id: string } | null)?.lot_id;
  revalidatePath("/operator");
  revalidatePath("/customer");
  redirect(`/operator?intake_ok=${encodeURIComponent(lotId ?? "")}`);
}
