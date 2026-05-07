// Resend wrapper with a console fallback when no API key is set.
// In demo mode without Resend, OTPs are still shown in the UI; this just adds
// real email when configured.
type SendArgs = { to: string; subject: string; html: string };

export async function sendEmail({ to, subject, html }: SendArgs): Promise<{ ok: boolean; via: "resend" | "console" }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email:console] to=${to} subject=${subject}`);
    console.log(html);
    return { ok: true, via: "console" };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
      to, subject, html,
    });
    return { ok: true, via: "resend" };
  } catch (e) {
    console.error("[email:resend] failed, falling back to console:", e);
    console.log(`[email:console] to=${to} subject=${subject}`);
    console.log(html);
    return { ok: false, via: "console" };
  }
}

export function otpEmailHtml(args: {
  recipient: string; otp: string; lotCode: string; qty: number; unit: string;
}) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px">Withdrawal release code</h2>
    <p style="color:#475569;margin:0 0 24px">Hello ${args.recipient}, present this code at the warehouse dock to release your goods.</p>
    <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:12px;padding:24px;text-align:center">
      <div style="font-size:14px;color:#64748b;margin-bottom:8px;letter-spacing:1px">RELEASE CODE</div>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a">${args.otp}</div>
    </div>
    <table style="width:100%;margin-top:24px;font-size:14px;color:#334155">
      <tr><td style="padding:6px 0">Lot</td><td style="text-align:right;font-weight:600">${args.lotCode}</td></tr>
      <tr><td style="padding:6px 0">Quantity</td><td style="text-align:right;font-weight:600">${args.qty} ${args.unit}</td></tr>
      <tr><td style="padding:6px 0">Expires</td><td style="text-align:right">in 4 hours</td></tr>
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">If you did not request this withdrawal, contact warehouse operations immediately.</p>
  </div>`;
}
