import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Order } from "./types.ts";

// Prototype persistence: one JSON file plus an uploads folder. Swap for a database later.
const DATA_DIR = path.join(process.cwd(), ".data");
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
  return Object.values(await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrder(id: string): Promise<Order | undefined> {
  return (await readAll())[id];
}

export async function saveOrder(order: Order): Promise<Order> {
  const all = await readAll();
  all[order.id] = order;
  await writeAll(all);
  return order;
}

export async function saveUpload(orderId: string, name: string, data: Buffer): Promise<string> {
  const dir = path.join(UPLOADS_DIR, orderId);
  await fs.mkdir(dir, { recursive: true });
  const safe = `${newId()}-${name.replace(/[^\w.-]/g, "_")}`;
  await fs.writeFile(path.join(dir, safe), data);
  return safe;
}

export function uploadPath(orderId: string, file: string): string {
  // basename() keeps lookups inside the order's folder
  return path.join(UPLOADS_DIR, path.basename(orderId), path.basename(file));
}
