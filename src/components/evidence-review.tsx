"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EvidenceReview({ evidenceId }: { evidenceId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch(`/api/evidence/${evidenceId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "The decision was not recorded.");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — the decision was not recorded.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 border-t border-line/60 pt-3">
      <label className="label" htmlFor={`note-${evidenceId}`}>
        Review note (required to reject)
      </label>
      <textarea
        id={`note-${evidenceId}`}
        className="input min-h-16 resize-y text-[13px]"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder="What did you check? If it is unreadable or the wrong object, say what to change."
      />
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void decide("approve")}
          disabled={busy !== null}
          className="btn-primary py-2 text-[12.5px]"
        >
          {busy === "approve" ? "Approving…" : "Approve completion"}
        </button>
        <button
          type="button"
          onClick={() => void decide("reject")}
          disabled={busy !== null || note.trim().length < 6}
          className="btn-danger py-2 text-[12.5px]"
        >
          {busy === "reject" ? "Sending back…" : "Reject evidence"}
        </button>
      </div>
      {error ? <p className="mt-2 text-[12px] text-rust">{error}</p> : null}
    </div>
  );
}
