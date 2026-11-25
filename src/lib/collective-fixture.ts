/**
 * Isolated collective-investigation fixture.
 *
 * This is deliberately separate from `COLLECTIVE_EVIDENCE`, which holds
 * production campaign content. It exists for one purpose: to compare a real
 * model's replies to the same question while a campaign's MagicBlock clue
 * milestone is below the threshold and after a genuine ER transition crosses it.
 *
 * Boundaries:
 * - Keyed by a demo-only slug, so no production campaign can show it.
 * - Readable only when that fixture campaign's own milestone reaches the
 *   threshold; the locked path returns no text at all.
 * - Describes prewritten demo material. It never claims a real visitor, a real
 *   handoff or a real purchase.
 * - Removing this file and its two lookups in `collective.ts` removes the
 *   fixture completely.
 */
import type { CollectiveEvidence } from "./collective";

export const FIXTURE_SLUG = "p2-locked-fixture";

export const FIXTURE_COLLECTIVE_EVIDENCE: Record<string, CollectiveEvidence> = {
  [FIXTURE_SLUG]: {
    title: "Fixture card · isolated milestone test",
    source:
      "Isolated demo fixture · prewritten text, unlocked only when this fixture campaign's own MagicBlock milestone reaches 2.",
    text:
      "A laminated card clipped inside the fixture case, headed DEMO FIXTURE. It reads: “This card is test material for the milestone comparison. It records nothing about visitors and no handoff happened to produce it. Its only rule is that the second count opens it, and that the count is a number of released clues, not people.” The card is stamped twice, both stamps marked SAMPLE.",
  },
};
