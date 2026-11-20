"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/quests", label: "Discover", eyebrow: "Player" },
  { href: "/merchant", label: "Studio", eyebrow: "Merchant" },
  { href: "/operator", label: "Console", eyebrow: "Operator" },
  { href: "/staff", label: "Counter", eyebrow: "Staff" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
      <div className="wrap flex h-16 items-center justify-between gap-3">
        <Link href="/" className="group flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber/45 bg-amber/10 text-lg text-amber transition group-hover:bg-amber/15">
            ◈
          </span>
          <span className="leading-tight">
            <span className="block font-display text-[15px] tracking-tight text-white/90">
              ARG Merchant Quest
            </span>
            <span className="mono-label block text-[9px]">solana devnet demo</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="-mr-1 flex items-center gap-1 overflow-x-auto py-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "group flex shrink-0 flex-col rounded-lg px-3 py-1.5 leading-tight transition",
                  active
                    ? "bg-amber/10 text-amber-soft"
                    : "text-sage/75 hover:bg-white/5 hover:text-white/90",
                ].join(" ")}
              >
                <span className="font-mono text-[9px] tracking-[0.16em] uppercase opacity-60">
                  {item.eyebrow}
                </span>
                <span className="text-[13px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
