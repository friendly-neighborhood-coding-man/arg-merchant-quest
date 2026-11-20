"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SubmitForReview({
  campaignId,
  variant = "primary",
  label = "Submit for review",
}: {
  campaignId: string;
  variant?: "primary" | "ghost";
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/submit`, { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not submit this campaign.");
        setBusy(false);
        return;
      }
      setDone(true);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Network error — the campaign was not submitted.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="chip border-amber/40 bg-amber/10 text-amber-soft">
        Sent to operator review
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className={variant === "primary" ? "btn-primary" : "btn-ghost"}
      >
        {busy ? "Submitting…" : label}
      </button>
      {error ? <span className="text-[11px] text-rust">{error}</span> : null}
    </span>
  );
}
