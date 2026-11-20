"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { FieldErrors } from "@/lib/validation";

type ClueKind = "onlineClues" | "instoreClues";

interface ClueDraft {
  title: string;
  body: string;
  url: string;
}

interface Draft {
  title: string;
  shopName: string;
  shopArea: string;
  shopAddress: string;
  teaser: string;
  story: string;
  targetObject: string;
  targetObjectHint: string;
  rewardAmount: string;
  couponItem: string;
  couponMinSpend: string;
  couponValidDays: string;
  couponNotes: string;
  onlineClues: ClueDraft[];
  instoreClues: ClueDraft[];
}

const EMPTY_CLUE: ClueDraft = { title: "", body: "", url: "" };

const INITIAL: Draft = {
  title: "",
  shopName: "",
  shopArea: "",
  shopAddress: "",
  teaser: "",
  story: "",
  targetObject: "",
  targetObjectHint: "",
  rewardAmount: "100",
  couponItem: "",
  couponMinSpend: "15000",
  couponValidDays: "14",
  couponNotes: "",
  onlineClues: [{ ...EMPTY_CLUE }],
  instoreClues: [{ ...EMPTY_CLUE }],
};

function inputClass(hasError: boolean) {
  return [
    "input",
    hasError ? "border-rust/70 focus:border-rust focus:ring-rust/15" : "",
  ].join(" ");
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] text-rust">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-sage/45">{hint}</p>
      ) : null}
    </div>
  );
}

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-amber/40 bg-amber/10 font-mono text-[11px] text-amber">
          {step}
        </span>
        <div>
          <h2 className="font-display text-xl leading-tight text-white/90">{title}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-sage/60">{hint}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function CheckRow({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <li className="flex gap-2.5">
      <span
        className={[
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px]",
          done ? "border-mint/60 bg-mint/15 text-mint" : "border-line text-sage/40",
        ].join(" ")}
        aria-hidden
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0">
        <p className={done ? "text-[12.5px] text-white/80" : "text-[12.5px] text-sage/60"}>{label}</p>
        <p className="text-[11px] leading-snug text-sage/40">{detail}</p>
      </div>
    </li>
  );
}

export function CampaignForm({ merchantName }: { merchantName: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setClue(kind: ClueKind, index: number, field: keyof ClueDraft, value: string) {
    setDraft((current) => {
      const next = current[kind].map((clue, clueIndex) =>
        clueIndex === index ? { ...clue, [field]: value } : clue,
      );
      return { ...current, [kind]: next };
    });
  }

  function addClue(kind: ClueKind) {
    setDraft((current) =>
      current[kind].length >= 5
        ? current
        : { ...current, [kind]: [...current[kind], { ...EMPTY_CLUE }] },
    );
  }

  function removeClue(kind: ClueKind, index: number) {
    setDraft((current) =>
      current[kind].length <= 1
        ? current
        : { ...current, [kind]: current[kind].filter((_, i) => i !== index) },
    );
  }

  const checklist = useMemo(() => {
    const onlineReady = draft.onlineClues.some(
      (clue) => clue.title.trim().length >= 3 && clue.body.trim().length >= 8,
    );
    const instoreReady = draft.instoreClues.some(
      (clue) => clue.title.trim().length >= 3 && clue.body.trim().length >= 8,
    );
    return [
      {
        done:
          draft.title.trim().length >= 4 &&
          draft.shopName.trim().length >= 2 &&
          draft.shopArea.trim().length >= 2 &&
          draft.shopAddress.trim().length >= 5,
        label: "Store & campaign details",
        detail: "Name, neighbourhood and a fictional or approved address.",
      },
      {
        done: draft.teaser.trim().length >= 12 && draft.story.trim().length >= 60,
        label: "Story briefing",
        detail: "A hook under 160 characters and the full ARG story.",
      },
      {
        done: onlineReady && draft.onlineClues.length > 0,
        label: "Online trail",
        detail: "At least one clue with a public source link.",
      },
      {
        done:
          instoreReady && draft.targetObject.trim().length >= 4 && draft.targetObjectHint.trim().length >= 8,
        label: "In-store trail",
        detail: "The object to find, where to look, and one physical clue.",
      },
      {
        done: draft.couponItem.trim().length >= 3 && Number(draft.couponValidDays) >= 1,
        label: "Coupon terms",
        detail: "Secret-menu item, minimum spend and validity.",
      },
    ];
  }, [draft]);

  const completed = checklist.filter((item) => item.done).length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const payload = {
      ...draft,
      rewardAmount: Number(draft.rewardAmount),
      couponMinSpend: Number(draft.couponMinSpend),
      couponValidDays: Number(draft.couponValidDays),
    };

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        campaign?: { id: string };
        error?: string;
        fields?: FieldErrors;
      };

      if (!response.ok) {
        setErrors(data.fields ?? {});
        setFormError(data.error ?? "The campaign could not be saved.");
        setSaving(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      router.push(`/merchant/campaigns/${data.campaign?.id}?created=1`);
    } catch {
      setFormError("Network error — the campaign was not saved. Try again.");
      setSaving(false);
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-5">
        {formError ? (
          <div className="rounded-2xl border border-rust/40 bg-rust/10 px-4 py-3 text-sm text-rust">
            <p className="font-semibold">{formError}</p>
            {errorCount > 0 ? (
              <p className="mt-1 text-[12px] text-rust/80">
                {errorCount} field{errorCount === 1 ? " needs" : "s need"} attention below.
              </p>
            ) : null}
          </div>
        ) : null}

        <Section
          step="01"
          title="The store"
          hint="Where the quest happens. Use a real shop name or a clearly fictional demo store."
        >
          <Field label="Campaign title" htmlFor="title" error={errors.title} hint="This is the ARG chapter name, e.g. “The Ninth Cup”.">
            <input
              id="title"
              className={inputClass(Boolean(errors.title))}
              value={draft.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="The Ninth Cup"
              maxLength={80}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shop name" htmlFor="shopName" error={errors.shopName}>
              <input
                id="shopName"
                className={inputClass(Boolean(errors.shopName))}
                value={draft.shopName}
                onChange={(event) => set("shopName", event.target.value)}
                placeholder="Umbra Coffee Roasters"
                maxLength={80}
              />
            </Field>
            <Field label="Neighbourhood" htmlFor="shopArea" error={errors.shopArea}>
              <input
                id="shopArea"
                className={inputClass(Boolean(errors.shopArea))}
                value={draft.shopArea}
                onChange={(event) => set("shopArea", event.target.value)}
                placeholder="Seongsu-dong, Seoul"
                maxLength={80}
              />
            </Field>
          </div>
          <Field
            label="Address shown to players"
            htmlFor="shopAddress"
            error={errors.shopAddress}
            hint="Only merchant-approved, visitor-accessible spaces. Operator will check this."
          >
            <input
              id="shopAddress"
              className={inputClass(Boolean(errors.shopAddress))}
              value={draft.shopAddress}
              onChange={(event) => set("shopAddress", event.target.value)}
              placeholder="24 Yeonmujang-gil, Seongdong-gu, Seoul (fictional address)"
              maxLength={170}
            />
          </Field>
        </Section>

        <Section
          step="02"
          title="The hook"
          hint="The line players see in discovery, and the story that frames the hunt."
        >
          <Field
            label="One-line hook"
            htmlFor="teaser"
            error={errors.teaser}
            hint={`${draft.teaser.trim().length}/160 characters`}
          >
            <input
              id="teaser"
              className={inputClass(Boolean(errors.teaser))}
              value={draft.teaser}
              onChange={(event) => set("teaser", event.target.value)}
              placeholder="Eight cups are for customers. The ninth has been waiting for you."
              maxLength={160}
            />
          </Field>
          <Field
            label="Story briefing"
            htmlFor="story"
            error={errors.story}
            hint={`${draft.story.trim().length} characters · aim for 2 short paragraphs`}
          >
            <textarea
              id="story"
              className={`${inputClass(Boolean(errors.story))} min-h-40 resize-y leading-relaxed`}
              value={draft.story}
              onChange={(event) => set("story", event.target.value)}
              placeholder="For years the roaster set out nine cups every morning..."
              maxLength={1400}
            />
          </Field>
        </Section>

        <Section
          step="03"
          title="Online trail"
          hint="Social posts or site clues players read before arriving. No answer-checking, just atmosphere."
        >
          {errors.onlineClues ? (
            <p className="text-[12px] text-rust">{errors.onlineClues}</p>
          ) : null}
          {draft.onlineClues.map((clue, index) => (
            <div key={index} className="rounded-xl border border-line/70 bg-ink/40 p-4">
              <div className="flex items-center justify-between">
                <p className="mono-label">Clue {index + 1}</p>
                {draft.onlineClues.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeClue("onlineClues", index)}
                    className="text-[11px] text-sage/50 transition hover:text-rust"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                <Field label="Title" htmlFor={`online-${index}-title`} error={errors[`onlineClues.${index}.title`]}>
                  <input
                    id={`online-${index}-title`}
                    className={inputClass(Boolean(errors[`onlineClues.${index}.title`]))}
                    value={clue.title}
                    onChange={(event) => setClue("onlineClues", index, "title", event.target.value)}
                    placeholder="The roaster's April post"
                    maxLength={100}
                  />
                </Field>
                <Field label="Clue text" htmlFor={`online-${index}-body`} error={errors[`onlineClues.${index}.body`]}>
                  <textarea
                    id={`online-${index}-body`}
                    className={`${inputClass(Boolean(errors[`onlineClues.${index}.body`]))} min-h-24 resize-y leading-relaxed`}
                    value={clue.body}
                    onChange={(event) => setClue("onlineClues", index, "body", event.target.value)}
                    placeholder="The pinned post mentions a recipe written in pencil on the back of a shipping label."
                    maxLength={400}
                  />
                </Field>
                <Field
                  label="Source link (optional)"
                  htmlFor={`online-${index}-url`}
                  error={errors[`onlineClues.${index}.url`]}
                  hint="A post, page or profile players can open. Demo links may use example.com."
                >
                  <input
                    id={`online-${index}-url`}
                    className={inputClass(Boolean(errors[`onlineClues.${index}.url`]))}
                    value={clue.url}
                    onChange={(event) => setClue("onlineClues", index, "url", event.target.value)}
                    placeholder="https://example.com/umbra-roasters/april-post"
                    inputMode="url"
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addClue("onlineClues")}
            disabled={draft.onlineClues.length >= 5}
            className="btn-ghost w-full py-2 text-[13px]"
          >
            + Add online clue
          </button>
        </Section>

        <Section
          step="04"
          title="In-store trail"
          hint="What players look for inside the shop. Keep it solvable in 3–5 minutes."
        >
          <Field
            label="Target object"
            htmlFor="targetObject"
            error={errors.targetObject}
            hint="The single thing the player must find and photograph."
          >
            <input
              id="targetObject"
              className={inputClass(Boolean(errors.targetObject))}
              value={draft.targetObject}
              onChange={(event) => set("targetObject", event.target.value)}
              placeholder="The ninth cup — a chipped celadon cup on the top shelf"
              maxLength={150}
            />
          </Field>
          <Field
            label="Where to look"
            htmlFor="targetObjectHint"
            error={errors.targetObjectHint}
            hint="Enough to guide a first-time visitor without giving the whole hunt away."
          >
            <textarea
              id="targetObjectHint"
              className={`${inputClass(Boolean(errors.targetObjectHint))} min-h-20 resize-y leading-relaxed`}
              value={draft.targetObjectHint}
              onChange={(event) => set("targetObjectHint", event.target.value)}
              placeholder="Behind the espresso machine, above the grinder. Look for a hairline crack."
              maxLength={320}
            />
          </Field>

          {errors.instoreClues ? (
            <p className="text-[12px] text-rust">{errors.instoreClues}</p>
          ) : null}
          {draft.instoreClues.map((clue, index) => (
            <div key={index} className="rounded-xl border border-line/70 bg-ink/40 p-4">
              <div className="flex items-center justify-between">
                <p className="mono-label">Clue {index + 1}</p>
                {draft.instoreClues.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeClue("instoreClues", index)}
                    className="text-[11px] text-sage/50 transition hover:text-rust"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                <Field label="Title" htmlFor={`instore-${index}-title`} error={errors[`instoreClues.${index}.title`]}>
                  <input
                    id={`instore-${index}-title`}
                    className={inputClass(Boolean(errors[`instoreClues.${index}.title`]))}
                    value={clue.title}
                    onChange={(event) => setClue("instoreClues", index, "title", event.target.value)}
                    placeholder="The river crack"
                    maxLength={100}
                  />
                </Field>
                <Field label="Clue text" htmlFor={`instore-${index}-body`} error={errors[`instoreClues.${index}.body`]}>
                  <textarea
                    id={`instore-${index}-body`}
                    className={`${inputClass(Boolean(errors[`instoreClues.${index}.body`]))} min-h-24 resize-y leading-relaxed`}
                    value={clue.body}
                    onChange={(event) => setClue("instoreClues", index, "body", event.target.value)}
                    placeholder="The cup has a hairline crack that runs like a river. Photograph it with the shelf label visible."
                    maxLength={400}
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addClue("instoreClues")}
            disabled={draft.instoreClues.length >= 5}
            className="btn-ghost w-full py-2 text-[13px]"
          >
            + Add in-store clue
          </button>
        </Section>

        <Section
          step="05"
          title="Reward &amp; coupon"
          hint="Rewards are fixed and valueless in this prototype. Coupon terms are shown before anyone plays."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Reward (test credits)"
              htmlFor="rewardAmount"
              error={errors.rewardAmount}
              hint="Fixed for every completion."
            >
              <input
                id="rewardAmount"
                className={inputClass(Boolean(errors.rewardAmount))}
                value={draft.rewardAmount}
                onChange={(event) => set("rewardAmount", event.target.value)}
                inputMode="numeric"
                placeholder="100"
              />
            </Field>
            <Field
              label="Minimum spend (KRW)"
              htmlFor="couponMinSpend"
              error={errors.couponMinSpend}
              hint="Shown with the coupon."
            >
              <input
                id="couponMinSpend"
                className={inputClass(Boolean(errors.couponMinSpend))}
                value={draft.couponMinSpend}
                onChange={(event) => set("couponMinSpend", event.target.value)}
                inputMode="numeric"
                placeholder="15000"
              />
            </Field>
            <Field
              label="Valid for (days)"
              htmlFor="couponValidDays"
              error={errors.couponValidDays}
              hint="Counted from issue."
            >
              <input
                id="couponValidDays"
                className={inputClass(Boolean(errors.couponValidDays))}
                value={draft.couponValidDays}
                onChange={(event) => set("couponValidDays", event.target.value)}
                inputMode="numeric"
                placeholder="14"
              />
            </Field>
          </div>
          <Field
            label="Secret-menu item"
            htmlFor="couponItem"
            error={errors.couponItem}
            hint="What the demo coupon entitles the player to."
          >
            <input
              id="couponItem"
              className={inputClass(Boolean(errors.couponItem))}
              value={draft.couponItem}
              onChange={(event) => set("couponItem", event.target.value)}
              placeholder="The Ninth Cup pour-over flight (demo secret menu)"
              maxLength={100}
            />
          </Field>
          <Field
            label="Coupon conditions (optional)"
            htmlFor="couponNotes"
            error={errors.couponNotes}
            hint="Availability, per-visitor limits, or anything staff need to know."
          >
            <textarea
              id="couponNotes"
              className={`${inputClass(Boolean(errors.couponNotes))} min-h-20 resize-y leading-relaxed`}
              value={draft.couponNotes}
              onChange={(event) => set("couponNotes", event.target.value)}
              placeholder="Demo only — not redeemable in a real business. One per visitor, dine-in."
              maxLength={320}
            />
          </Field>
        </Section>

        <div className="flex flex-col gap-3 border-t border-line/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-sm text-[12px] leading-relaxed text-sage/55">
            Saving creates a private draft for {merchantName}. Nothing is visible to players until an
            operator approves it.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/merchant" className="btn-ghost">
              Cancel
            </Link>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <p className="mono-label">Review checklist</p>
            <span className="font-mono text-[11px] text-amber/80">
              {completed}/{checklist.length}
            </span>
          </div>
          <ul className="mt-3 space-y-3">
            {checklist.map((item) => (
              <CheckRow key={item.label} done={item.done} label={item.label} detail={item.detail} />
            ))}
          </ul>
          <div className="mt-4 border-t border-line/60 pt-3">
            <p className="text-[11px] leading-relaxed text-sage/50">
              Operator review checks playability, a customer-safe location, and honest reward copy.
              You can save an incomplete draft any time.
            </p>
          </div>
        </div>

        <div className="panel-flat p-4">
          <p className="mono-label">Demo safe</p>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-sage/60">
            <li>· Devnet test credits only</li>
            <li>· No customer accounts or personal data</li>
            <li>· Coupons are demo entitlements</li>
          </ul>
        </div>
      </aside>
    </form>
  );
}
