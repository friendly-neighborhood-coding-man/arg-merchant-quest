import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDemoPage } from "@/lib/demo-pages";

type PageProps = { params: Promise<{ merchant: string; page: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { merchant, page } = await params;
  const content = getDemoPage(merchant, page);
  return { title: content ? `${content.title} — demo source` : "Demo source" };
}

/**
 * The clue links in the seed point here instead of a real social account,
 * because the merchants are fictional. The page is styled like the hosted
 * source it stands in for, and says plainly that it is fictional.
 */
export default async function DemoSourcePage({ params }: PageProps) {
  const { merchant, page } = await params;
  const content = getDemoPage(merchant, page);
  if (!content) notFound();

  return (
    <div className="wrap max-w-2xl space-y-5 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/quests" className="text-[12px] text-sage/60 hover:text-amber-soft">
          ← Back to discovery
        </Link>
        <span className="chip border-amber/40 bg-amber/10 text-amber-soft">Fictional demo page</span>
      </div>

      <div className="rounded-2xl border border-amber/25 bg-amber/5 px-4 py-3">
        <p className="text-[12px] leading-relaxed text-amber-soft/85">
          This page stands in for a hosted source on the fictional merchant{" "}
          <span className="text-white/90">{content.merchant}</span>. No real social account or website
          exists; the content is written for the demo trail.
        </p>
      </div>

      <article className="panel overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line/60 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-ink/70 text-amber">
            ◈
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-white/90">{content.handle}</p>
            <p className="font-mono text-[10px] tracking-[0.14em] text-sage/45 uppercase">
              {content.kind} · {content.posted}
            </p>
          </div>
        </header>

        <div className="space-y-3 px-5 py-5">
          <h1 className="font-display text-2xl leading-snug text-white/95">{content.title}</h1>
          {content.body.map((paragraph) => (
            <p key={paragraph} className="text-[14px] leading-relaxed text-sage/85">
              {paragraph}
            </p>
          ))}
        </div>

        {content.footer ? (
          <footer className="border-t border-line/60 px-5 py-3 text-[11.5px] text-sage/45">
            {content.footer}
          </footer>
        ) : null}
      </article>

      <p className="pb-6 text-center text-[11px] leading-relaxed text-sage/40">
        Keep this tab open and return to the quest in the other tab. Nothing on this page is measured
        or verified.
      </p>
    </div>
  );
}
