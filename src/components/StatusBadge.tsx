import { statusColor } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor(status)}`}>
      {label}
    </span>
  );
}
