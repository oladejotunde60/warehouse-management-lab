import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { signIn } from "@/app/actions/auth";
import Link from "next/link";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-md mx-auto py-8">
      <Card>
        <CardBody>
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use a demo account or your own.</p>

          {searchParams.error && (
            <div className="mt-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-800">
              {searchParams.error}
            </div>
          )}

          <form action={signIn} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" size="lg">Sign in</Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            New here? <Link href="/signup" className="text-brand-600 font-medium">Create an account</Link>
          </p>

          <div className="mt-6 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-xs text-slate-600">
            <div className="font-semibold text-slate-700 mb-1">Demo logins</div>
            <div>ops@warehouse.demo / demo1234 (operator)</div>
            <div>alice@acmefoods.demo / demo1234 (customer)</div>
            <div>ben@globalpharma.demo / demo1234 (customer)</div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
