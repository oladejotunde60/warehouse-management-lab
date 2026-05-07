export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatQty(n: number | string, unit?: string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  const fmt = num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
  return unit ? `${fmt} ${unit}` : fmt;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function statusColor(status: string): string {
  switch (status) {
    case "released":
    case "acknowledged":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200";
    case "awaiting_ack":
    case "approved":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "requested":
      return "bg-sky-100 text-sky-800 ring-1 ring-sky-200";
    case "rejected":
    case "ack_timeout":
    case "cancelled":
      return "bg-rose-100 text-rose-800 ring-1 ring-rose-200";
    default:
      return "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
  }
}
