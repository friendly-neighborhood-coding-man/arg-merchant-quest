import test from "node:test";
import assert from "node:assert/strict";
import { clientAddress, takeRateLimit } from "../src/lib/limits";

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
