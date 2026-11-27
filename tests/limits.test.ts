import test from "node:test";
import assert from "node:assert/strict";
import {
  clientAddress,
  inFlightReservations,
  releasePayoutForCompletion,
  releaseSpendingSlot,
  reservePayoutForCompletion,
  reserveSpendingSlot,
  resetSpendingReservations,
  takeRateLimit,
} from "../src/lib/limits";

test("clientAddress prefers the first forwarded hop", () => {
  assert.equal(
    clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    "203.0.113.7",
  );
  assert.equal(clientAddress(new Headers({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  assert.equal(clientAddress(new Headers()), "unknown");
});

test("the fixed window allows the limit and then refuses until it resets", () => {
  const start = 1_000_000;
  for (let hit = 0; hit < 3; hit += 1) {
    assert.equal(takeRateLimit("test:window", 3, 60_000, start).ok, true);
  }
  const refused = takeRateLimit("test:window", 3, 60_000, start + 1_000);
  assert.equal(refused.ok, false);
  assert.equal(refused.remaining, 0);
  assert.ok(refused.retryAfterSeconds > 0);

  // A later window starts clean rather than carrying the refusal forward.
  const reset = takeRateLimit("test:window", 3, 60_000, start + 60_001);
  assert.equal(reset.ok, true);
  assert.equal(reset.remaining, 2);
});

test("limits are per key, so one address cannot spend another's budget", () => {
  assert.equal(takeRateLimit("a", 1, 60_000, 5).ok, true);
  assert.equal(takeRateLimit("a", 1, 60_000, 5).ok, false);
  assert.equal(takeRateLimit("b", 1, 60_000, 5).ok, true);
});

/**
 * The regression this locks: the daily budgets were checked against a stored
 * count and spent after an await, so every request in a burst read the same
 * count and the cap was bypassed (observed: 12 answers with a cap of 3).
 * Reservations are taken synchronously, so the burst can only take `cap`.
 */
test("a simultaneous burst cannot spend more than the daily reply budget", () => {
  resetSpendingReservations();
  const cap = 5;
  let granted = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    // Each request sees the same stored count, exactly as a real burst does.
    if (reserveSpendingSlot("ai_reply", cap, 0)) granted += 1;
  }
  assert.equal(granted, cap);
  assert.equal(inFlightReservations("ai_reply"), cap);

  // Releasing one finished reply frees exactly one unit, no more.
  releaseSpendingSlot("ai_reply");
  assert.equal(reserveSpendingSlot("ai_reply", cap, 0), true);
  assert.equal(reserveSpendingSlot("ai_reply", cap, 0), false);
  assert.equal(inFlightReservations("ai_reply"), cap);
  resetSpendingReservations();
});

test("the payout budget counts stored payouts and open reservations together", () => {
  resetSpendingReservations();
  // 24 already paid today, one payout in flight, cap 25.
  assert.equal(reserveSpendingSlot("payout", 25, 24), true);
  assert.equal(reserveSpendingSlot("payout", 25, 24), false);
  assert.equal(reserveSpendingSlot("payout", 25, 25), false);
  // A cap of zero refuses everything rather than reading as unlimited.
  assert.equal(reserveSpendingSlot("payout", 0, 0), false);
  resetSpendingReservations();
  // The two budgets are independent.
  assert.equal(reserveSpendingSlot("ai_reply", 25, 24), true);
  assert.equal(inFlightReservations("payout"), 0);
  resetSpendingReservations();
});

test("one completion cannot be paid twice at the same time", () => {
  resetSpendingReservations();
  assert.equal(reservePayoutForCompletion("cmp_double"), true);
  // A second simultaneous claim for the same completion is refused.
  assert.equal(reservePayoutForCompletion("cmp_double"), false);
  assert.equal(reservePayoutForCompletion("cmp_other"), true);
  // Once the first finishes the completion can be claimed again (idempotent
  // lookup), and nothing else is left locked.
  releasePayoutForCompletion("cmp_double");
  assert.equal(reservePayoutForCompletion("cmp_double"), true);
  resetSpendingReservations();
});
