/**
 * How to read one product claim's MagicBlock clue-milestone evidence.
 *
 * The milestone PDA (`["counter", sha256("<campaign_id>#clue")]`) is a
 * campaign-wide cumulative counter: every released clue for the campaign adds
 * one. Its value is therefore 1 for the first handoff and 2, 3, … for later
 * ones. A particular player's handoff is "committed" only when the evidence
 * stored for *that* claim shows its own ER commit and a base-layer value read
 * back after it (see `saveClaimChainEvidence` and the handoff route). The
 * counter's existence or value alone never proves a given handoff.
 *
 * States:
 * - not_recorded — no chain attempt is stored for this claim yet.
 * - unavailable  — the attempt sent no ER transaction (chain unconfigured or
 *                  RPC unreachable). The clue release is local only.
 * - unconfirmed  — an ER transaction was sent, but the commit was not
 *                  confirmed back on Solana (or the record is inconsistent).
 * - committed    — this claim's increment was committed and read back on the
 *                  base layer with a value of 1 or more. Both the ER increment
 *                  and the commit signature must be present; a commit
 *                  signature without the increment it belongs to is not proof
 *                  of this handoff.
 */
export type MilestoneState = "not_recorded" | "unavailable" | "unconfirmed" | "committed";

export interface MilestoneEvidence {
  status: string | null;
  committedValue: number | null;
  commitSignature?: string | null;
  incrementSignature?: string | null;
}

export function milestoneState(chain: MilestoneEvidence | null | undefined): MilestoneState {
  if (!chain || !chain.status) return "not_recorded";
  const value = chain.committedValue;
  const hasValue = typeof value === "number" && Number.isInteger(value) && value >= 1;
  if (
    chain.status === "committed" &&
    hasValue &&
    Boolean(chain.incrementSignature) &&
    Boolean(chain.commitSignature)
  ) {
    return "committed";
  }
  if (chain.incrementSignature || chain.commitSignature || chain.status === "committed") {
    return "unconfirmed";
  }
  return "unavailable";
}
