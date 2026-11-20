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
      <div className="wrap flex flex-col gap-1.5 py-2.5 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-0">
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-amber/45 bg-amber/10 text-base text-amber transition group-hover:bg-amber/15 sm:h-9 sm:w-9 sm:text-lg">
            ◈
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[14px] tracking-tight text-white/90 sm:text-[15px]">
              ARG Merchant Quest
            </span>
            <span className="mono-label block text-[8.5px] sm:text-[9px]">solana devnet demo</span>
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="flex w-full items-center gap-0.5 overflow-x-auto sm:w-auto sm:shrink-0 sm:justify-end sm:gap-1 sm:py-1"
        >
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 leading-tight transition sm:items-start sm:px-3",
                  active
                    ? "bg-amber/10 text-amber-soft"
                    : "text-sage/75 hover:bg-white/5 hover:text-white/90",
                ].join(" ")}
              >
                <span className="hidden font-mono text-[9px] tracking-[0.16em] uppercase opacity-60 sm:block">
                  {item.eyebrow}
                </span>
                <span className="text-[12.5px] font-medium sm:text-[13px]">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
