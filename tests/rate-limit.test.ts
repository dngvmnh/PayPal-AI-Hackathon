import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { hit, LIMITS, limitRequest, resetLimits } from "../lib/rate-limit.ts";

beforeEach(resetLimits);

const HOUR = 60 * 60 * 1000;

test("one visitor is stopped at the limit, and another isn't", () => {
  const limit = LIMITS.write[0].limit;
  for (let i = 0; i < limit; i++) assert.equal(hit("write", "a", 0), 0);
  assert.ok(hit("write", "a", 0) > 0);
  assert.equal(hit("write", "b", 0), 0);
});

test("the window resets", () => {
  for (let i = 0; i <= LIMITS.write[0].limit; i++) hit("write", "a", 0);
  assert.equal(hit("write", "a", HOUR), 0);
});

test("live AI checks have a cap across all visitors, so changing IP doesn't help", () => {
  for (let i = 0; i < LIMITS.liveAi[1].limit; i++) assert.equal(hit("liveAi", `ip-${i}`, 0), 0);
  assert.ok(hit("liveAi", "someone-new", 0) > 0);
});

test("a blocked request answers 429 with Retry-After", async () => {
  const req = new Request("http://x/", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
  for (let i = 0; i < LIMITS.liveAi[0].limit; i++) assert.equal(limitRequest(req, "liveAi"), null);
  const res = limitRequest(req, "liveAi")!;
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get("Retry-After")) > 0);
  assert.match((await res.json()).error, /Too many requests/);
});
