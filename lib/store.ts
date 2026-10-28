import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sha256 } from "./gate.ts";
import { deriveStatus } from "./orders.ts";
import type { ArtworkVersion, Order } from "./types.ts";

// Prototype persistence: one JSON file plus an uploads folder. Swap for a database later.
// On a host, point DATA_DIR at a persistent disk.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "orders.json");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

async function readAll(): Promise<Record<string, Order>> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeAll(all: Record<string, Order>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(all, null, 2));
}

export function newId(): string {
  return randomUUID().slice(0, 8);
}

export async function listOrders(): Promise<Order[]> {
  const orders = await Promise.all(Object.values(await readAll()).map(normalize));
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const order = (await readAll())[id];
  return order && normalize(order);
}

/** Bring orders saved by older versions of the app up to the current data model. */
async function normalize(order: Order): Promise<Order> {
  const o = order as Order & { paypal?: unknown; approvedSpecHash?: unknown };
  o.iteration ??= 1;
  o.approvals ??= [];
  o.payments ??= [];
  o.history ??= [];
  for (const s of o.sources) {
    if (s.kind === "design" && s.file && !s.versions?.length) {
      const data = await fs.readFile(uploadPath(o.id, s.file)).catch(() => Buffer.from(""));
      s.versions = [
        { version: 1, file: s.file, mimeType: s.mimeType ?? "application/octet-stream", sha256: sha256(data), uploadedAt: o.createdAt },
      ];
    }
  }
  if (o.analysis) {
    o.analysis.status ??= "succeeded";
    o.analysis.artworkHashes ??= Object.fromEntries(
      o.sources.filter((s) => s.versions?.length).map((s) => [s.id, s.versions!.at(-1)!.sha256]),
    );
  }
  delete o.paypal;
  delete o.approvedSpecHash;
  o.status = deriveStatus(o);
  return o;
}

export async function saveOrder(order: Order): Promise<Order> {
  const all = await readAll();
  all[order.id] = order;
  await writeAll(all);
  return order;
}

/** Store an uploaded design file and return it as an artwork version (without version number and date). */
export async function saveUpload(
  orderId: string,
  name: string,
  data: Buffer,
  mimeType: string,
): Promise<Omit<ArtworkVersion, "version" | "uploadedAt">> {
  const dir = path.join(UPLOADS_DIR, orderId);
  await fs.mkdir(dir, { recursive: true });
  const file = `${newId()}-${name.replace(/[^\w.-]/g, "_")}`;
  await fs.writeFile(path.join(dir, file), data);
  return { file, mimeType, sha256: sha256(data) };
}

/** A design source's first version, as stored on the order at creation. */
export function firstVersion(v: Omit<ArtworkVersion, "version" | "uploadedAt">): ArtworkVersion {
  return { ...v, version: 1, uploadedAt: new Date().toISOString() };
}

export function uploadPath(orderId: string, file: string): string {
  // basename() keeps lookups inside the order's folder
  return path.join(UPLOADS_DIR, path.basename(orderId), path.basename(file));
}
