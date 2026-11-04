import { promises as fs } from "node:fs";
import { SAMPLE_CORRECTED_ARTWORK } from "@/lib/ai.ts";

/** The sample's corrected artwork, so anyone can run the re-check without cloning the repo. */
export async function GET() {
  return new Response(new Uint8Array(await fs.readFile(SAMPLE_CORRECTED_ARTWORK)), {
    headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="front-v2.png"' },
  });
}
