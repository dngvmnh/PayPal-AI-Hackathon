import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = "http://localhost:3000";

test("demo re-check rejects updated artwork without changing the order", async () => {
  const createResponse = await fetch(`${base}/api/orders/sample`, {
    method: "POST",
  });
  assert.equal(createResponse.status, 200);
  const { id } = await createResponse.json();
  const orderUrl = `${base}/api/orders/${id}`;

  const firstCheck = await fetch(`${orderUrl}/analyze`, { method: "POST" });
  assert.equal(firstCheck.status, 200);
  const checked = await firstCheck.json();

  assert.equal(checked.analysis.demo, true, "Test requires demo mode");
  const quantity = checked.analysis.findings.find((f) => f.field === "quantity");
  assert.ok(quantity);

  const confirm = await fetch(
    `${orderUrl}/findings/${quantity.id}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "confirm", value: "150" }),
    },
  );
  assert.equal(confirm.status, 200);

  const original = await readFile("samples/riverside-5k/front.png");
  const changed = Buffer.concat([original, Buffer.from([0])]);
  const form = new FormData();
  form.set("sourceId", "design-front");
  form.set("file", new Blob([changed], { type: "image/png" }), "test-v2.png");

  const upload = await fetch(`${orderUrl}/artwork`, {
    method: "POST",
    body: form,
  });
  assert.equal(upload.status, 200);

  const beforeResponse = await fetch(orderUrl);
  assert.equal(beforeResponse.status, 200);
  const before = await beforeResponse.json();

  assert.equal(
    before.analysis.findings.find((f) => f.id === quantity.id).status,
    "resolved",
  );
  assert.equal(
    before.sources.find((s) => s.id === "design-front").versions.length,
    2,
  );

  const recheck = await fetch(`${orderUrl}/analyze`, { method: "POST" });
  assert.equal(recheck.status, 409);
  const error = await recheck.json();
  assert.match(error.error, /saved demo analysis cannot verify updated artwork/i);

  const afterResponse = await fetch(orderUrl);
  assert.equal(afterResponse.status, 200);
  const after = await afterResponse.json();

  assert.deepEqual(after, before, "Blocked demo re-check must not modify the order");
});