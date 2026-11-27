import { test } from "node:test";
import assert from "node:assert/strict";
import { milestoneState } from "../src/lib/milestone";

const SIG = "5QcNv2iYiuQsw6UYPfjaj2qBs7suU4dsR72JwfJoEJeq";

test("no chain attempt stored → not_recorded", () => {
  assert.equal(milestoneState(null), "not_recorded");
  assert.equal(milestoneState(undefined), "not_recorded");
  assert.equal(milestoneState({ status: null, committedValue: null }), "not_recorded");
});

test("committed value 1 (first handoff for the campaign) → committed", () => {
  assert.equal(
    milestoneState({ status: "committed", committedValue: 1, commitSignature: SIG, incrementSignature: SIG }),
    "committed",
  );
});

test("committed value 2 and higher (cumulative campaign counter) → committed, not pending", () => {
  for (const value of [2, 3, 19, 250]) {
    assert.equal(
      milestoneState({ status: "committed", committedValue: value, commitSignature: SIG, incrementSignature: SIG }),
      "committed",
      `value ${value}`,
    );
  }
});

test("committed value 0 is inconsistent → unconfirmed, never committed", () => {
  assert.equal(
    milestoneState({ status: "committed", committedValue: 0, commitSignature: SIG, incrementSignature: SIG }),
    "unconfirmed",
  );
});

test("'committed' without a commit signature or read-back value → unconfirmed", () => {
  assert.equal(milestoneState({ status: "committed", committedValue: 4, commitSignature: null }), "unconfirmed");
  assert.equal(milestoneState({ status: "committed", committedValue: null, commitSignature: SIG }), "unconfirmed");
});

test("ER transaction sent but commit not confirmed → unconfirmed", () => {
  assert.equal(
    milestoneState({ status: "failed", committedValue: null, incrementSignature: SIG, commitSignature: null }),
    "unconfirmed",
  );
  assert.equal(
    milestoneState({ status: "failed", committedValue: null, incrementSignature: SIG, commitSignature: SIG }),
    "unconfirmed",
  );
});

test("chain unconfigured or RPC unavailable (no transaction sent) → unavailable", () => {
  assert.equal(
    milestoneState({ status: "failed", committedValue: null, incrementSignature: null, commitSignature: null }),
    "unavailable",
  );
});
