import { NextResponse } from "next/server";
import { analyzeOrder, liveAiConfigured } from "@/lib/ai.ts";
import { processArtworkRecheck } from "@/lib/artwork-recheck.ts";
import { currentArtworkHashes } from "@/lib/gate.ts";
import { applyAnalysis, recordFailedCheck } from "@/lib/orders.ts";
import { getOrder, saveOrder } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";
import { limitRequest } from "@/lib/rate-limit.ts";
import type { Order } from "@/lib/types.ts";

export const maxDuration = 300;

async function isUnchanged(order: Order): Promise<boolean> {
  const latest = await getOrder(order.id);
  return Boolean(latest && JSON.stringify(latest) === JSON.stringify(order));
}

export async function POST(req: Request, { params }: IdParams) {
  const limited = limitRequest(req, liveAiConfigured() ? "liveAi" : "write");
  if (limited) return limited;

  return withOrder(params, async (order) => {
    const artworkHashes = currentArtworkHashes(order);

    try {
      const { analysis, demo, savedRecheck, model } = await analyzeOrder(order);

      const artworkWasUpdated = order.sources.some(
        (source) => source.kind === "design" && (source.versions?.length ?? 0) > 1,
      );

      if (demo && artworkWasUpdated && !savedRecheck) {
        return NextResponse.json(
          {
            error:
              "Demo mode can only re-check the sample's own corrected file. Other artwork needs a live AI check.",
          },
          { status: 409 },
        );
      }

      if (!(await isUnchanged(order))) {
        return NextResponse.json(
          { error: "The order changed during the check. Please run it again." },
          { status: 409 },
        );
      }

      let updated = applyAnalysis(order, analysis, {
        model,
        demo,
        savedRecheck,
        artworkHashes,
      });

      if (!demo || savedRecheck) {
        updated = processArtworkRecheck(updated, analysis);
      }

      return NextResponse.json(await saveOrder(updated));
    } catch (error) {
      if (!(await isUnchanged(order))) {
        return NextResponse.json(
          { error: "The order changed during the check. Please run it again." },
          { status: 409 },
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      await saveOrder(recordFailedCheck(order, message, artworkHashes));

      return NextResponse.json(
        { error: `AI check failed: ${message}` },
        { status: 502 },
      );
    }
  });
}