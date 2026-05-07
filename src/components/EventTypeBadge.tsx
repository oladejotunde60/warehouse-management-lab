import { Badge } from "@/components/ui/Badge";
import type { EventType } from "@/lib/types";

const map: Record<EventType, { label: string; cls: string }> = {
  goods_received: { label: "Received",  cls: "bg-emerald-100 text-emerald-800" },
  goods_picked:   { label: "Picked",    cls: "bg-amber-100 text-amber-800" },
  goods_issued:   { label: "Released",  cls: "bg-sky-100 text-sky-800" },
  goods_returned: { label: "Returned",  cls: "bg-purple-100 text-purple-800" },
  goods_adjusted: { label: "Adjusted",  cls: "bg-slate-100 text-slate-800" },
};

export function EventTypeBadge({ type }: { type: EventType }) {
  const { label, cls } = map[type];
  return <Badge className={cls}>{label}</Badge>;
}
