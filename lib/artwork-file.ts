import { sha256 } from "./gate.ts";
import type { Source } from "./types.ts";

const SUPPORTED_ARTWORK_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

export function verifyArtworkBytes(source: Source, bytes: Uint8Array): string {
  if (source.kind !== "design") {
    throw new Error("The source is not an artwork design.");
  }

  const current = source.versions?.at(-1);

  if (!current || !source.file || !source.mimeType) {
    throw new Error("The artwork has no current version or file.");
  }

  if (source.file !== current.file || source.mimeType !== current.mimeType) {
    throw new Error("The artwork file does not match its current version.");
  }

  if (!SUPPORTED_ARTWORK_TYPES.has(source.mimeType)) {
    throw new Error("The artwork file type is not supported.");
  }

  if (bytes.length === 0) {
    throw new Error("The artwork file is empty.");
  }

  const actualHash = sha256(bytes);

  if (!current.sha256 || actualHash !== current.sha256) {
    throw new Error("The artwork bytes do not match the current version hash.");
  }

  return actualHash;
}