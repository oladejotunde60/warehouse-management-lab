import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildReceiptPdf } from "@/lib/pdf";
import { formatDateTime } from "@/lib/utils";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Use service client so we can join freely; access control = withdrawal must be visible to user via RLS check.
  const { data: visible } = await supabase
    .from("withdrawals").select("id").eq("id", params.id).maybeSingle();
  if (!visible) return NextResponse.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { data: w, error } = await svc
    .from("withdrawals")
    .select(`
      id, requested_qty, released_at, acknowledged_at,
      lots ( lot_code, on_hand_qty, skus ( name, unit_of_measure ) ),
      tenants ( name )
    `)
    .eq("id", params.id).maybeSingle();
  if (error || !w) return NextResponse.json({ error: "not found" }, { status: 404 });

  const wd = w as any;
  const issuedAt = wd.released_at ?? wd.acknowledged_at ?? new Date().toISOString();

  const pdf = await buildReceiptPdf({
    kind: "issue",
    tenantName: wd.tenants?.name ?? "—",
    lotCode: wd.lots?.lot_code ?? "—",
    skuName: wd.lots?.skus?.name ?? "—",
    qty: Number(wd.requested_qty ?? 0),
    unit: wd.lots?.skus?.unit_of_measure ?? "unit",
    remaining: Number(wd.lots?.on_hand_qty ?? 0),
    occurredAt: formatDateTime(issuedAt),
    actor: "Warehouse operations",
    withdrawalId: wd.id,
    reference: `RCPT-${wd.id.slice(0, 8).toUpperCase()}`,
  });

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${wd.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
