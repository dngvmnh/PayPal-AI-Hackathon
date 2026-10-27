import { promises as fs } from "node:fs";
import { getOrder, uploadPath } from "@/lib/store.ts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const source = (await getOrder(id))?.sources.find((s) => s.file === file);
  if (!source?.file) return new Response("Not found", { status: 404 });
  const data = await fs.readFile(uploadPath(id, source.file));
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": source.mimeType ?? "application/octet-stream" },
  });
}
