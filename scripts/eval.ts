// Eval harness (AI-7): runs the live AI check on the sample orders and scores it against their answer keys.
//   npm run eval                     tuning set, one run per sample
//   npm run eval -- --runs 3         repeat each sample, since the model's answers vary between runs
//   npm run eval -- --set heldout    AI-12: only on the commit tagged prompt-locked, and only once
// Makes real AI calls using the keys in .env.local. Writes a Markdown report to docs/eval/.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const set = arg("set", "tuning");
const runs = Number(arg("runs", "1"));
if (!["tuning", "heldout"].includes(set) || !(runs >= 1)) {
  console.error("Usage: npm run eval -- [--set tuning|heldout] [--runs N]");
  process.exit(1);
}

const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const commit = git("rev-parse --short HEAD");
const REPORTS = "docs/eval";

if (set === "heldout") {
  // The held-out numbers only mean something if the prompt was frozen first and they were measured once.
  let tags: string[] = [];
  try {
    tags = git("tag --points-at HEAD").split("\n");
  } catch {}
  if (!tags.includes("prompt-locked")) {
    console.error("Refusing: the held-out set runs only on the commit tagged prompt-locked.");
    process.exit(1);
  }
  if (existsSync(REPORTS) && readdirSync(REPORTS).some((f) => f.startsWith("heldout-"))) {
    console.error(`Refusing: ${REPORTS} already has a held-out report. The held-out run happens once.`);
    process.exit(1);
  }
  if (git("status --porcelain")) {
    console.error("Refusing: commit or stash your changes first, so the report matches the tagged prompt.");
    process.exit(1);
  }
}

// Eval orders must not land in the app's real data folder. store.ts reads this when it is first imported.
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "proofpay-eval-"));

const { analyzeOrder } = await import("../lib/ai.ts");
const { processArtworkRecheck } = await import("../lib/artwork-recheck.ts");
const { compareVerifications, scoreFindings } = await import("../lib/eval.ts");
const { currentArtworkHashes } = await import("../lib/gate.ts");
const { addArtworkVersion, applyAnalysis, newOrder, resolveFinding } = await import("../lib/orders.ts");
const { splitThread } = await import("../lib/sample.ts");
const { firstVersion, newId, saveUpload } = await import("../lib/store.ts");

type Order = import("../lib/types.ts").Order;
type RequiredFields = { field: import("../lib/types.ts").RequiredArtworkField; value: string }[];
type ExpectedSample = import("../lib/eval.ts").ExpectedSample;
type FindingsScore = import("../lib/eval.ts").FindingsScore;
type FieldCheck = import("../lib/eval.ts").FieldCheck;

if (!process.env.ASTRO_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.error("The eval needs a live AI key: set ASTRO_GATEWAY_API_KEY in .env.local.");
  process.exit(1);
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf" };
const mimeOf = (file: string) => MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";

const root = set === "heldout" ? "samples/heldout" : "samples";
const samples = readdirSync(root)
  .filter((d) => d !== "heldout" && statSync(path.join(root, d)).isDirectory() && existsSync(path.join(root, d, "expected.json")))
  .sort();
if (!samples.length) {
  console.error(`No samples found in ${root}.`);
  process.exit(1);
}

async function upload(id: string, dir: string, file: string) {
  return saveUpload(id, file, readFileSync(path.join(dir, file)), mimeOf(file));
}

async function loadOrder(dir: string): Promise<Order> {
  const meta = JSON.parse(readFileSync(path.join(dir, "order.json"), "utf8"));
  const id = newId();
  const briefFile = path.join(dir, "brief.md");
  const sources: Order["sources"] = [];
  if (existsSync(briefFile)) sources.push({ id: "brief", kind: "brief", name: "Order brief", text: readFileSync(briefFile, "utf8") });
  splitThread(readFileSync(path.join(dir, "messages.txt"), "utf8")).forEach((m, i) =>
    sources.push({ id: `msg-${i + 1}`, kind: "message", ...m }),
  );
  for (const d of meta.designs) {
    const v = await upload(id, dir, d.versions[0]);
    sources.push({ id: d.sourceId, kind: "design", name: d.name, file: v.file, mimeType: v.mimeType, versions: [firstVersion(v)] });
  }
  return newOrder({ id, title: meta.title, customerName: meta.customerName, customerEmail: meta.customerEmail, sources });
}

interface Call {
  seconds: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** One live check through the same code the app uses. */
async function check(order: Order, calls: Call[]): Promise<Order> {
  const start = Date.now();
  const call: Call = { seconds: 0 };
  calls.push(call);
  let result;
  try {
    result = await analyzeOrder(order);
  } finally {
    call.seconds = (Date.now() - start) / 1000;
  }
  const { analysis, demo, model, usage } = result;
  Object.assign(call, usage);
  modelName = model;
  const applied = applyAnalysis(order, analysis, { model, demo, artworkHashes: currentArtworkHashes(order) });
  return processArtworkRecheck(applied, analysis);
}

/** Settle the first check as the key says, so the re-check runs as it would after a careful merchant. */
function settle(order: Order, expected: ExpectedSample, score: FindingsScore): Order {
  let o = order;
  for (const f of order.analysis!.findings) {
    const issueScore = score.issues.find((i) => i.findingId === f.id);
    const issue = expected.issues.find((i) => i.id === issueScore?.id);
    if (issue?.requiresArtworkFix) {
      o = resolveFinding(o, f.id, { type: "require_artwork", requiredFields: issue.requiredFields as RequiredFields });
    } else if (issue && !f.requiresArtworkFix) {
      o = resolveFinding(o, f.id, { type: "confirm", value: issue.correctValue ?? f.suggestedValue ?? "as agreed", typedByHand: true });
    } else if (f.severity !== "info") {
      o = resolveFinding(o, f.id, { type: "dismiss", reason: "Not in the answer key for this eval", checkedArtworkMyself: true });
    }
  }
  return o;
}

async function recheck(name: string, dir: string, expected: ExpectedSample, order: Order, score: FindingsScore, calls: Call[]) {
  const checks: (FieldCheck | { issueId: string; version: number; skipped: string })[] = [];
  const meta = JSON.parse(readFileSync(path.join(dir, "order.json"), "utf8"));
  const versions = [...new Set(expected.artworkChecks.map((c) => c.version))].sort((a, b) => a - b);
  let o = settle(order, expected, score);
  let newBlocking = 0;

  for (const version of versions) {
    for (const d of meta.designs) {
      const file = d.versions[version - 1];
      if (file) o = addArtworkVersion(o, d.sourceId, await upload(o.id, dir, file));
    }
    const before = new Set(o.analysis!.findings.map((f) => f.id));
    o = await check(o, calls);
    newBlocking += o.analysis!.findings.filter((f) => !before.has(f.id) && f.severity === "blocking").length;

    for (const c of expected.artworkChecks.filter((x) => x.version === version)) {
      const findingId = score.issues.find((i) => i.id === c.issueId)?.findingId;
      if (!findingId) {
        checks.push({ issueId: c.issueId, version, skipped: "issue missed in the first check" });
        continue;
      }
      const verifications = (o.analysis!.verifications ?? []).filter((v) => v.findingId === findingId);
      checks.push(...compareVerifications(c.issueId, version, c.expect, verifications));
    }
  }
  console.log(`  ${name}: re-check done (${newBlocking} new blocking finding(s))`);
  return { checks, newBlocking };
}

interface Result {
  name: string;
  run: number;
  error?: string;
  expected: ExpectedSample;
  score?: FindingsScore;
  checks?: Awaited<ReturnType<typeof recheck>>["checks"];
  /** which step threw: a first-check failure has no score */
  failedAt?: "first check" | "re-check";
  newBlocking?: number;
}

let modelName = "";
const calls: Call[] = [];
const results: Result[] = [];

for (const name of samples) {
  const dir = path.join(root, name);
  const expected = JSON.parse(readFileSync(path.join(dir, "expected.json"), "utf8")) as ExpectedSample;
  for (let run = 1; run <= runs; run++) {
    console.log(`${name} run ${run}/${runs}`);
    const result: Result = { name, run, expected };
    results.push(result);
    try {
      const first = await check(await loadOrder(dir), calls);
      result.score = scoreFindings(expected, first.analysis!.findings);
      for (const i of result.score.issues) console.log(`  ${i.found ? "found " : "MISSED"} ${i.id}`);
      const again = await recheck(name, dir, expected, first, result.score, calls);
      result.checks = again.checks;
      result.newBlocking = again.newBlocking;
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
      result.failedAt = result.score ? "re-check" : "first check";
      console.log(`  FAILED: ${result.error}`);
    }
  }
}

// ---------- Report ----------

const scored = results.filter((r) => r.score);
const issues = scored.flatMap((r) => r.score!.issues);
const found = issues.filter((i) => i.found);
const artworkFixWrong = found.filter((i) => !i.artworkFixCorrect);
const falseBlocking = scored.reduce((n, r) => n + r.score!.falseBlocking.length, 0);
const fieldChecks = scored.flatMap((r) => r.checks ?? []);
const ran = fieldChecks.filter((c): c is FieldCheck => "field" in c);
const skipped = fieldChecks.length - ran.length;
const invalid = scored.reduce((n, r) => n + r.score!.invalidEvidence.length, 0);
const failedFirst = results.filter((r) => r.failedAt === "first check").length;
const failedRecheck = results.filter((r) => r.failedAt === "re-check").length;
const newBlocking = results.reduce((n, r) => n + (r.newBlocking ?? 0), 0);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
const sum = (key: "seconds" | "inputTokens" | "outputTokens") => calls.reduce((n, c) => n + (c[key] ?? 0), 0);

const lines = [
  `# Eval report: ${set} set`,
  "",
  `- Date: ${new Date().toISOString()}`,
  `- Commit: \`${commit}\`${git("status --porcelain") ? " (with uncommitted changes)" : ""}`,
  `- Model: \`${modelName}\``,
  `- Samples: ${samples.length}, ${runs} run(s) each`,
  `- AI calls: ${calls.length}, average ${(sum("seconds") / (calls.length || 1)).toFixed(1)}s, ${sum("inputTokens")} input and ${sum("outputTokens")} output tokens in total`,
  "",
];

if (set === "heldout") {
  // Same recipe as samples/heldout/README.md. Git may change line endings on Windows, so a mismatch needs a look.
  const fingerprint = () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
    const list = walk(root)
      .filter((f) => path.basename(f) !== "README.md")
      .map((f) => `./${path.relative(root, f).split(path.sep).join("/")}`)
      .sort()
      .map((f) => `${createHash("sha256").update(readFileSync(path.join(root, f))).digest("hex")}  ${f}\n`)
      .join("");
    return createHash("sha256").update(list).digest("hex");
  };
  const recorded = readFileSync(path.join(root, "README.md"), "utf8").match(/\b[0-9a-f]{64}\b/)?.[0];
  const now = fingerprint();
  lines.push(`- Prompt tag: \`prompt-locked\``, `- Held-out fingerprint: \`${now}\` (${now === recorded ? "matches" : `DIFFERS from the recorded \`${recorded}\``})`, "");
}

lines.push(
  "## Summary",
  "",
  "| Measure | Result | Target (tuning set) |",
  "|---|---|---|",
  `| Recall of planted issues | ${found.length}/${issues.length} (${pct(found.length, issues.length)}) | at least 90% |`,
  `| False blocking findings | ${falseBlocking} | at most 1 in total, 0 on \`clean-order\` |`,
  `| \`requiresArtworkFix\` correct | ${found.length - artworkFixWrong.length}/${found.length} of found issues | all |`,
  `| Re-check fields as expected | ${ran.filter((c) => c.ok).length}/${ran.length}${skipped ? ` (${skipped} skipped: issue missed first)` : ""} | all |`,
  `| Findings with invalid evidence | ${invalid} | |`,
  `| New blocking findings on a re-check | ${newBlocking} | |`,
  `| Failed first checks (not in recall) | ${failedFirst}/${results.length} | |`,
  `| Failed re-checks | ${failedRecheck}/${results.length} | |`,
  "",
);

if (set === "tuning") {
  const planned = ["riverside-5k", "school-club", "band-merch", "company-retreat", "clean-order", "injection-email"];
  const missing = planned.filter((s) => !samples.includes(s));
  if (missing.length) lines.push(`**Incomplete set:** the plan has 6 tuning samples; missing ${missing.map((m) => `\`${m}\``).join(", ")}.`, "");
}

lines.push("## By sample", "");
for (const r of results) {
  lines.push(`### ${r.name}, run ${r.run}`, "");
  if (r.error) lines.push(`Failed at the ${r.failedAt}: ${r.error}`, "");
  if (!r.score) continue;
  const s = r.score;
  for (const i of s.issues) {
    const note = i.found ? (i.artworkFixCorrect ? "" : " (wrong `requiresArtworkFix`)") : i.tooLow ? ` (reported only as ${i.tooLow})` : "";
    lines.push(`- ${i.found ? "Found" : "**Missed**"}: ${i.id}${note}`);
  }
  if (!s.issues.length) lines.push("- No planted issues in this sample.");
  for (const f of s.falseBlocking) lines.push(`- **False blocking** (${f.field}): ${f.title}`);
  for (const f of s.invalidEvidence) lines.push(`- Invalid evidence (${f.field}): ${(f.evidenceProblems ?? []).join(" ")}`);
  for (const id of s.injectionMissed) lines.push(`- **Injection may have suppressed**: ${id}`);
  for (const c of r.checks ?? []) {
    if ("field" in c) {
      lines.push(`- Re-check v${c.version} ${c.issueId} / ${c.field}: expected ${c.expected}, got ${c.actual}${c.ok ? "" : ` **(wrong)**${c.reason ? `: ${c.reason}` : ""}`}`);
    } else lines.push(`- Re-check v${c.version} ${c.issueId}: skipped, ${c.skipped}`);
  }
  if (r.newBlocking) lines.push(`- ${r.newBlocking} new blocking finding(s) appeared on the re-check`);
  lines.push("");
}

mkdirSync(REPORTS, { recursive: true });
let file = path.join(REPORTS, `${set}-${new Date().toISOString().slice(0, 10)}-${commit}.md`);
for (let n = 2; existsSync(file); n++) file = path.join(REPORTS, `${set}-${new Date().toISOString().slice(0, 10)}-${commit}-${n}.md`);
writeFileSync(file, `${lines.join("\n")}\n`);
console.log(`\nRecall ${found.length}/${issues.length}, false blocking ${falseBlocking}, report: ${file}`);
