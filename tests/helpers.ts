import { readFileSync } from "node:fs";
import { currentArtworkHashes } from "../lib/gate.ts";
import { applyAnalysis, newOrder, resolveFinding } from "../lib/orders.ts";
import { AIAnalysis, type Order } from "../lib/types.ts";

export const fixture = AIAnalysis.parse(
  JSON.parse(readFileSync("samples/riverside-5k/demo-analysis.json", "utf8")),
);

export function draft(): Order {
  return newOrder({
    id: "t1",
    title: "Test",
    customerName: "Dana",
    customerEmail: "",
    sources: [
      { id: "brief", kind: "brief", name: "Brief", text: "..." },
      {
        id: "design-front",
        kind: "design",
        name: "front.png",
        file: "a.png",
        mimeType: "image/png",
        versions: [{ version: 1, file: "a.png", mimeType: "image/png", sha256: "hash-v1", uploadedAt: "2026-01-01T00:00:00Z" }],
      },
    ],
  });
}

export function checked(order = draft()): Order {
  // Gate tests use a synthetic brief whose full content is "...".
  const testAnalysis = structuredClone(fixture);
  for (const finding of testAnalysis.findings) {
    finding.evidence = [{ sourceId: "brief", value: "...", quote: "..." }];
finding.requiresArtworkFix = false;
  }

  return applyAnalysis(order, testAnalysis, {
    model: "m",
    demo: true,
    artworkHashes: currentArtworkHashes(order),
  });
}

/** Settle every non-info finding with its suggested value. */
export function settled(order = checked()): Order {
  for (const f of order.analysis!.findings) {
    if (f.severity !== "info") order = resolveFinding(order, f.id, { type: "confirm", value: f.suggestedValue ?? "x" });
  }
  return order;
}

