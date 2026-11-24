"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Campaign } from "@/lib/types";
import type { FieldErrors } from "@/lib/validation";
import type { StoryCampaignDraft } from "@/lib/story-draft";
import { registerCampaignFormDirtyCheck } from "@/lib/form-dirty";

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
  answerQuestion: string;
  answer: string;
  hint1: string;
  hint2: string;
  extSocialClue: string;
  extWebClue: string;
  extInstoreClue: string;
  extAnswer: string;
  extHint: string;
  extQuestion: string;
  optionalMode: "coupon" | "product_clue";
  productName: string;
  productPriceLabel: string;
  productProp: string;
  productClue: string;
  finalQuestion: string;
  finalAnswer: string;
  finalHint: string;
  endingTitle: string;
  endingBody: string;
  achievementTitle: string;
  achievementBody: string;
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
  answerQuestion: "",
  answer: "",
  hint1: "",
  hint2: "",
  extSocialClue: "",
  extWebClue: "",
  extInstoreClue: "",
  extAnswer: "",
  extHint: "",
  extQuestion: "",
  optionalMode: "coupon",
  productName: "",
  productPriceLabel: "",
  productProp: "",
  productClue: "",
  finalQuestion: "",
  finalAnswer: "",
  finalHint: "",
  endingTitle: "",
  endingBody: "",
  achievementTitle: "",
  achievementBody: "",
  rewardAmount: "100",
  couponItem: "",
  couponMinSpend: "15000",
  couponValidDays: "14",
  couponNotes: "",
  onlineClues: [{ ...EMPTY_CLUE }],
  instoreClues: [{ ...EMPTY_CLUE }],
};

function draftFromCampaign(campaign: Campaign): Draft {
  const cluesOf = (kind: "online" | "instore"): ClueDraft[] => {
    const items = campaign.clues
      .filter((clue) => clue.kind === kind)
      .sort((a, b) => a.position - b.position)
      .map((clue) => ({ title: clue.title, body: clue.body, url: clue.url ?? "" }));
    return items.length > 0 ? items : [{ ...EMPTY_CLUE }];
  };

  return {
    title: campaign.title,
    shopName: campaign.shopName,
    shopArea: campaign.shopArea,
    shopAddress: campaign.shopAddress,
    teaser: campaign.teaser,
    story: campaign.story,
    targetObject: campaign.targetObject,
    targetObjectHint: campaign.targetObjectHint,
    answerQuestion: campaign.answerQuestion,
    answer: campaign.answer,
    hint1: campaign.hint1,
    hint2: campaign.hint2,
    extSocialClue: campaign.extSocialClue,
    extWebClue: campaign.extWebClue,
    extInstoreClue: campaign.extInstoreClue,
    extAnswer: campaign.extAnswer,
    extHint: campaign.extHint,
    extQuestion: campaign.extQuestion,
    optionalMode: campaign.optionalMode,
    productName: campaign.productName,
    productPriceLabel: campaign.productPriceLabel,
    productProp: campaign.productProp,
    productClue: campaign.productClue,
    finalQuestion: campaign.finalQuestion,
    finalAnswer: campaign.finalAnswer,
    finalHint: campaign.finalHint,
    endingTitle: campaign.endingTitle,
    endingBody: campaign.endingBody,
    achievementTitle: campaign.achievementTitle,
    achievementBody: campaign.achievementBody,
    rewardAmount: String(campaign.rewardAmount),
    couponItem: campaign.couponItem,
    couponMinSpend: String(campaign.couponMinSpend),
    couponValidDays: String(campaign.couponValidDays),
    couponNotes: campaign.couponNotes,
    onlineClues: cluesOf("online"),
    instoreClues: cluesOf("instore"),
  };
}

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

export function CampaignForm({
  merchantName,
  campaign,
}: {
  merchantName: string;
  /** When present the form edits this draft / rejected campaign instead of creating one. */
  campaign?: Campaign;
}) {
  const router = useRouter();
  const isEditing = Boolean(campaign);
  const [draft, setDraft] = useState<Draft>(() =>
    campaign ? draftFromCampaign(campaign) : INITIAL,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [labNotice, setLabNotice] = useState<string | null>(null);

  // The Story Lab sits above this form and can replace all of it. Compare the
  // live draft with what this page started from so the lab can ask before
  // discarding unsaved merchant text.
  const baseline = useMemo(() => (campaign ? draftFromCampaign(campaign) : INITIAL), [campaign]);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    registerCampaignFormDirtyCheck(
      () => JSON.stringify(draftRef.current) !== JSON.stringify(baseline),
    );
    return () => registerCampaignFormDirtyCheck(null);
  }, [baseline]);

  // A Story Lab concept is handed over through sessionStorage and merged once
  // into the existing editable form. Removing the query and storage entry means
  // a later refresh cannot overwrite the merchant's edits.
  useEffect(() => {
    if (campaign || !window.location.search.includes("lab=1")) return;
    const raw = sessionStorage.getItem("arg.storyDraft");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<StoryCampaignDraft>;
      setDraft((current) => ({
        ...current,
        ...parsed,
        onlineClues:
          parsed.onlineClues && parsed.onlineClues.length > 0
            ? parsed.onlineClues
            : current.onlineClues,
        instoreClues:
          parsed.instoreClues && parsed.instoreClues.length > 0
            ? parsed.instoreClues
            : current.instoreClues,
      }));
      setLabNotice(
        "Story Lab draft loaded. The shop address, counter answer, final answer and any field marked INCOMPLETE still need your review. Nothing has been saved or published.",
      );
      sessionStorage.removeItem("arg.storyDraft");
      window.history.replaceState({}, "", "/merchant/campaigns/new");
    } catch {
      setFormError("The Story Lab draft could not be read. Start from an empty form.");
    }
  }, [campaign]);

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
        done: draft.answerQuestion.trim().length >= 8 && draft.answer.trim().length > 0,
        label: "Counter answer",
        detail: "The question players answer, kept separate from the clues.",
      },
      {
        done:
          [draft.extSocialClue, draft.extWebClue, draft.extInstoreClue, draft.extAnswer].every(
            (value) => value.trim().length >= 8,
          ) ||
          [draft.extSocialClue, draft.extWebClue, draft.extInstoreClue, draft.extAnswer].every(
            (value) => value.trim().length === 0,
          ),
        label: "Extended mystery (optional)",
        detail: "All four parts, or none at all.",
      },
      draft.optionalMode === "product_clue"
        ? {
            done:
              draft.productName.trim().length >= 3 &&
              draft.productClue.trim().length >= 20 &&
              draft.finalQuestion.trim().length >= 8 &&
              draft.finalAnswer.trim().length > 0,
            label: "Product-clue ending",
            detail: "Signature product, embedded clue, final question and answer.",
          }
        : {
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
      // Product-clue campaigns do not issue a coupon. Keep the legacy field
      // valid for storage without showing it as a player entitlement.
      couponItem:
        draft.couponItem.trim() || draft.productName.trim() || "Demo entitlement",
      rewardAmount: Number(draft.rewardAmount),
      couponMinSpend: Number(draft.couponMinSpend),
      couponValidDays: Number(draft.couponValidDays),
    };

    try {
      const response = await fetch(
        campaign ? `/api/campaigns/${campaign.id}` : "/api/campaigns",
        {
          method: campaign ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
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

      const id = data.campaign?.id ?? campaign?.id;
      router.push(`/merchant/campaigns/${id}?${campaign ? "updated" : "created"}=1`);
      router.refresh();
    } catch {
      setFormError("Network error — the campaign was not saved. Try again.");
      setSaving(false);
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form
      id="campaign-form"
      onSubmit={handleSubmit}
      className="grid scroll-mt-24 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]"
    >
      <div className="space-y-5">
        {labNotice ? (
          <div className="rounded-2xl border border-amber/35 bg-amber/[0.07] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12px] leading-relaxed text-amber/85">{labNotice}</p>
              <button
                type="button"
                onClick={() => setLabNotice(null)}
                className="shrink-0 text-[11px] text-amber/60 hover:text-amber"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
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

          <div className="rounded-xl border border-berry/30 bg-berry/5 p-4">
            <p className="mono-label text-berry/80">Private verification</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-berry/85">
              Never shown to players. The operator uses this description to decide whether a
              submitted photo really shows the object a visitor can reach.
            </p>
            <div className="mt-3 space-y-4">
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
                hint="Enough for the operator to confirm the spot, not a second player clue."
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
            </div>
          </div>
        </Section>

        <Section
          step="05"
          title="The counter&apos;s question"
          hint="What the player must work out after both trails. Checked on the server; never sent to a player's browser."
        >
          <div className="rounded-xl border border-berry/30 bg-berry/5 px-4 py-3">
            <p className="text-[11.5px] leading-relaxed text-berry/85">
              Private. The answer and both hints stay on the server. A campaign cannot be submitted
              for review until the question and answer are filled in, so nothing unplayable reaches
              an operator.
            </p>
          </div>
          <Field
            label="Question players are asked"
            htmlFor="answerQuestion"
            error={errors.answerQuestion}
            hint="It should need both the online trail and something only visible in the shop."
          >
            <input
              id="answerQuestion"
              className={inputClass(Boolean(errors.answerQuestion))}
              value={draft.answerQuestion}
              onChange={(event) => set("answerQuestion", event.target.value)}
              placeholder="How many pours does the ninth cup's recipe call for?"
              maxLength={200}
            />
          </Field>
          <Field
            label="Answer"
            htmlFor="answer"
            error={errors.answer}
            hint="Short. Numbers and single words work best; number words are accepted."
          >
            <input
              id="answer"
              className={inputClass(Boolean(errors.answer))}
              value={draft.answer}
              onChange={(event) => set("answer", event.target.value)}
              placeholder="5"
              maxLength={60}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Hint at 3 minutes"
              htmlFor="hint1"
              error={errors.hint1}
              hint="Nudge without giving the answer away."
            >
              <textarea
                id="hint1"
                className={`${inputClass(Boolean(errors.hint1))} min-h-20 resize-y leading-relaxed`}
                value={draft.hint1}
                onChange={(event) => set("hint1", event.target.value)}
                placeholder="The rule names two things to count: every shelf, and one extra pour."
                maxLength={260}
              />
            </Field>
            <Field
              label="Hint at 5 minutes"
              htmlFor="hint2"
              error={errors.hint2}
              hint="The later note may be more direct. Hints never change the reward."
            >
              <textarea
                id="hint2"
                className={`${inputClass(Boolean(errors.hint2))} min-h-20 resize-y leading-relaxed`}
                value={draft.hint2}
                onChange={(event) => set("hint2", event.target.value)}
                placeholder="Four shelves, one pour each. Then one more for the ninth cup."
                maxLength={260}
              />
            </Field>
          </div>
        </Section>

        <Section
          step="06"
          title="Optional extended mystery"
          hint="A second, harder trail after the free quest. Leave it empty for no optional story. Product-clue mode ends with a physical clue and a hidden ending instead of a coupon."
        >
          <Field label="Optional ending" htmlFor="optionalMode" hint="The coupon mode is the accepted P0.4 behaviour. Product clue is the P1 adventure.">
            <select
              id="optionalMode"
              className="input"
              value={draft.optionalMode}
              onChange={(event) =>
                set("optionalMode", event.target.value === "product_clue" ? "product_clue" : "coupon")
              }
            >
              <option value="coupon">Demo coupon (legacy)</option>
              <option value="product_clue">Product clue + hidden ending</option>
            </select>
          </Field>
          <Field
            label="Social-style clue"
            htmlFor="extSocialClue"
            error={errors.extSocialClue}
            hint="A post, photo or comment the player can open."
          >
            <textarea
              id="extSocialClue"
              className={`${inputClass(Boolean(errors.extSocialClue))} min-h-20 resize-y leading-relaxed`}
              value={draft.extSocialClue}
              onChange={(event) => set("extSocialClue", event.target.value)}
              placeholder="The letter was posted once, in 2019. The caption reads: “You kept the ninth. I kept the eleventh.”"
              maxLength={400}
            />
          </Field>
          <Field
            label="Merchant website clue"
            htmlFor="extWebClue"
            error={errors.extWebClue}
            hint="Something on the shop's own site, page or history."
          >
            <textarea
              id="extWebClue"
              className={`${inputClass(Boolean(errors.extWebClue))} min-h-20 resize-y leading-relaxed`}
              value={draft.extWebClue}
              onChange={(event) => set("extWebClue", event.target.value)}
              placeholder="The about page says the shop began with nine cups on a market-stall table."
              maxLength={400}
            />
          </Field>
          <Field
            label="In-store observation"
            htmlFor="extInstoreClue"
            error={errors.extInstoreClue}
            hint="The one thing that can only be seen inside the shop."
          >
            <textarea
              id="extInstoreClue"
              className={`${inputClass(Boolean(errors.extInstoreClue))} min-h-20 resize-y leading-relaxed`}
              value={draft.extInstoreClue}
              onChange={(event) => set("extInstoreClue", event.target.value)}
              placeholder="The framed photo of the 1998 stall: nine cups on the table."
              maxLength={400}
            />
          </Field>
          <Field
            label="Extended question"
            htmlFor="extQuestion"
            error={errors.extQuestion}
            hint="Shown once the player has opened all three extended clues."
          >
            <input
              id="extQuestion"
              className={inputClass(Boolean(errors.extQuestion))}
              value={draft.extQuestion}
              onChange={(event) => set("extQuestion", event.target.value)}
              placeholder="How many cups does the letter count in total?"
              maxLength={200}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Final answer"
              htmlFor="extAnswer"
              error={errors.extAnswer}
              hint="Not shown to players before they solve it."
            >
              <input
                id="extAnswer"
                className={inputClass(Boolean(errors.extAnswer))}
                value={draft.extAnswer}
                onChange={(event) => set("extAnswer", event.target.value)}
                placeholder="11"
                maxLength={60}
              />
            </Field>
            <Field
              label="Extended hint (optional)"
              htmlFor="extHint"
              error={errors.extHint}
              hint="Shown once all three extended clues are open."
            >
              <input
                id="extHint"
                className={inputClass(Boolean(errors.extHint))}
                value={draft.extHint}
                onChange={(event) => set("extHint", event.target.value)}
                placeholder="Nine cups on the stall. Two cups that never went home."
                maxLength={260}
              />
            </Field>
          </div>

          {draft.optionalMode === "product_clue" ? (
            <div className="space-y-4 rounded-xl border border-amber/30 bg-amber/[0.05] p-4">
              <div>
                <p className="mono-label text-amber/80">Product clue ending</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-amber/85">
                  The optional deduction above must stand on its own. This product is the optional
                  handoff, not a condition for the free reward. Keep the clue out of every online
                  clue: it is only released after staff confirm the demo handoff.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Signature product" htmlFor="productName" error={errors.productName} hint="What the player requests at the counter.">
                  <input
                    id="productName"
                    className={inputClass(Boolean(errors.productName))}
                    value={draft.productName}
                    onChange={(event) => set("productName", event.target.value)}
                    placeholder="The Ninth Cup pour-over flight"
                    maxLength={90}
                  />
                </Field>
                <Field label="Demo price label" htmlFor="productPriceLabel" error={errors.productPriceLabel} hint="Clearly marked as a simulation; no payment is taken.">
                  <input
                    id="productPriceLabel"
                    className={inputClass(Boolean(errors.productPriceLabel))}
                    value={draft.productPriceLabel}
                    onChange={(event) => set("productPriceLabel", event.target.value)}
                    placeholder="₩9,500 (demo simulation)"
                    maxLength={40}
                  />
                </Field>
              </div>
              <Field label="Physical prop" htmlFor="productProp" error={errors.productProp} hint="Cup sleeve, label, receipt insert, packaging card…">
                <input
                  id="productProp"
                  className={inputClass(Boolean(errors.productProp))}
                  value={draft.productProp}
                  onChange={(event) => set("productProp", event.target.value)}
                  placeholder="A printed kraft cup sleeve"
                  maxLength={120}
                />
              </Field>
              <Field label="Product clue (private until handoff)" htmlFor="productClue" error={errors.productClue} hint="A coded instruction that must be combined with an earlier observation.">
                <textarea
                  id="productClue"
                  className={`${inputClass(Boolean(errors.productClue))} min-h-24 resize-y leading-relaxed`}
                  value={draft.productClue}
                  onChange={(event) => set("productClue", event.target.value)}
                  placeholder="Printed inside the sleeve: FOUR SHELVES, POURED TWICE. THEN ADD THE ELEVEN THAT NEVER WENT HOME."
                  maxLength={600}
                />
              </Field>
              <Field label="Final question" htmlFor="finalQuestion" error={errors.finalQuestion} hint="Asked only after the clue is released.">
                <input
                  id="finalQuestion"
                  className={inputClass(Boolean(errors.finalQuestion))}
                  value={draft.finalQuestion}
                  onChange={(event) => set("finalQuestion", event.target.value)}
                  placeholder="How many pours does the hidden recipe make in total?"
                  maxLength={220}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Final answer" htmlFor="finalAnswer" error={errors.finalAnswer} hint="Checked on the server; never sent before release.">
                  <input
                    id="finalAnswer"
                    className={inputClass(Boolean(errors.finalAnswer))}
                    value={draft.finalAnswer}
                    onChange={(event) => set("finalAnswer", event.target.value)}
                    placeholder="19"
                    maxLength={60}
                  />
                </Field>
                <Field label="Wrong-answer nudge" htmlFor="finalHint" error={errors.finalHint} hint="Useful feedback that does not reveal the answer.">
                  <input
                    id="finalHint"
                    className={inputClass(Boolean(errors.finalHint))}
                    value={draft.finalHint}
                    onChange={(event) => set("finalHint", event.target.value)}
                    placeholder="Add the shelf count and the letter, the way the sleeve asks."
                    maxLength={260}
                  />
                </Field>
              </div>
              <Field label="Hidden ending title" htmlFor="endingTitle" error={errors.endingTitle}>
                <input
                  id="endingTitle"
                  className={inputClass(Boolean(errors.endingTitle))}
                  value={draft.endingTitle}
                  onChange={(event) => set("endingTitle", event.target.value)}
                  placeholder="The Nineteenth Pour"
                  maxLength={90}
                />
              </Field>
              <Field label="Hidden ending narrative" htmlFor="endingBody" error={errors.endingBody}>
                <textarea
                  id="endingBody"
                  className={`${inputClass(Boolean(errors.endingBody))} min-h-24 resize-y leading-relaxed`}
                  value={draft.endingBody}
                  onChange={(event) => set("endingBody", event.target.value)}
                  placeholder="What the player finally understands, in 3–5 sentences."
                  maxLength={900}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Achievement title" htmlFor="achievementTitle" error={errors.achievementTitle}>
                  <input
                    id="achievementTitle"
                    className={inputClass(Boolean(errors.achievementTitle))}
                    value={draft.achievementTitle}
                    onChange={(event) => set("achievementTitle", event.target.value)}
                    placeholder="Keeper of the Nineteenth Pour"
                    maxLength={90}
                  />
                </Field>
                <Field label="Achievement detail" htmlFor="achievementBody" error={errors.achievementBody}>
                  <input
                    id="achievementBody"
                    className={inputClass(Boolean(errors.achievementBody))}
                    value={draft.achievementBody}
                    onChange={(event) => set("achievementBody", event.target.value)}
                    placeholder="You combined the shop, the letter and the product clue."
                    maxLength={320}
                  />
                </Field>
              </div>
            </div>
          ) : null}
        </Section>

        <Section
          step="07"
          title="Reward &amp; coupon"
          hint="Rewards are fixed and valueless in this prototype. Coupon terms are shown before anyone plays."
        >
          {draft.optionalMode === "product_clue" ? (
            <div className="rounded-xl border border-line/70 bg-ink-soft/50 px-4 py-3">
              <p className="text-[11.5px] leading-relaxed text-sage/65">
                This campaign uses the product-clue ending, so it does not issue a coupon. The
                legacy coupon fields stay stored for compatibility but are never shown to players
                or issued on this trail. The fixed free reward is unchanged.
              </p>
            </div>
          ) : null}
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
            Story, clues, target and coupon fields must be complete before this campaign can be
            saved. {isEditing ? "Saving updates this private campaign" : `Saving creates a private draft for ${merchantName}`}
            {" "}— nothing is visible to players until an operator approves it. The counter question
            and answer can be filled in later, but the campaign cannot be submitted without them.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/merchant" className="btn-ghost">
              Cancel
            </Link>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : isEditing ? "Save changes" : "Save draft"}
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
              All required fields must be filled in before this campaign can be saved.
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
