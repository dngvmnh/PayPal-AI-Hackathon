import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyArtworkBytes } from "../lib/artwork-file.ts";
import { sha256 } from "../lib/gate.ts";
import type { Source } from "../lib/types.ts";

const bytes = new TextEncoder().encode("test artwork bytes");

function design(): Source {
  return {
    id: "design-front",
    kind: "design",
    name: "front.png",
    file: "v2.png",
    mimeType: "image/png",
    versions: [{
      version: 2,
      file: "v2.png",
      mimeType: "image/png",
      sha256: sha256(bytes),
      uploadedAt: "2026-10-29T00:00:00Z",
    }],
  };
}

test("accepts bytes that match the current artwork version", () => {
  assert.equal(verifyArtworkBytes(design(), bytes), sha256(bytes));
});

test("rejects changed bytes and empty files", () => {
  assert.throws(
    () => verifyArtworkBytes(design(), new TextEncoder().encode("different")),
    /hash/i,
  );
  assert.throws(() => verifyArtworkBytes(design(), new Uint8Array()), /empty/i);
});

test("rejects stale file metadata and unsupported types", () => {
  const stale = design();
  stale.file = "v1.png";
  assert.throws(() => verifyArtworkBytes(stale, bytes), /current version/i);

  const unsupported = design();
  unsupported.mimeType = "text/plain";
  unsupported.versions![0].mimeType = "text/plain";
  assert.throws(() => verifyArtworkBytes(unsupported, bytes), /not supported/i);
});

test("rejects missing versions and non-design sources", () => {
  const missing = design();
  missing.versions = [];
  assert.throws(() => verifyArtworkBytes(missing, bytes), /no current version/i);

  const message = { ...design(), kind: "message" as const };
  assert.throws(() => verifyArtworkBytes(message, bytes), /not an artwork/i);
});