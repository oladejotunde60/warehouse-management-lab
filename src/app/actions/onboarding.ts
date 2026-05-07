"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function requireOperator() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "operator") redirect("/customer");
  return user;
}

export async function createTenant(formData: FormData) {
  await requireOperator();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/operator/intake?error=${encodeURIComponent("Company name is required")}`);
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("tenants").insert({ name }).select("id").single();
  if (error) {
    redirect(`/operator/intake?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/operator/intake");
  revalidatePath("/operator");
  redirect(`/operator/intake?customer_id=${data!.id}&onboarded=1`);
}

export async function createSku(formData: FormData) {
  await requireOperator();

  const tenant_id = String(formData.get("tenant_id") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const unit_of_measure = String(formData.get("unit_of_measure") ?? "unit").trim() || "unit";
  const tags = String(formData.get("tags") ?? "")
    .split(",").map(t => t.trim()).filter(Boolean);

  if (!tenant_id || !code || !name) {
    redirect(`/operator/intake?customer_id=${tenant_id}&error=${encodeURIComponent("SKU code and name are required")}`);
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("skus")
    .insert({ tenant_id, code, name, unit_of_measure, tags })
    .select("id").single();
  if (error) {
    redirect(`/operator/intake?customer_id=${tenant_id}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/operator/intake");
  redirect(`/operator/intake?customer_id=${tenant_id}&sku_id=${data!.id}&sku_added=1`);
}
