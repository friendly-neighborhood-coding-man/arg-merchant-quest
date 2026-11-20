"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviewControls({
  campaignId,
  campaignTitle,
}: {
  campaignId: string;
  campaignTitle: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: "approve" | "reject") {
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Review could not be saved.");
        setBusy(null);
        return;
      }
      router.push(`/operator?reviewed=${decision}`);
      router.refresh();
    } catch {
      setError("Network error — the review was not saved.");
      setBusy(null);
    }
  }

  return (
    <div className="panel p-5">
      <p className="mono-label">Operator decision</p>
      <p className="mt-2 font-display text-lg leading-snug text-white/90">{campaignTitle}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-sage/60">
        Approving publishes the campaign to player discovery immediately. Rejecting sends it back
        to the merchant with your note.
      </p>

      <label className="label mt-4" htmlFor="review-note">
        Review note
      </label>
      <textarea
        id="review-note"
        className="input min-h-24 resize-y leading-relaxed"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Playable in-store spot confirmed. Reward copy is honest. Approved for the Devnet demo."
        maxLength={500}
      />
      <p className="mt-1 text-[11px] text-sage/45">
        Required when rejecting. Optional when approving.
      </p>

      {error ? <p className="mt-3 text-[12px] text-rust">{error}</p> : null}

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => review("approve")}
          disabled={busy !== null}
        >
          {busy === "approve" ? "Publishing…" : "Approve & publish"}
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={() => review("reject")}
          disabled={busy !== null}
        >
          {busy === "reject" ? "Sending back…" : "Reject with note"}
        </button>
      </div>
    </div>
  );
}
