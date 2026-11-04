# Tuning history (AI-9)

All runs use `qwen3-vl` through the Astropods gateway, on the tuning set only. The targets are in `docs/PLAN.md` §5.
Each row links to its full report in this folder.

| Commit | What changed | Samples × runs | Recall | False blocking | Artwork fix correct | Re-check fields | Invalid evidence | New blocking on re-check | Failed first checks |
|---|---|---|---|---|---|---|---|---|---|
| [`ba60ff0`](tuning-2026-11-04-ba60ff0.md) | Baseline, before tuning | 3 × 3 | 18/27 (67%) | 0 | 18/18 | 16/16 | 3 | 5 | 0/9 |
| [`6b6889e`](tuning-2026-11-04-6b6889e.md) | Check list in the prompt, severity rule, all 6 samples | 6 × 2 | 20/24 (83%) | 4 | 20/20 | 12/12 | 0 | 2 | 0/12 |
| [`10c0ee4`](tuning-2026-11-04-10c0ee4.md) | Code checks for sizes and totals | 6 × 3 | 32/36 (89%) | 3 | 32/32 | 18/18 | 1 | 1 | 0/18 |
| [`47a8a23`](tuning-2026-11-04-47a8a23.md) | Price-list check, no worked-out totals | 6 × 3 | 33/36 (92%) | 4 | 33/33 | 18/18 | 3 | 3 | 0/18 |
| [`ce96a4c`](tuning-2026-11-04-ce96a4c.md) | Code checks read the brief and replace softer findings | 6 × 3 | 34/34 (100%) | 0 | 34/34 | 18/18 | 0 | 0 | 1/18 |
| [`8ab739e`](tuning-2026-11-04-8ab739e.md) | Parsing only: bad artwork claims dropped | 6 × 3 | 35/35 (100%) | 0 | 35/35 | 18/18 | 0 | 1 | 1/18 |
| [`345036e`](tuning-2026-11-04-345036e.md) | Parsing only: evidence without a value accepted | 6 × 3 | 36/36 (100%) | 2 | 35/36 | 18/18 | 1 | 1 | 0/18 |

## Reading the last three rows

The prompt and the code checks are the same in the last three rows, so together they show the run-to-run spread. Across
all three: recall 105/105 on 52 completed first checks, 2 false blocking findings, 2 new blocking findings on re-checks
and 2 failed first checks. A single report can land on either side of the targets.

- **Final report against the targets:** recall, re-check fields and `clean-order` meet them. False blocking (2, target
  at most 1) and `requiresArtworkFix` (35/36, target all) don't. Re-running until one report passes would only pick a
  lucky run, so the numbers stand as measured.
- **The `requiresArtworkFix` miss in `345036e`:** `band-merch` marked its garment color change as needing new artwork.
- **The two false findings in `345036e`:** `band-merch` reported a unit price that "assumes one color", and
  `injection-email` reported a total it worked out itself, although the prompt says not to.
- **Why recall is so high:** code now does the arithmetic. Those checks parse the formats the shop's brief uses, and
  they were written while looking at these samples. These numbers say nothing about orders in other formats; only the
  held-out run can speak to that, and even there the cases were written by the person who tuned.
