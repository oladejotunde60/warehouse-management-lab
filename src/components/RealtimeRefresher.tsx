"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to lots/withdrawals/movement_events changes for the given tenant
 * and triggers a router.refresh() so server-rendered balances stay live.
 */
export function RealtimeRefresher({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supa = createClient();
    const ch = supa
      .channel(`tenant-${tenantId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "lots", filter: `tenant_id=eq.${tenantId}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "withdrawals", filter: `tenant_id=eq.${tenantId}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "movement_events", filter: `tenant_id=eq.${tenantId}` },
        () => router.refresh())
      .subscribe();
    return () => { supa.removeChannel(ch); };
  }, [tenantId, router]);

  return null;
}
