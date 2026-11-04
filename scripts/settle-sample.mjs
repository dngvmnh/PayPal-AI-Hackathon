// Settles the Riverside sample the way a merchant does in demo mode: confirm the spec findings, require the corrected
// artwork fields, upload the sample's corrected file and re-check it. Used by e2e.mjs and sandbox.mjs.
import { readFile } from "node:fs/promises";

const REQUIRED = {
  print_text: [
    { field: "year", value: "2026" },
    { field: "date", value: "Sunday, May 17" },
    { field: "url", value: "riverside5k.org" },
  ],
  ink_colors: [{ field: "ink_colors", value: "white, safety orange" }],
};

export async function settleSample(base, id, analyzed) {
  const order = `${base}/api/orders/${id}`;
  const send = async (url, init) => {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${url} failed: ${res.status} ${json.error ?? ""}`);
    return json;
  };
  const act = (f, body) =>
    send(`${order}/findings/${f.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  for (const f of analyzed.analysis.findings.filter((f) => f.severity !== "info")) {
    await act(f, f.requiresArtworkFix
      ? { type: "require_artwork", requiredFields: REQUIRED[f.field] }
      : { type: "confirm", value: f.suggestedValue });
  }
  const form = new FormData();
  form.set("sourceId", "design-front");
  form.set("note", "Corrected year, date, website and inks");
  form.set(
    "file",
    new File([await readFile(new URL("../samples/riverside-5k/front-v2.png", import.meta.url))], "front-v2.png", { type: "image/png" }),
  );
  await send(`${order}/artwork`, { method: "POST", body: form });
  return send(`${order}/analyze`, { method: "POST" });
}
