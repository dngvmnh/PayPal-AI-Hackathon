import { promises as fs } from "node:fs";
import path from "node:path";
import type { Order, Source } from "./types.ts";
import { newId, saveOrder, saveUpload } from "./store.ts";

const DIR = path.join(process.cwd(), "samples", "riverside-5k");

/** Split a pasted email/chat thread on "--- header ---" lines into one source per message. */
export function splitThread(text: string): { name: string; text: string }[] {
  const parts = text.split(/^---\s*(.+?)\s*---\s*$/m);
  const out: { name: string; text: string }[] = [];
  if (parts[0].trim()) out.push({ name: "Message", text: parts[0].trim() });
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ name: parts[i], text: (parts[i + 1] ?? "").trim() });
  }
  return out;
}

/** Seed the Riverside 5K sample order (source ids match samples/riverside-5k/demo-analysis.json). */
export async function seedSampleOrder(): Promise<Order> {
  const id = newId();
  const brief = await fs.readFile(path.join(DIR, "brief.md"), "utf8");
  const thread = await fs.readFile(path.join(DIR, "messages.txt"), "utf8");
  const file = await saveUpload(id, "front.png", await fs.readFile(path.join(DIR, "front.png")));

  const sources: Source[] = [
    { id: "brief", kind: "brief", name: "Order brief", text: brief },
    ...splitThread(thread).map((m, i): Source => ({ id: `msg-${i + 1}`, kind: "message", ...m })),
    { id: "design-front", kind: "design", name: "front.png", file, mimeType: "image/png" },
  ];

  return saveOrder({
    id,
    createdAt: new Date().toISOString(),
    title: "Riverside 5K volunteer shirts",
    customerName: "Dana Whitfield",
    customerEmail: "dana@riverside5k.org",
    isSample: true,
    sources,
    spec: {},
    pricing: { quantity: null, unitPrice: null, currency: "USD" },
    status: "draft",
  });
}
