import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: {
    default: "Tootechy WMS — Warehouse Management Solution",
    template: "%s · Tootechy WMS",
  },
  description: "Tootechy IT Professional Services — custodial warehouse management: intake, partial withdrawals, OTP acknowledgement, audit-grade ledger.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
