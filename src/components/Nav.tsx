import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export async function Nav() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: string | null = null;
  let name: string | null = null;
  let tenantName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("full_name, role, tenants(name)")
      .eq("user_id", user.id).maybeSingle();
    if (profile) {
      role = (profile as any).role;
      name = (profile as any).full_name;
      tenantName = (profile as any).tenants?.name ?? null;
    }
  }

  const isOp = role === "operator";
  const homeHref = isOp ? "/operator" : role ? "/customer" : "/";

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white text-sm font-bold">W</span>
          Warehouse Lab
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {role === "operator" && (
            <>
              <Link href="/operator" className="text-slate-600 hover:text-slate-900">Dashboard</Link>
              <Link href="/operator/intake" className="text-slate-600 hover:text-slate-900">Intake</Link>
              <Link href="/operator/withdrawals" className="text-slate-600 hover:text-slate-900">Withdrawals</Link>
            </>
          )}
          {(role === "customer_admin" || role === "customer_user") && (
            <>
              <Link href="/customer" className="text-slate-600 hover:text-slate-900">My Stock</Link>
              <Link href="/customer/withdraw" className="text-slate-600 hover:text-slate-900">Request Withdrawal</Link>
            </>
          )}
          {user ? (
            <div className="flex items-center gap-3 pl-4 ml-2 border-l border-slate-200">
              <div className="text-right leading-tight">
                <div className="text-sm font-medium text-slate-900">{name}</div>
                <div className="text-xs text-slate-500">
                  {tenantName ?? (isOp ? "Warehouse staff" : "")}
                </div>
              </div>
              <form action={signOut}>
                <button className="text-xs text-slate-500 hover:text-slate-900 underline">Sign out</button>
              </form>
            </div>
          ) : (
            <Link href="/login" className="text-brand-600 font-medium">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
