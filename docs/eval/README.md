# Development evaluation

This is Dat's AI/evaluation work. It does not call PayPal, modify application orders or require deployment. Reports measure the six named **tuning** orders, not unseen users or overall accuracy.

```powershell
# Structural check only, no model calls or credits:
npm.cmd run eval -- --check-only

# All six tuning orders and corrected-artwork checks (up to nine live model calls):
npm.cmd run eval

# Inspect a specific failure without re-running every order:
npm.cmd run eval -- --case school-club

# Detection only; full tuning targets cannot pass with re-checks skipped:
npm.cmd run eval -- --initial-only
```

The runner loads `.env.local` without displaying secrets. A configured live provider is required except for `--check-only`. It never falls back to demo output. Staging is isolated in ignored `.eval-runs/`; Markdown and JSON reports go here with timestamps. Calls are sequential, with no automatic retries. A provider error is recorded as a failure, not a clean order or a measured miss. An incomplete run cannot pass targets or publish aggregate recall.

Matching follows `samples/FORMAT.md`: one-to-one `field`, `checkGroup` and minimum severity. This coarse field-level recall does **not** prove that every sub-error within a finding, suggested value or explanation is correct. Validated pipeline analyses, source hashes, evidence failures, non-blocking clutter and `requiresArtworkFix` classification are retained for inspection. Visual evidence marked `unverified` is reported separately from invalid text evidence.

For corrected-artwork tests, the runner supplies answer-key requirements and known merchant corrections **after** the initial check. This tests the verifier with correct merchant instructions; it does not score the model's ability to choose those instructions. A missing finding is not inserted to improve the score. Initial model input contains only the order's brief, messages and current artwork, never the answer key.

The tuning targets in `docs/PLAN.md` are evaluated alongside zero invalid-evidence findings. When running a subset, its report does not represent all six orders. A passing tuning run is not a held-out result. Latencies are measured; token usage is emitted by the provider logger, while aggregate API cost is not measured.

**Held-out mode is deliberately disabled.** Do not open or run `samples/heldout/` before the prompt and postprocessing code are frozen and reviewed. The planned held-out run will need a separate guarded extension after prompt lock. The existing `tests/samples.test.ts` reads held-out fixtures: before lock, use explicitly selected test suites rather than `npm test`.

All fixtures are synthetic. The three new artwork PNGs have editable SVG sources. No results should be used as a general accuracy claim.


Scores measure the application pipeline (model **plus** deterministic ink/size checks), not raw LLM ability. JSON properties named `raw` contain the validated pipeline analysis before order reconciliation, not an unmodified provider response. Detected real findings below the answer key's severity threshold are still eligible for the verifier test driver; they continue to count as detection misses. This separates severity classification from corrected-artwork verification. Earlier reports predate this driver fix, as noted in STATUS.md.
