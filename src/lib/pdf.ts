import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type ReceiptInput = {
  kind: "intake" | "issue";
  tenantName: string;
  lotCode: string;
  skuName: string;
  qty: number;
  unit: string;
  remaining: number;
  occurredAt: string;
  actor: string;
  withdrawalId?: string;
  reference: string;
};

export async function buildReceiptPdf(r: ReceiptInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width } = page.getSize();
  const font  = await pdf.embedFont(StandardFonts.Helvetica);
  const bold  = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono  = await pdf.embedFont(StandardFonts.Courier);

  const navy = rgb(0.05, 0.15, 0.35);
  const slate = rgb(0.27, 0.33, 0.4);
  const sky = rgb(0.02, 0.52, 0.78);

  // Header bar
  page.drawRectangle({ x: 0, y: 791, width, height: 51, color: navy });
  page.drawText("TOOTECHY IT PROFESSIONAL SERVICES", {
    x: 32, y: 818, size: 13, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText("Warehouse Management Solution", {
    x: 32, y: 805, size: 9, font, color: rgb(0.85, 0.92, 1),
  });
  page.drawText(r.kind === "intake" ? "GOODS RECEIPT" : "GOODS RELEASE", {
    x: width - 32 - (r.kind === "intake" ? 95 : 90), y: 812, size: 12, font: bold, color: rgb(1, 1, 1),
  });

  // Tenant
  page.drawText(r.tenantName, { x: 32, y: 750, size: 14, font: bold, color: navy });

  // Body labels
  const y0 = 700;
  const rows: Array<[string, string]> = [
    ["Reference",      r.reference],
    ["Lot code",       r.lotCode],
    ["SKU",            r.skuName],
    [r.kind === "intake" ? "Quantity received" : "Quantity released",
                       `${r.qty} ${r.unit}`],
    ["Remaining on hand", `${r.remaining} ${r.unit}`],
    ["Date / time",    r.occurredAt],
    ["Operator",       r.actor],
  ];
  if (r.withdrawalId) rows.push(["Withdrawal ID", r.withdrawalId]);

  rows.forEach(([k, v], i) => {
    const y = y0 - i * 22;
    page.drawText(k, { x: 32, y, size: 10, font, color: slate });
    page.drawText(v, { x: 220, y, size: 11, font: bold, color: navy });
  });

  // Signature line
  const sigY = y0 - rows.length * 22 - 40;
  page.drawText("Customer acknowledgement", { x: 32, y: sigY, size: 10, font, color: slate });
  page.drawLine({
    start: { x: 32, y: sigY - 30 }, end: { x: 280, y: sigY - 30 },
    thickness: 0.5, color: slate,
  });
  page.drawText("Signature / OTP-confirmed", { x: 32, y: sigY - 44, size: 8, font, color: slate });

  page.drawText("Operator signature", { x: 320, y: sigY, size: 10, font, color: slate });
  page.drawLine({
    start: { x: 320, y: sigY - 30 }, end: { x: 560, y: sigY - 30 },
    thickness: 0.5, color: slate,
  });

  // Footer
  page.drawText("This receipt is part of an append-only, hash-anchored audit ledger.", {
    x: 32, y: 72, size: 9, font, color: slate,
  });
  page.drawText("Issued by Tootechy IT Professional Services on behalf of warehouse operations.", {
    x: 32, y: 58, size: 8, font, color: slate,
  });
  page.drawText(`Document ref: ${r.reference}`, {
    x: 32, y: 42, size: 9, font: mono, color: sky,
  });

  return pdf.save();
}
