import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "ARG Merchant Quest — real-world quests for local shops",
    template: "%s · ARG Merchant Quest",
  },
  description:
    "An ARG advertising platform for local merchants: clue trails, in-store finds, Devnet test rewards and demo-only secret-menu coupons.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex-1 pb-20">{children}</main>
        <footer className="border-t border-line/60">
          <div className="wrap flex flex-col gap-3 py-7 text-[12px] text-sage/55 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl leading-relaxed">
              Hackathon prototype. Devnet test credits only, no real money. All shops, staff and
              coupons in this build are fictional; coupons are demo entitlements and cannot be
              redeemed in a real business.
            </p>
            <div className="flex items-center gap-4">
              <Link href="/staff" className="hover:text-amber-soft">
                Staff counter
              </Link>
              <span aria-hidden className="text-line">
                ·
              </span>
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase">P1</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
