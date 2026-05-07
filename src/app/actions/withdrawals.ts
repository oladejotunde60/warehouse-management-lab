"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendEmail, otpEmailHtml } from "@/lib/email";

export async function requestWithdrawal(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const lot_id = String(formData.get("lot_id") ?? "");
  const qty    = Number(formData.get("requested_qty") ?? 0);
  const notes  = String(formData.get("notes") ?? "").trim() || null;

  if (!lot_id || !qty || qty <= 0) {
    redirect(`/customer/withdraw?error=${encodeURIComponent("Pick a lot and enter a quantity > 0")}`);
  }

  // Look up tenant_id from lot to satisfy RLS check
  const { data: lot, error: lotErr } = await supabase
    .from("lots").select("tenant_id, on_hand_qty").eq("id", lot_id).single();
  if (lotErr || !lot) redirect(`/customer/withdraw?error=${encodeURIComponent("Lot not found")}`);
  if (qty > Number(lot.on_hand_qty)) {
    redirect(`/customer/withdraw?error=${encodeURIComponent(`Only ${lot.on_hand_qty} available`)}`);
  }

  const { data, error } = await supabase
    .from("withdrawals")
    .insert({
      tenant_id: lot.tenant_id,
      lot_id,
      requested_qty: qty,
      requested_by: user.id,
      notes,
    })
    .select("id")
    .single();

  if (error) redirect(`/customer/withdraw?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/customer");
  revalidatePath("/operator/withdrawals");
  redirect(`/customer/withdrawals/${data!.id}`);
}

export async function approveWithdrawal(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("withdrawal_id") ?? "");
  const svc = createServiceClient();

  const { data: result, error } = await svc.rpc("approve_withdrawal", {
    p_withdrawal_id: id,
    p_approver: user.id,
  });
  if (error) redirect(`/operator/withdrawals/${id}?error=${encodeURIComponent(error.message)}`);

  // Send OTP via email if Resend configured (also visible in UI)
  const otp = (result as any)?.otp as string | undefined;
  if (otp) {
    const { data: w } = await svc
      .from("withdrawals")
      .select(`
        requested_qty,
        lots ( lot_code, skus ( name, unit_of_measure ) ),
        profiles!withdrawals_requested_by_fkey ( full_name )
      `)
      .eq("id", id).maybeSingle();
    const { data: requester } = await svc.auth.admin.getUserById(
      (await svc.from("withdrawals").select("requested_by").eq("id", id).single()).data!.requested_by!
    );
    const recipientEmail = requester?.user?.email;
    const recipientName  = (w as any)?.profiles?.full_name ?? recipientEmail ?? "customer";
    const lotCode = (w as any)?.lots?.lot_code ?? "";
    const skuName = (w as any)?.lots?.skus?.name ?? "";
    const unit    = (w as any)?.lots?.skus?.unit_of_measure ?? "unit";
    const qty     = Number((w as any)?.requested_qty ?? 0);
    if (recipientEmail) {
      await sendEmail({
        to: recipientEmail,
        subject: `Release code for ${lotCode}`,
        html: otpEmailHtml({ recipient: recipientName, otp, lotCode: `${lotCode} (${skuName})`, qty, unit }),
      });
    }
  }

  revalidatePath("/operator/withdrawals");
  revalidatePath(`/operator/withdrawals/${id}`);
  revalidatePath("/customer");
  redirect(`/operator/withdrawals/${id}`);
}

export async function rejectWithdrawal(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("withdrawal_id") ?? "");
  const reason = String(formData.get("reason") ?? "rejected by operator");
  const svc = createServiceClient();
  const { error } = await svc.rpc("reject_withdrawal", {
    p_withdrawal_id: id, p_actor: user.id, p_reason: reason,
  });
  if (error) redirect(`/operator/withdrawals/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/operator/withdrawals");
  redirect(`/operator/withdrawals/${id}`);
}

export async function acknowledgeWithdrawal(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("withdrawal_id") ?? "");
  const otp = String(formData.get("otp") ?? "").trim();

  const svc = createServiceClient();
  const { error } = await svc.rpc("acknowledge_withdrawal", {
    p_withdrawal_id: id, p_otp: otp, p_actor: user.id,
  });
  if (error) {
    redirect(`/customer/withdrawals/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/customer");
  revalidatePath("/operator/withdrawals");
  redirect(`/customer/withdrawals/${id}?released=1`);
}
