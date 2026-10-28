import { NextResponse } from "next/server";
import { analyzeOrder, MODEL } from "@/lib/ai.ts";
import { currentArtworkHashes } from "@/lib/gate.ts";
import { applyAnalysis, recordFailedCheck } from "@/lib/orders.ts";
import { saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: IdParams) {
  return withOrder(params, async (order) => {
    // Record which artwork versions this check reads, so a later upload makes it stale.
    const artworkHashes = currentArtworkHashes(order);
    try {
      const { analysis, demo } = await analyzeOrder(order);
      const saved = await saveOrder(
        applyAnalysis(order, analysis, { model: demo ? "demo-fixture" : MODEL, demo, artworkHashes }),
      );
      return NextResponse.json(saved);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await saveOrder(recordFailedCheck(order, message, artworkHashes));
      return NextResponse.json({ error: `AI check failed: ${message}` }, { status: 502 });
    }
  });
}
