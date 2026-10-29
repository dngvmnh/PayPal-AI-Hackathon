import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContent } from "../lib/ai.ts";
import { sha256 } from "../lib/gate.ts";
import { newOrder } from "../lib/orders.ts";
import type { Source } from "../lib/types.ts";

const bytes = Buffer.from("synthetic image bytes");

function makeOrder() {
  const design: Source = {
    id: "design-front",
    kind: "design",
    name: "front.png",
    text: "This text must not replace the design file.",
    file: "front-v2.png",
    mimeType: "image/png",
    versions: [{
      version: 2,
      file: "front-v2.png",
      mimeType: "image/png",
      sha256: sha256(bytes),
      uploadedAt: "2026-10-29T00:00:00Z",
    }],
  };

  return newOrder({
    id: "test-order",
    title: "Test order",
    customerName: "Test customer",
    customerEmail: "test@example.com",
    sources: [design],
  });
}

test("buildContent includes the actual artwork bytes even when design has text", async () => {
  const content = await buildContent(makeOrder(), async () => bytes);
  const image = content.find((block) => block.type === "image");

  assert.ok(image);
  assert.equal(image.source.type, "base64");
  if (image.source.type !== "base64") throw new Error("Expected base64 image");

  assert.equal(image.source.data, bytes.toString("base64"));
  assert.equal(
    content.some(
      (block) => block.type === "text" && block.text.includes("must not replace"),
    ),
    false,
  );
});

test("buildContent rejects artwork bytes with the wrong hash", async () => {
  await assert.rejects(
    () => buildContent(makeOrder(), async () => Buffer.from("different bytes")),
    /hash/i,
  );
});

test("buildContent rejects a design with no file", async () => {
  const order = makeOrder();
  order.sources[0].file = undefined;

  await assert.rejects(
    () => buildContent(order, async () => bytes),
    /no file or MIME type/i,
  );
});