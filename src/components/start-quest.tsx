"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartQuest({ slug, label = "Start the quest" }: { slug: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/quests/${slug}/start`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "The quest could not be started.");
        setBusy(false);
        return;
      }
      router.push(`/quests/${slug}/play`);
      router.refresh();
    } catch {
      setError("Network error — the quest was not started.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void start()} disabled={busy} className="btn-primary w-full sm:w-auto">
        {busy ? "Starting…" : label}
      </button>
      {error ? <p className="mt-2 text-[12.5px] text-rust">{error}</p> : null}
    </div>
  );
}
