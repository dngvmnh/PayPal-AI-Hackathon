import { NextResponse } from "next/server";
import { newId, saveOrder, saveUpload } from "@/lib/store.ts";
import { splitThread } from "@/lib/sample.ts";
import type { Source } from "@/lib/types.ts";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const id = newId();
  const sources: Source[] = [];

  if (str("brief")) sources.push({ id: "brief", kind: "brief", name: "Order brief", text: str("brief") });
  splitThread(str("messages")).forEach((m, i) =>
    sources.push({ id: `msg-${i + 1}`, kind: "message", ...m }),
  );
  let n = 0;
  for (const entry of form.getAll("designs")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (entry.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${entry.name} is larger than 20 MB` }, { status: 400 });
    }
    const file = await saveUpload(id, entry.name, Buffer.from(await entry.arrayBuffer()));
    sources.push({ id: `design-${++n}`, kind: "design", name: entry.name, file, mimeType: entry.type });
  }
  if (sources.length < 2) {
    return NextResponse.json(
      { error: "Add at least two sources (brief, messages, or design files) to cross-check." },
      { status: 400 },
    );
  }

  const order = await saveOrder({
    id,
    createdAt: new Date().toISOString(),
    title: str("title") || "Untitled order",
    customerName: str("customerName"),
    customerEmail: str("customerEmail"),
    sources,
    spec: {},
    pricing: { quantity: null, unitPrice: null, currency: "USD" },
    status: "draft",
  });
  return NextResponse.json({ id: order.id });
}
