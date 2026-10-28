import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { splitThread } from "../lib/sample.ts";
import { SPEC_FIELDS } from "../lib/types.ts";

// Structural checks only: answer keys reference real sources and files, and follow samples/FORMAT.md.
const GROUPS = ["quantity_sizes", "text_dates", "colors", "pricing"];
const ARTWORK_FIELDS = ["year", "date", "name", "url", "text_line", "ink_colors"];

const dir = "samples/heldout";
const cases = readdirSync(dir).filter((d) => statSync(path.join(dir, d)).isDirectory());

test("there are three held-out cases", () => assert.equal(cases.length, 3));

for (const c of cases) {
  test(`held-out case ${c} is well formed`, () => {
    const p = (f: string) => path.join(dir, c, f);
    const order = JSON.parse(readFileSync(p("order.json"), "utf8"));
    const expected = JSON.parse(readFileSync(p("expected.json"), "utf8"));
    assert.equal(expected.set, "heldout");

    const ids = new Set<string>();
    if (existsSync(p("brief.md"))) ids.add("brief");
    splitThread(readFileSync(p("messages.txt"), "utf8")).forEach((_, i) => ids.add(`msg-${i + 1}`));
    const versions = new Map<string, number>();
    for (const d of order.designs) {
      ids.add(d.sourceId);
      versions.set(d.sourceId, d.versions.length);
      for (const v of d.versions) assert.ok(existsSync(p(v)), `${c}: missing ${v}`);
    }

    for (const i of expected.issues) {
      assert.ok(GROUPS.includes(i.checkGroup), `${c}/${i.id}: checkGroup ${i.checkGroup}`);
      assert.ok((SPEC_FIELDS as readonly string[]).includes(i.field), `${c}/${i.id}: field ${i.field}`);
      assert.ok(["info", "warning", "blocking"].includes(i.minSeverity));
      for (const s of i.sources) assert.ok(ids.has(s), `${c}/${i.id}: unknown source ${s}`);
      if (i.requiresArtworkFix) {
        assert.ok(i.requiredFields?.length, `${c}/${i.id}: artwork issue without requiredFields`);
        for (const r of i.requiredFields) assert.ok(ARTWORK_FIELDS.includes(r.field));
      }
    }
    for (const a of expected.artworkChecks) {
      const issue = expected.issues.find((i: { id: string }) => i.id === a.issueId);
      assert.ok(issue?.requiresArtworkFix, `${c}: artworkCheck for non-artwork issue ${a.issueId}`);
      assert.ok(a.version >= 2 && a.version <= versions.get(a.sourceId)!, `${c}: version ${a.version}`);
      assert.deepEqual(Object.keys(a.expect).sort(), issue.requiredFields.map((r: { field: string }) => r.field).sort());
    }
    if (expected.injection) {
      assert.ok(ids.has(expected.injection.sourceId));
      for (const id of expected.injection.mustStillReport) assert.ok(expected.issues.some((i: { id: string }) => i.id === id));
    }
  });
}
