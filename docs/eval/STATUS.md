# AI evaluation status — 3 November 2026

The current priority is the agreed MVP: find contradictions with traceable evidence, verify corrected artwork, and hand the result to the approval/PayPal workflow. Further model comparisons are paused. PayPal/backend work remains Dang's.

Completed independently for Dat's scope:

- Six synthetic tuning orders, including clean and prompt-injection controls, with answer keys and artwork.
- `npm.cmd run eval`: isolated live evaluation, per-field detection, false blocking, invalid evidence, artwork-fix classification and corrected-artwork checks. Check-only mode makes no AI calls. Held-out access is disabled.
- Source-backed ink-inventory comparison and arithmetic checking of supported size breakdowns, without guessing missing sizes.
- 131 selected regression tests passed before the final evaluator-driver adjustment; its 10 targeted tests and TypeScript checking also passed afterward.

The pipeline is not ready for prompt lock. Observed problems include invented evidence source IDs or non-verbatim quotes, inconsistent severity, and malformed JSON. Validation continues to reject these failures; no failed output was turned into a successful approval.

## Measured development runs

These are application-pipeline results (model plus deterministic rules), not raw-model accuracy or a held-out benchmark.

| Model | Expected fields matched | False blocking findings | Invalid evidence findings | Workflow status |
|---|---|---|---|---|
| Qwen, with only service-interrupted cases retried | 11/12 | 2 | 1 | Tuning targets not met |
| Sonnet comparison | 12/12 initial fields | 0 | 1 | Riverside re-check returned invalid JSON; incomplete |

Qwen source reports: `tuning-2026-11-03T10-38-46-555Z.json` and `tuning-2026-11-03T10-50-05-058Z.json`. Code and dataset fingerprints matched before combining only service-interrupted cases. Completed cases with poor quality scores were retained. Sonnet report: `tuning-2026-11-03T10-53-59-630Z.json`. Both models' clean orders had no findings and their injection cases retained the real quantity finding. This tiny tuning set does not establish general reliability.

Earlier School Club artwork scoring did not exercise verification because its actual typo finding was below the answer key's minimum severity. The runner now uses an existing below-threshold finding for the verifier test while still counting it as a detection miss. Old reports have not been rewritten as passing; this driver adjustment was unit-tested, not followed by another live sweep.

## Next bounded AI task

Stabilize the output/evidence contract on the existing merchant-to-corrected-artwork flow: source IDs must refer to supplied sources, text quotes must be literal source-body spans, and malformed JSON must fail closed. Re-test affected cases. Do not add product features, more tuning cases or more model comparisons now.

The website model configuration remains unchanged. No held-out files were opened, no prompt-locked tag was created, and no commit/push was performed. Evaluation staging does not modify application orders or call PayPal.
