import { NextResponse } from "next/server";
import { addArtworkVersion } from "@/lib/orders.ts";
import { saveOrder, saveUpload } from "@/lib/store.ts";
import { withOrder, type IdParams } from "@/lib/http.ts";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

/** Multipart: sourceId, file, optional note. Adds a corrected version of a design file. */
export async function POST(req: Request, { params }: IdParams) {
  const form = await req.formData();
  return withOrder(params, async (order) => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 20 MB.`);
    if (!TYPES.has(file.type)) throw new Error("Use a PNG, JPG, WebP, GIF or PDF file.");
    const sourceId = String(form.get("sourceId") ?? "");
    const v = await saveUpload(order.id, file.name, Buffer.from(await file.arrayBuffer()), file.type);
    const note = String(form.get("note") ?? "").trim() || undefined;
    return NextResponse.json(await saveOrder(addArtworkVersion(order, sourceId, { ...v, note })));
  });
}
