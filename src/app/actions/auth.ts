"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();

  revalidatePath("/", "layout");
  if (profile?.role === "operator") redirect("/operator");
  redirect("/customer");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "customer_admin");
  const tenantName = String(formData.get("tenant_name") ?? "").trim();

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    redirect(`/signup?error=${encodeURIComponent(error?.message ?? "signup failed")}`);
  }

  // For demo simplicity: create tenant inline if customer signup
  let tenant_id: string | null = null;
  if (role !== "operator" && tenantName) {
    const { data: t, error: tErr } = await supabase
      .from("tenants").insert({ name: tenantName }).select("id").single();
    if (tErr) redirect(`/signup?error=${encodeURIComponent(tErr.message)}`);
    tenant_id = t!.id;
  }

  const { error: pErr } = await supabase.from("profiles").insert({
    user_id: data.user!.id,
    tenant_id,
    full_name: fullName || email.split("@")[0],
    role,
  });
  if (pErr) redirect(`/signup?error=${encodeURIComponent(pErr.message)}`);

  revalidatePath("/", "layout");
  redirect(role === "operator" ? "/operator" : "/customer");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
