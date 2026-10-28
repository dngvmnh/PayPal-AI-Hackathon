import { NextResponse } from "next/server";
import { firstVersion, newId, saveOrder, saveUpload } from "@/lib/store.ts";
import { newOrder } from "@/lib/orders.ts";
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
    const v = await saveUpload(id, entry.name, Buffer.from(await entry.arrayBuffer()), entry.type);
    sources.push({
      id: `design-${++n}`,
      kind: "design",
      name: entry.name,
      file: v.file,
      mimeType: v.mimeType,
      versions: [firstVersion(v)],
    });
  }
  if (sources.length < 2) {
    return NextResponse.json(
      { error: "Add at least two sources (brief, messages, or design files) to cross-check." },
      { status: 400 },
    );
  }

  const order = await saveOrder(
    newOrder({
      id,
      title: str("title") || "Untitled order",
      customerName: str("customerName"),
      customerEmail: str("customerEmail"),
      sources,
    }),
  );
  return NextResponse.json({ id: order.id });
}
