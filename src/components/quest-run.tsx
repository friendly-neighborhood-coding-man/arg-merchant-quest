"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceKind } from "@/lib/types";
import type { QuestClueView, QuestView } from "@/lib/quest-store";
import { formatDateTime } from "@/lib/format";
import { RewardClaim, type RewardPanelData } from "./reward-claim";

const STEPS = ["Online trail", "In the shop", "The question", "Evidence", "Verified"];

function stepIndex(stage: QuestView["stage"]): number {
  switch (stage) {
    case "online":
      return 0;
    case "instore":
      return 1;
    case "answer":
      return 2;
    case "evidence":
    case "reviewing":
      return 3;
    case "complete":
      // Past the last step, so every step in the rail shows as completed.
      return STEPS.length;
    default:
      return 0;
  }
}

function mmss(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function useCountdown(serverSeconds: number): number {
  const [seconds, setSeconds] = useState(serverSeconds);
  useEffect(() => setSeconds(serverSeconds), [serverSeconds]);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((value) => (value > 0 ? value - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return seconds;
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: response.ok, error: response.ok ? undefined : (data.error ?? "That did not work.") };
  } catch {
    return { ok: false, error: "Network error — the quest did not move forward." };
  }
}

function StepRail({ stage }: { stage: QuestView["stage"] }) {
  const current = stepIndex(stage);
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex items-center gap-1.5">
            <span
              className={[
                "grid h-4 w-4 place-items-center rounded-full border text-[8px]",
                done
                  ? "border-mint/60 bg-mint/15 text-mint"
                  : active
                    ? "border-amber/60 bg-amber/15 text-amber"
                    : "border-line text-sage/35",
              ].join(" ")}
              aria-hidden
            >
              {done ? "✓" : index + 1}
            </span>
            <span
              className={[
                "text-[11px]",
                active ? "text-white/85" : done ? "text-sage/70" : "text-sage/40",
              ].join(" ")}
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ClueCard({ clue, index }: { clue: QuestClueView; index: number }) {
  return (
    <li className="panel-flat p-4">
      <div className="flex gap-3">
        <span className="mt-0.5 font-mono text-[11px] tracking-widest text-amber/70">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold text-white/90">{clue.title}</h4>
          <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-line text-sage/80">
            {clue.body}
          </p>
          {clue.url ? (
            <a
              className="link mt-2 inline-block text-[12.5px]"
              href={clue.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open the source ↗
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function HintCard({
  which,
  unlockInSeconds,
  text,
  onRequest,
  busy,
}: {
  which: number;
  unlockInSeconds: number;
  text: string | null;
  onRequest: () => void;
  busy: boolean;
}) {
  const remaining = useCountdown(unlockInSeconds);
  return (
    <div className="panel-flat p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="mono-label text-[9px]">Hint {which}</p>
        <span className="font-mono text-[9.5px] text-sage/40">
          {text ? "used" : remaining > 0 ? `in ${mmss(remaining)}` : "available"}
        </span>
      </div>
      {text ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-amber-soft/90">{text}</p>
      ) : remaining > 0 ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-sage/50">
          The counter is busy. This note unlocks {which === 1 ? "three" : "five"} minutes after you
          started, and refreshes do not reset the clock.
        </p>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          disabled={busy}
          className="btn-ghost mt-2 w-full py-2 text-[12.5px]"
        >
          {busy ? "Asking…" : "Ask the counter for this hint"}
        </button>
      )}
    </div>
  );
}

type Shot = { blob: Blob; url: string; kind: EvidenceKind };

type LocationState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "granted"; lat: number; lng: number; accuracy: number | null; at: string }
  | { status: "denied" }
  | { status: "unsupported" };

function EvidencePanel({ slug, evidence }: { slug: string; evidence: QuestView["evidence"] }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "live" | "blocked">("idle");
  const [shot, setShot] = useState<Shot | null>(null);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const shotRef = useRef<Shot | null>(null);
  shotRef.current = shot;

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (shotRef.current) URL.revokeObjectURL(shotRef.current.url);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [stream]);

  const replaceShot = useCallback((blob: Blob, kind: EvidenceKind) => {
    setShot((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { blob, url: URL.createObjectURL(blob), kind };
    });
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setCameraState("idle");
  }

  async function enableCamera() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraState("blocked");
      setError(
        "This browser does not expose an in-app camera. Upload a photo you took instead, or use the labelled demo simulation.",
      );
      return;
    }
    setCameraState("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = media;
      setStream(media);
      setCameraState("live");
    } catch {
      setCameraState("blocked");
      setError(
        "Camera permission was denied or no camera is attached. You can upload a photo, or use the clearly-labelled demo simulation below.",
      );
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const sourceWidth = video.videoWidth || 960;
    const sourceHeight = video.videoHeight || 720;
    const width = Math.min(sourceWidth, 1280);
    const height = Math.round(sourceHeight * (width / sourceWidth));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The capture could not be drawn. Try uploading a photo instead.");
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("The capture came back empty. Try again.");
          return;
        }
        replaceShot(blob, "camera");
        stopCamera();
      },
      "image/jpeg",
      0.86,
    );
  }

  function simulateCapture() {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#0b100c";
    context.fillRect(0, 0, 900, 1200);
    context.strokeStyle = "#f0b64f";
    context.lineWidth = 6;
    context.strokeRect(48, 48, 804, 1104);
    context.fillStyle = "#f0b64f";
    context.font = "bold 46px ui-monospace, monospace";
    context.fillText("SIMULATED CAPTURE", 96, 200);
    context.fillStyle = "#a7b6a9";
    context.font = "30px ui-monospace, monospace";
    const lines = [
      "No camera was used.",
      "This image exists so the demo",
      "can run without hardware.",
      "",
      "An operator must still review",
      "it, and it is not proof that",
      "anyone was in the shop.",
      "",
      new Date().toISOString().slice(0, 19).replace("T", " "),
    ];
    lines.forEach((line, index) => context.fillText(line, 96, 288 + index * 52));
    canvas.toBlob(
      (blob) => {
        if (blob) replaceShot(blob, "simulation");
      },
      "image/jpeg",
      0.9,
    );
  }

  function requestLocation() {
    setLocation({ status: "asking" });
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocation({ status: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          status: "granted",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          at: new Date().toISOString(),
        });
      },
      () => setLocation({ status: "denied" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function submit() {
    if (!shot) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.append("photo", shot.blob, shot.kind === "simulation" ? "simulated-capture.jpg" : "evidence.jpg");
    form.append("kind", shot.kind);
    form.append("capturedAt", new Date().toISOString());
    if (location.status === "granted") {
      form.append("latitude", String(location.lat));
      form.append("longitude", String(location.lng));
      if (location.accuracy !== null) form.append("accuracy", String(location.accuracy));
      form.append("locationAt", location.at);
    }

    try {
      const response = await fetch(`/api/quests/${slug}/evidence`, { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "The evidence was not accepted.");
        setSubmitting(false);
        return;
      }
      setShot(null);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Network error — the evidence was not submitted.");
      setSubmitting(false);
    }
  }

  const retryable = evidence?.status === "rejected";

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-label">Act three · evidence</p>
        <span className="chip border-line text-sage/60">Operator-reviewed</span>
      </div>
      <h2 className="mt-2 font-display text-2xl text-white/95">Show the counter the cup.</h2>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
        Take a photo in the app. Nothing here is auto-approved: a person on the operator side looks
        at your photo before the completion is verified. Camera and location are supporting evidence,
        not cryptographic proof of where you were.
      </p>

      {retryable ? (
        <div className="mt-4 rounded-xl border border-rust/40 bg-rust/10 px-4 py-3">
          <p className="text-[12.5px] font-semibold text-rust">The counter could not verify that photo</p>
          <p className="mt-1 text-[12px] leading-relaxed text-rust/85">
            {evidence?.reviewNote ?? "No note was left."}
          </p>
          <p className="mt-1 text-[11.5px] text-rust/65">Take a new photo and submit it again.</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {cameraState !== "live" ? (
          <button type="button" onClick={() => void enableCamera()} className="btn-primary py-2.5">
            {cameraState === "starting" ? "Opening camera…" : "Enable the in-app camera"}
          </button>
        ) : (
          <button type="button" onClick={capture} className="btn-primary py-2.5">
            Capture the photo
          </button>
        )}
        <label className="btn-ghost cursor-pointer py-2.5">
          Upload a photo instead
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) replaceShot(file, "upload");
            }}
          />
        </label>
      </div>

      {cameraState === "live" ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className="h-auto w-full" />
        </div>
      ) : null}

      {shot ? (
        <div className="mt-4 rounded-xl border border-line/80 bg-ink/50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt="The photo you are about to submit" className="w-full rounded-lg" />
          <p className="mt-2 text-[11.5px] text-sage/55">
            {shot.kind === "simulation"
              ? "Simulated capture — no camera was used. An operator still reviews it, and it does not prove anyone was in the shop."
              : shot.kind === "upload"
                ? "Uploaded photo — the operator sees that it came from your device, not from the in-app camera."
                : "Captured in the app just now."}
          </p>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-line/70 bg-ink-soft/60 p-4">
        <p className="text-[12.5px] font-semibold text-white/85">Location (optional, asked separately)</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-sage/60">
          Location helps the operator match your photo to the shop. It is stored with this submission
          and is never used as proof that you were physically present.
        </p>
        {location.status === "granted" ? (
          <p className="mt-2 font-mono text-[11px] text-mint">
            Included · {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            {location.accuracy !== null ? ` · ±${Math.round(location.accuracy)} m` : ""}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={requestLocation}
              className="btn-ghost py-1.5 text-[12px]"
              disabled={location.status === "asking"}
            >
              {location.status === "asking" ? "Asking…" : "Share my location"}
            </button>
            {location.status === "denied" ? (
              <span className="text-[11.5px] text-sage/55">
                Location denied. Your photo can still be reviewed.
              </span>
            ) : null}
            {location.status === "unsupported" ? (
              <span className="text-[11.5px] text-sage/55">
                This browser has no location support. Nothing else changes.
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-line/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={simulateCapture}
          className="text-left text-[11.5px] text-sage/45 underline decoration-line underline-offset-4 hover:text-sage/70"
        >
          No camera? Use a labelled demo simulation
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!shot || submitting}
          className="btn-primary py-2.5"
        >
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
      </div>

      {error ? <p className="mt-3 text-[12.5px] text-rust">{error}</p> : null}
    </section>
  );
}

function ExtendedMystery({ slug, view }: { slug: string; view: QuestView }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!view.extended.available) return null;

  async function reveal() {
    setBusy(true);
    setError(null);
    const result = await postJson(`/api/quests/${slug}/extended`, { action: "read" });
    setBusy(false);
    if (!result.ok) setError(result.error ?? null);
    else router.refresh();
  }

  async function submitAnswer() {
    setBusy(true);
    setError(null);
    const result = await postJson(`/api/quests/${slug}/extended`, { action: "answer", answer });
    setBusy(false);
    if (!result.ok) setError(result.error ?? null);
    else {
      setAnswer("");
      router.refresh();
    }
  }

  return (
    <section className="panel border-berry/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-label text-berry/80">Optional · the second question</p>
        <span className="chip border-berry/40 bg-berry/10 text-berry">
          {view.extended.solved ? "Solved" : `${view.extended.step}/3 opened`}
        </span>
      </div>
      <h2 className="mt-2 font-display text-2xl text-white/95">The letter was not the end of it.</h2>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
        The basic quest is finished. This trail is extra: one post, one page on the roastery&apos;s
        site, one thing you can only see in the shop. It unlocks a second achievement and makes you
        eligible for the demo coupon. It never changes the fixed reward.
      </p>

      {view.extended.clues.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {view.extended.clues.map((clue, index) => (
            <li key={clue.title} className="panel-flat p-4">
              <div className="flex gap-3">
                <span className="mt-0.5 font-mono text-[11px] text-berry/70">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-white/90">{clue.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-sage/80">{clue.body}</p>
                  {slug === "the-ninth-cup" && clue.title === "The post from 2019" ? (
                    <a
                      className="link mt-2 inline-block text-[12.5px]"
                      href="/demo/umbra-roasters/letter"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open the post ↗
                    </a>
                  ) : null}
                  {slug === "the-ninth-cup" && clue.title === "The roastery's about page" ? (
                    <a
                      className="link mt-2 inline-block text-[12.5px]"
                      href="/demo/umbra-roasters/about"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open the about page ↗
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {view.extended.step < 3 ? (
        <button
          type="button"
          onClick={() => void reveal()}
          disabled={busy}
          className="btn-ghost mt-3 w-full py-2.5 text-[13px]"
        >
          {busy ? "Opening…" : `Open part ${view.extended.step + 1} · ${view.extended.nextTitle ?? ""}`}
        </button>
      ) : null}

      {view.extended.hint ? (
        <p className="mt-3 rounded-xl border border-berry/20 bg-berry/5 px-3.5 py-2.5 text-[12px] leading-relaxed text-berry/90">
          {view.extended.hint}
        </p>
      ) : null}

      {view.extended.step >= 3 && !view.extended.solved ? (
        <div className="mt-4">
          <label className="label" htmlFor="extended-answer">
            {view.extended.question}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="extended-answer"
              className="input"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Your answer"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => void submitAnswer()}
              disabled={busy || answer.trim().length === 0}
              className="btn-primary shrink-0 py-2.5"
            >
              {busy ? "Checking…" : "Answer the letter"}
            </button>
          </div>
        </div>
      ) : null}

      {view.extended.solved ? (
        <div className="mt-4 rounded-xl border border-mint/40 bg-mint/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-mint">The second achievement is yours</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mint/85">
            You solved The Ninth Cup&apos;s extended mystery. Coupon eligibility is unlocked on your
            completion record; the coupon itself is issued in P0.4.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-[12.5px] text-rust">{error}</p> : null}
    </section>
  );
}

export function QuestRun({
  view,
  reward,
}: {
  view: QuestView;
  reward: RewardPanelData | null;
}) {
  const router = useRouter();
  const slug = view.campaign.slug;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(view.elapsedSeconds);

  useEffect(() => setElapsed(view.elapsedSeconds), [view.elapsedSeconds]);
  useEffect(() => {
    // The trail clock only runs until the operator verifies the completion.
    if (view.completion) return;
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [view.completion]);

  const hintOne = useCountdown(view.hints.one.unlockInSeconds);
  const hintTwo = useCountdown(view.hints.two.unlockInSeconds);

  useEffect(() => {
    if (view.stage !== "reviewing") return;
    const id = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(id);
  }, [view.stage, router]);

  async function act(action: "read-online" | "read-instore" | "hint-1" | "hint-2") {
    setBusy(action);
    setError(null);
    const result = await postJson(`/api/quests/${slug}/progress`, { action });
    setBusy(null);
    if (!result.ok) setError(result.error ?? null);
    else router.refresh();
  }

  async function submitAnswer() {
    setBusy("answer");
    setAnswerError(null);
    const result = await postJson(`/api/quests/${slug}/answer`, { answer });
    setBusy(null);
    if (!result.ok) {
      setAnswerError(result.error ?? "That answer was not accepted.");
      return;
    }
    setAnswer("");
    router.refresh();
  }

  const onlineComplete = view.trail.onlineRead >= view.trail.onlineTotal;
  const instoreComplete = view.trail.instoreRead >= view.trail.instoreTotal;
  const showEvidence = view.stage === "evidence" || view.stage === "reviewing" || view.stage === "complete";

  return (
    <div className="space-y-6">
      {view.completion ? (
        <div className="rounded-2xl border border-mint/40 bg-mint/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-mint">
            Quest verified — the counter approved your evidence.
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-mint/80">
            {view.completion.payoutStatus === "paid"
              ? `Your ${view.completion.rewardAmount}-credit reward was sent to ${view.completion.payout.wallet ?? "your Devnet wallet"}.`
              : view.completion.payoutStatus === "failed"
                ? `Your ${view.completion.rewardAmount}-credit reward is still unpaid — the last transfer failed. Retry it below.`
                : `Your ${view.completion.rewardAmount}-credit reward is unclaimed until you send it to a Devnet wallet below.`}{" "}
            {view.extended.solved ? "" : "The optional second question is still open."}
          </p>
        </div>
      ) : view.stage === "reviewing" ? (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-amber-soft">
            Evidence submitted — a person is checking it.
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-amber/80">
            This page will update on its own. Nothing is approved automatically.
          </p>
        </div>
      ) : null}

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mono-label text-[9px]">
              {view.campaign.shopName} · {view.campaign.shopArea}
            </p>
            <h1 className="mt-1 font-display text-3xl leading-tight text-white sm:text-4xl">
              {view.campaign.title}
            </h1>
          </div>
          <div className="text-right">
            <p className="mono-label text-[9px]">On this trail</p>
            <p className="mt-1 font-mono text-[13px] text-white/80">{mmss(elapsed)}</p>
            <p className="text-[10px] text-sage/40">
              {view.completion ? "stopped at verification" : "running"}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <StepRail stage={view.stage} />
        </div>
        <details className="mt-4 border-t border-line/60 pt-3">
          <summary className="cursor-pointer text-[12px] text-sage/60 hover:text-sage/85">
            The story so far
          </summary>
          <div className="mt-2 space-y-2 text-[13px] leading-relaxed whitespace-pre-line text-sage/75">
            {view.campaign.story}
          </div>
          <p className="mt-2 text-[11.5px] text-sage/45">
            Shop: {view.campaign.shopAddress}
          </p>
        </details>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mono-label">Act one · the online trail</p>
          <span className="chip border-line text-sage/60">
            {view.trail.onlineRead}/{view.trail.onlineTotal} read
          </span>
        </div>
        <h2 className="mt-2 font-display text-2xl text-white/95">
          {onlineComplete ? "The public trail is read." : "Read what the shop left out in public."}
        </h2>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
          Each source opens the next. Nothing is timed: the only clock on this trail is the optional
          hint at three minutes and five minutes.
        </p>

        {view.trail.online.length > 0 ? (
          <ol className="mt-4 space-y-2.5">
            {view.trail.online.map((clue, index) => (
              <ClueCard key={clue.id} clue={clue} index={index} />
            ))}
          </ol>
        ) : null}

        {!onlineComplete ? (
          <button
            type="button"
            onClick={() => void act("read-online")}
            disabled={busy !== null}
            className="btn-primary mt-4 w-full py-2.5 sm:w-auto"
          >
            {busy === "read-online"
              ? "Opening…"
              : `Read source ${view.trail.onlineRead + 1} of ${view.trail.onlineTotal}${
                  view.trail.nextOnlineTitle ? ` · ${view.trail.nextOnlineTitle}` : ""
                }`}
          </button>
        ) : (
          <p className="mt-3 text-[12.5px] text-mint/80">
            All {view.trail.onlineTotal} online sources read. The rest of this trail is inside the
            shop.
          </p>
        )}
      </section>

      {onlineComplete ? (
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="mono-label">Act two · in the shop</p>
            <span className="chip border-line text-sage/60">
              {view.trail.instoreRead}/{view.trail.instoreTotal} found
            </span>
          </div>
          <h2 className="mt-2 font-display text-2xl text-white/95">
            {instoreComplete ? "You have what the counter needs." : "Now go and look."}
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
            {view.campaign.shopAddress}. The shop has agreed to host this trail; please keep to the
            public counter area and do not move anything.
          </p>

          {view.trail.instore.length > 0 ? (
            <ol className="mt-4 space-y-2.5">
              {view.trail.instore.map((clue, index) => (
                <ClueCard key={clue.id} clue={clue} index={index} />
              ))}
            </ol>
          ) : null}

          {!instoreComplete ? (
            <button
              type="button"
              onClick={() => void act("read-instore")}
              disabled={busy !== null}
              className="btn-primary mt-4 w-full py-2.5 sm:w-auto"
            >
              {busy === "read-instore"
                ? "Looking…"
                : `I'm at the counter · show clue ${view.trail.instoreRead + 1}${
                    view.trail.nextInstoreTitle ? ` (${view.trail.nextInstoreTitle})` : ""
                  }`}
            </button>
          ) : null}
        </section>
      ) : (
        <section className="panel-flat p-5">
          <p className="text-[12.5px] leading-relaxed text-sage/55">
            The in-store half of the trail unlocks once you have read every online source. It is the
            same trail, not a separate errand.
          </p>
        </section>
      )}

      {onlineComplete && instoreComplete ? (
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="mono-label">The counter&apos;s question</p>
            {view.answer.solved ? (
              <span className="chip border-mint/40 bg-mint/10 text-mint">Answered</span>
            ) : (
              <span className="chip border-amber/40 bg-amber/10 text-amber-soft">Needs an answer</span>
            )}
          </div>
          <h2 className="mt-2 font-display text-2xl text-white/95">{view.answer.question}</h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
            The counter checks your answer on the server. Nothing you type is scored, and asking for
            a hint never changes the reward.
          </p>

          {view.answer.solved ? (
            <p className="mt-3 text-[12.5px] text-mint/80">
              Answer accepted. The counter nods at the photo step below.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                className="input"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && answer.trim()) void submitAnswer();
                }}
                placeholder="Type the number"
                autoComplete="off"
                aria-label="Your answer"
              />
              <button
                type="button"
                onClick={() => void submitAnswer()}
                disabled={busy !== null || answer.trim().length === 0}
                className="btn-primary shrink-0 py-2.5"
              >
                {busy === "answer" ? "Checking…" : "Tell the counter"}
              </button>
            </div>
          )}
          {answerError ? <p className="mt-2 text-[12.5px] text-rust">{answerError}</p> : null}
          {view.answer.attempts > 0 && !view.answer.solved ? (
            <p className="mt-1 text-[11.5px] text-sage/45">
              {view.answer.attempts} attempt{view.answer.attempts === 1 ? "" : "s"} so far. There is
              no penalty for trying again.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="panel-flat p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="mono-label">Ask the counter · optional hints</p>
          <span className="text-[11px] text-sage/45">The fixed reward never changes</span>
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <HintCard
            which={1}
            unlockInSeconds={view.hints.one.unlockInSeconds}
            text={view.hints.one.text}
            onRequest={() => void act("hint-1")}
            busy={busy === "hint-1"}
          />
          <HintCard
            which={2}
            unlockInSeconds={view.hints.two.unlockInSeconds}
            text={view.hints.two.text}
            onRequest={() => void act("hint-2")}
            busy={busy === "hint-2"}
          />
        </div>
        {hintOne === 0 && hintTwo === 0 && !view.hints.one.text && !view.hints.two.text ? (
          <p className="mt-2 text-[11.5px] text-sage/45">
            Both notes are unlocked. They stay here once used.
          </p>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-2xl border border-rust/40 bg-rust/10 px-4 py-3 text-[12.5px] text-rust">
          {error}
        </div>
      ) : null}

      {view.stage === "reviewing" && view.evidence ? (
        <section className="panel border-amber/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="mono-label text-amber/80">Waiting for the operator</p>
            <span className="chip border-amber/40 bg-amber/10 text-amber-soft">In review</span>
          </div>
          <h2 className="mt-2 font-display text-2xl text-white/95">Your evidence is with a person.</h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-sage/70">
            Submitted {formatDateTime(view.evidence.submittedAt)}. This page checks again on its own,
            or you can come back later. A simulated capture is labelled as such for the reviewer.
          </p>
          <p className="mt-3 text-[11.5px] text-sage/45">
            {view.evidence.kind === "simulation"
              ? "You submitted a labelled demo simulation."
              : view.evidence.kind === "upload"
                ? "You submitted an uploaded photo."
                : "You submitted an in-app camera capture."}{" "}
            {view.evidence.hasLocation
              ? "Location was included with the submission."
              : "No location was included."}
          </p>
        </section>
      ) : null}

      {showEvidence && view.stage !== "reviewing" && !view.completion ? (
        <EvidencePanel slug={slug} evidence={view.evidence} />
      ) : null}

      {view.completion ? (
        <section className="panel border-mint/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="mono-label text-mint/80">Completion recorded</p>
            <span className="chip border-mint/40 bg-mint/10 text-mint">Verified</span>
          </div>
          <h2 className="mt-2 font-display text-2xl text-white/95">The counter believed you.</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-sage/75">
            {view.completion.simulated
              ? "An operator approved a labelled demo simulation for this prototype run. It is not proof that anyone was in the shop."
              : "An operator reviewed the photo you submitted and approved the completion."}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line/60 pt-4 text-[12.5px]">
            <div>
              <dt className="mono-label text-[9px]">Fixed reward</dt>
              <dd className="mt-1 text-amber">{view.completion.rewardAmount} Devnet test credits</dd>
              <dd className="text-[11px] text-sage/45">
                Claimable below as a real Devnet token transfer.
              </dd>
            </div>
            <div>
              <dt className="mono-label text-[9px]">Coupon eligibility</dt>
              <dd className="mt-1 text-white/85">
                {view.completion.couponEligible ? "Unlocked" : "Locked — solve the second question"}
              </dd>
              <dd className="text-[11px] text-sage/45">Issuance is P0.4.</dd>
            </div>
            <div>
              <dt className="mono-label text-[9px]">Verified</dt>
              <dd className="mt-1 text-white/85">{formatDateTime(view.completion.verifiedAt)}</dd>
            </div>
            <div>
              <dt className="mono-label text-[9px]">Payout status</dt>
              <dd className="mt-1 font-mono text-[11.5px] text-white/80">
                {view.completion.payoutStatus}
              </dd>
            </div>
          </dl>

          <div className="mt-4 rounded-xl border border-line/70 bg-ink-soft/60 p-4">
            <p className="mono-label text-[9px]">Achievement</p>
            <p className="mt-1 font-display text-xl text-white/90">
              {view.campaign.title} — trail complete
            </p>
            <p className="mt-1 text-[12px] text-sage/60">
              Earned {formatDateTime(view.completion.verifiedAt)}. Personal, non-financial, and never
              awarded for being first.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/quests" className="btn-ghost py-2 text-[12.5px]">
              Back to discovery
            </Link>
            <Link href="/quests#achievements" className="btn-ghost py-2 text-[12.5px]">
              Your achievements
            </Link>
          </div>
        </section>
      ) : null}

      {view.completion && reward ? (
        <RewardClaim
          slug={slug}
          reward={reward}
          payout={{
            status: view.completion.payoutStatus,
            wallet: view.completion.payout.wallet,
            signature: view.completion.payout.signature,
            error: view.completion.payout.error,
            recipientBefore: view.completion.payout.recipientBefore,
            recipientAfter: view.completion.payout.recipientAfter,
            recipientTokenAccount: view.completion.payout.recipientTokenAccount,
            claimedAt: view.completion.payout.claimedAt,
            confirmedAt: view.completion.payout.confirmedAt,
            explorerUrl: view.completion.payout.signature
              ? `https://explorer.solana.com/tx/${view.completion.payout.signature}?cluster=devnet`
              : null,
            tokenAccountUrl: view.completion.payout.recipientTokenAccount
              ? `https://explorer.solana.com/address/${view.completion.payout.recipientTokenAccount}?cluster=devnet`
              : null,
          }}
          chain={view.completion.chain}
          chainError={view.completion.chain.error}
          simulated={view.completion.simulated}
        />
      ) : null}

      <ExtendedMystery slug={slug} view={view} />

      <p className="pb-4 text-center text-[11px] leading-relaxed text-sage/40">
        Fictional demo trail. Camera and location are supporting evidence reviewed by a person, never
        cryptographic proof of presence. Rewards are valueless Solana Devnet test tokens.
      </p>
    </div>
  );
}
