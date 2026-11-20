import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap flex min-h-[60vh] flex-col items-start justify-center gap-4">
      <p className="mono-label">Dead end</p>
      <h1 className="font-display text-4xl text-white/90">This trail does not exist</h1>
      <p className="max-w-xl text-[14px] leading-relaxed text-sage/70">
        The campaign may be a draft, waiting for review, or sent back to its merchant. Published
        quests are the only ones visible in discovery.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/quests" className="btn-primary">
          Browse live quests
        </Link>
        <Link href="/" className="btn-ghost">
          Back to start
        </Link>
      </div>
    </div>
  );
}
