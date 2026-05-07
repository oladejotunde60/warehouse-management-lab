import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { signUp } from "@/app/actions/auth";
import Link from "next/link";

export default function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-md mx-auto py-8">
      <Card>
        <CardBody>
          <h1 className="text-xl font-semibold text-slate-900">Create account</h1>
          <p className="mt-1 text-sm text-slate-500">As a depositor, your company becomes a tenant.</p>

          {searchParams.error && (
            <div className="mt-4 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-800">
              {searchParams.error}
            </div>
          )}

          <form action={signUp} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="full_name">Your name</Label>
              <Input id="full_name" name="full_name" required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select id="role" name="role" defaultValue="customer_admin">
                <option value="customer_admin">Customer (depositor)</option>
                <option value="operator">Warehouse operator</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="tenant_name">Company name (depositors only)</Label>
              <Input id="tenant_name" name="tenant_name" placeholder="e.g., Acme Foods Ltd" />
            </div>
            <Button type="submit" className="w-full" size="lg">Create account</Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account? <Link href="/login" className="text-brand-600 font-medium">Sign in</Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
