# ProofPay: refined plan

**Deadline:** Nov 13, 2026 04:00 GMT+8 (= Thu Nov 12, 20:00 UTC).
**Sprint:** 2 weeks, Wed Oct 28 → Tue Nov 10. **Submit Wed Nov 11.** Thu Nov 12 is buffer only.
**Team:** 2 people, **A (Engine)** and **B (Experience)**. See §3.

## 1. The idea, sharpened

> "AI identifies inconsistencies across customer messages, design files, and briefs for custom-printed orders
> prior to payment collection."

**The problem.** In custom printing, the order is spread over a brief, a message thread, and an artwork file.
They drift apart: the customer changes the quantity by email, the artwork still has last year's date, the design
uses a color nobody priced. Shops find out after printing, and that means reprints, refunds, and disputes.
Payment is collected against a spec nobody actually reconciled.

**The insight.** Payment is the natural checkpoint. If you put the AI check *in front of* PayPal checkout, the
customer pays for a spec that was verified, and the payment record points to that exact version.

**One-line pitch.** *ProofPay won't let you charge for an order until the brief, the customer's messages, and the
artwork agree, and the PayPal payment is locked to the version the customer approved.*

### What makes this more than "a GPT wrapper with a PayPal button"
1. **Multimodal cross-referencing.** Claude reads the artwork image or PDF next to the text, so it catches
   "FUN RUN 2025" on the shirt when the brief says 2026.
2. **Payment gate as a hard rule** (`lib/gate.ts`), not a suggestion: no open blocking finding, complete pricing.
3. **Spec-locked payments.** A spec hash goes into the PayPal `custom_id`/`invoice_id`. Authorization is refused
   if the spec changed after checkout started. That gives the merchant an audit trail for disputes.
4. **Authorize at approval, capture at production.** Funds are held when the customer approves the proof and
   captured only when printing starts. If the job is cancelled before production, the hold is voided instead of
   refunded (task A7).
5. **Closes the loop with the customer.** Every finding has a ready-to-send question, and the open ones are
   combined into one clarification email.

## 2. Status at sprint start (Oct 27)

- [x] Next.js 16 + TypeScript app, JSON-file storage, MIT license
- [x] Create order from brief + message thread + design uploads
- [x] Claude Opus 5.5 multimodal cross-check with structured output (12 spec fields, severity, evidence, suggested
      value, customer question), refusal handling + server-side fallback
- [x] Demo mode with a sample order (Riverside 5K shirts, 5 planted blocking issues) that works without an API key
- [x] Merchant workspace: findings, confirm/waive/reopen, inline spec edits, clarification email draft
- [x] Payment gate + spec hash; unit tests (`npm test`)
- [x] Customer proof page with PayPal JS SDK buttons (`intent=authorize`)
- [x] PayPal Orders v2 create / authorize, Payments v2 capture, idempotency keys
- [ ] **Not yet run against a live PayPal sandbox or the live Claude API.** This is day 1–2 (A2, A3).

## 3. Sprint plan

### 3.1 Sprint goal

> By Tue Nov 10, a **hosted** ProofPay that a judge can run on 7 sample orders, with live AI checks scored by
> an eval, the full PayPal lifecycle (authorize → capture / void, webhooks, invoice), a demo video under 3
> minutes, and a finished Devpost write-up.

### 3.2 Roles

| | **A: Engine** | **B: Experience** |
|---|---|---|
| Owns | AI pipeline, PayPal integration, API routes, storage, deploy, eval harness, setup docs | All UI, sample orders + answer keys, demo story, video, Devpost text, screenshots + diagram |
| Main files | `lib/ai.ts`, `lib/paypal.ts`, `lib/store.ts`, `app/api/**`, `scripts/eval.ts` | `app/**/page.tsx`, `app/components/**`, `app/globals.css`, `samples/**`, `docs/**`, `README.md` |
| Reviews | B's PRs that touch `lib/` or API routes | A's PRs that touch UI or copy |

Rule for boundaries: **A ships an API route with a typed response, then B builds the UI on it.** When B
needs a route that doesn't exist yet, B builds against a stub with the agreed JSON shape and A fills it in.

### 3.3 Capacity

About 6 focused hours on weekdays and 3–4 on weekends, so **≈ 10 working days per person**. Must + Should
work is 9.75 d for A and 9.5 d for B, so slack is only about half a day each. That is why §3.7 has cut rules,
and why stretch tasks (X) only start once that person's Must and Should tasks are merged.

### 3.4 Backlog

Estimates are in days (d) of focused work. **P** = priority: **M**ust, **S**hould, **X** = stretch.

#### Shared

| ID | Task | Owner | Est | P | Done when |
|---|---|---|---|---|---|
| J1 | Kickoff: agree roles, create GitHub Project board from this backlog, set branch protection on `main` | A+B | 0.1 | M | Board has every task below as an issue with owner + label |
| J2 | Mid-sprint review (Tue Nov 3): live demo of full flow, read eval scores, cut or keep the Should/Stretch items | A+B | 0.1 | M | Decision written under §3.7 |
| J3 | Feature freeze (end of Sat Nov 7): only bug fixes, copy and assets after this | A+B | — | M | Tag `v0.9-freeze` |
| J4 | Fresh-machine dry run: a person who didn't write the code follows the README on a clean clone *and* uses the hosted URL | A+B | 0.25 | M | Every step works without help; fixes filed |
| J5 | Submit on Devpost; check video is public, repo public, license shows in About | A+B | 0.25 | M | Confirmation email received |

#### A: Engine

| ID | Task | Est | P | Depends | Done when |
|---|---|---|---|---|---|
| A1 | Create PayPal sandbox REST app, a business and a personal test account; Anthropic key; share secrets via a password manager (never in git) | 0.25 | M | — | Both people can run full mode locally |
| A2 | Live Claude run on the Riverside sample. Fix schema/SDK issues. Log latency, token usage, cost per check | 0.5 | M | A1 | All 5 planted issues found live; numbers noted in §3.8 |
| A3 | Live PayPal: create → approve with sandbox buyer → authorize → capture. Check `custom_id`, `invoice_id`, items in the sandbox dashboard | 1 | M | A1 | Screenshot of the sandbox transaction showing the spec hash |
| A4 | Eval harness `npm run eval`: run every sample in `samples/*/` through live analysis, compare with `expected.json`, print recall of planted issues and count of false *blocking* findings, save a markdown report | 1 | M | B2 (first 2 samples) | Report generated for all samples |
| A5 | Prompt + effort tuning from eval results; record before/after scores | 1 | M | A4 | Recall ≥ 90%, ≤ 1 false blocking finding across all samples, clean order has 0 blocking |
| A6 | PayPal webhooks `/api/paypal/webhook`: verify signature (`/v1/notifications/verify-webhook-signature`), handle `PAYMENT.AUTHORIZATION.CREATED/VOIDED`, `PAYMENT.CAPTURE.COMPLETED/DENIED`, store events on the order | 1 | M | A3 | Sandbox webhook simulator events change order status; bad signature → 400 |
| A7 | Cancel order: void authorization (`POST /v2/payments/authorizations/{id}/void`), new `cancelled` status | 0.5 | M | A3 | Void shows in sandbox; gate and UI respect `cancelled` |
| A8 | PayPal Invoicing v2: "Send as PayPal invoice" creates + sends an invoice whose items and note carry the reconciled spec and hash; poll or webhook `INVOICING.INVOICE.PAID` to mark paid | 1.5 | S | A3 | Sandbox buyer receives invoice and pays; order goes to paid |
| A9 | "Add customer reply" API: append a message source, re-run analysis, return diff (new / still open / now resolved findings, matched by field) | 0.5 | S | A2 | Unit test for the diff function |
| A10 | Storage: move from JSON file to SQLite (`node:sqlite`), keep the same `store.ts` interface | 0.5 | M | — | Tests pass; data survives restarts on the host |
| A11 | Deploy to Render with a persistent disk; env vars; register production webhook URL; demo mode on by default for visitors without keys | 0.5 | M | A6, A10 | Public URL runs the full sample flow |
| A12 | Hardening: request size limits, rate-limit `/analyze` on the hosted demo, tell the model that sources are data and not instructions (prompt-injection in customer emails), friendly error messages | 0.5 | M | A2 | A sample email that says "ignore previous instructions" doesn't change the result |
| A13 | Artwork annotation data: add optional normalized bounding boxes to design evidence in the schema | 1 | X | A5 | Boxes roughly cover the wrong text on 3+ samples; feature hidden if not good enough |
| A14 | Freeze bug fixes, technical review of the write-up | 0.5 | M | J3 | No open bugs labelled `demo-blocker` |
| A15 | README final pass: hosted URL and judge quickstart at the top, setup steps, tools section, B10's screenshots | 0.5 | M | A11, B10 | J4 dry run passes |
| | **Total Must + Should** | **9.75** | | | |

#### B: Experience

| ID | Task | Est | P | Depends | Done when |
|---|---|---|---|---|---|
| B1 | Run locally in demo mode, walk the flow as merchant and as customer, file UX issues | 0.25 | M | — | Issues filed on the board |
| B2 | 6 more sample orders, each with source files and an `expected.json` answer key (also write one for `riverside-5k`) (field + severity of each planted issue). Designs rendered from HTML with Playwright like `samples/riverside-5k/front.html`. **Deliver 2 by end of Thu Oct 29** so A4 can start | 2 | M | — | See sample list in §3.5 |
| B3 | Sample picker on the dashboard: load any sample, with a one-line description of what's wrong in it | 0.5 | M | B2 | All 7 samples load |
| B4 | Merchant workspace polish: loading state with elapsed time for long checks, empty and error states, filter findings by severity, sticky payment-gate banner, mobile layout | 1 | M | B1 | Lighthouse accessibility ≥ 90; usable at 375px width |
| B5 | Customer proof page: mobile layout, success state with receipt details, "Request changes" button that sends a note back (becomes a message source via A9) | 1 | M | A9 for the note | Customer flow works on a phone |
| B6 | "Customer replied" UI: paste a reply, re-run, show what changed (new / resolved / still open) | 1 | S | A9 | Riverside sample: pasting "yes, 2026 and Sunday" resolves the text finding |
| B7 | Order timeline panel: AI checks, resolutions, proof sent, PayPal events from webhooks | 0.5 | X | A6 | Timeline shows every step of the demo run |
| B8 | Invoice + cancel buttons and states in the workspace | 0.5 | S | A7, A8 | Both flows work from the UI |
| B9 | Branding: final name check, simple logo, favicon, colors | 0.25 | M | — | Name decision recorded in §7 |
| B10 | Architecture diagram (sources → Claude → findings → gate → PayPal) + 6 screenshots | 0.5 | M | J3 | Images in `docs/` |
| B11 | Devpost write-up: inspiration, what it does, how we built it, tools used and how, challenges, what's next | 1 | M | A5 scores | A reviews it for technical accuracy (A14) |
| B12 | Demo video: final script (§4), record on the hosted build, edit to < 3:00, no copyrighted music, upload to YouTube as public | 1.5 | M | A11, J3 | Public YouTube link, duration < 3:00 |
| B13 | Artwork annotation overlay: draw A13's boxes on the design image, highlight on hover of a finding | 1 | X | A13 | Looks good in the video, or gets cut |
| | **Total Must + Should** | **9.5** | | | |

### 3.5 Sample orders (B2)

Each sample tests something different, so the eval covers the main kinds of mistakes:

| Sample | Design file | Planted issues |
|---|---|---|
| `riverside-5k` (exists) | PNG | quantity change, size sum, wrong year/date/URL, extra ink color, stale total |
| `bakery-banner` | **PDF** proof | banner 6×3 ft in brief vs 8×3 ft in the PDF; grommets requested by email, missing in brief; phone number digit swapped |
| `sticker-tiers` | PNG | die-cut 3" vs 2" in email; quantity tier price applied wrong (500 priced at the 250 rate) |
| `cafe-mugs` | PNG | text runs into the handle area; customer asked for black mugs, brief says white |
| `law-firm-cards` | PDF, 2 pages | email address typo on the back; customer switched to matte, brief says gloss |
| `team-caps` | PNG | embroidery thread count (6 colors) over the 4-color limit quoted; ship-to address changed in the last email |
| `clean-order` | PNG | **none.** All sources agree; tests that the AI doesn't invent blocking issues |

### 3.6 Day-by-day schedule

| Day | Date | A: Engine | B: Experience | Checkpoint |
|---|---|---|---|---|
| 1 | Wed Oct 28 | J1, A1, A2 | J1, B1, B9, start B2 | Kickoff |
| 2 | Thu Oct 29 | A3 | B2 (deliver 2 samples by end of day) | Live end-to-end works |
| 3 | Fri Oct 30 | A4 | B2 | |
| 4 | Sat Oct 31 | A5 | B2 done, B3 | All 7 samples in eval |
| 5 | Sun Nov 1 | A10 | B4 | |
| 6 | Mon Nov 2 | A6 | B4 done, start B5 | |
| 7 | Tue Nov 3 | A7, A9 | B5 | **J2 mid-sprint review** |
| 8 | Wed Nov 4 | A8 | B6 | |
| 9 | Thu Nov 5 | A8 done, A12 | B8; B7 if ahead | All Should items merged |
| 10 | Fri Nov 6 | A11 (deploy) | Polish + bug fixes; B13 only if A13 started | Hosted URL live |
| 11 | Sat Nov 7 | A13 (stretch) or bug fixes | B13 (stretch) or polish | **J3 feature freeze** at end of day |
| 12 | Sun Nov 8 | Bug bash on hosted build; re-run eval on host | B10, B11 draft | |
| 13 | Mon Nov 9 | A15, review B11 | B12 record | **J4 dry run** |
| 14 | Tue Nov 10 | A14 | B12 edit + upload, B11 final | Everything ready |
| — | Wed Nov 11 | J5 | J5 | **Submit** |
| — | Thu Nov 12 | buffer | buffer | Deadline 20:00 UTC |

### 3.7 Mid-sprint review (J2): cut rules

At J2, check the board and apply these rules in order:

1. If **A3** (live PayPal) or **A5** (eval targets) isn't done → drop A8 (Invoicing) and A13/B13 (annotation). A
   finishes the Musts first, and B takes over B6.
2. If the eval misses the targets, keep tuning (A5) instead of starting A8. Accuracy matters more than one more
   PayPal feature.
3. If everything is on track → keep all Should items, and B adds B7 (timeline). Start the stretch annotation (A13/B13) only on Fri Nov 6
   and only if the eval is green.

Decisions: _(fill in on Nov 3)_

### 3.8 Working agreement

- **Branches:** one branch per task, named `A6-webhooks`, `B5-proof-mobile`, etc. PR into `main`, with the other
  person as reviewer; review within 24 h. `main` must always run the demo.
- **Definition of done:** merged to `main`; `npm test` and `npm run build` pass; works in demo mode *and* full
  mode; the board card is moved; any new env var is added to `.env.example` and the README.
- **Daily sync:** 10 minutes or async in chat. Say what you did yesterday, what you're doing today, and what blocks
  you. Raise a blocker within 2 hours, not at the next sync.
- **Secrets:** only in `.env.local` and the Render dashboard. Run `git diff --cached` before every commit.
- **Live API budget:** keep live Claude runs to the eval and real testing. Use demo mode for UI work. Record cost
  per check from A2 here: _(fill in)_

## 4. Demo video script (≤ 3:00)

1. **0:00–0:20 Problem.** "A shop takes $1,140 for 120 shirts. The customer asked for 150 by email, and the artwork
   says 2025." Show the three sources side by side.
2. **0:20–1:10 AI check.** Run the check on the Riverside 5K order. Walk through the findings: quantity, sizes,
   artwork text (year, date, URL read from the image), 3rd ink color, total. Point out the quotes from each source.
3. **1:10–1:40 Resolve.** Paste the customer's reply and re-run (B6), confirm the rest. The gate turns green and the
   amount updates to $1,425.
4. **1:40–2:30 PayPal.** Customer proof page → approve → PayPal sandbox checkout → authorized. Back to merchant →
   capture; the timeline shows the webhook events. Show the `custom_id` with the spec hash in the sandbox dashboard.
   Quick cut: the same proof sent as a PayPal invoice (A8).
5. **2:30–3:00 Why it matters.** Fewer reprints and disputes; payments tied to an approved version. Show the eval
   score across the samples. Name the tools used (Claude, PayPal Orders/Payments/Invoicing, JS SDK, webhooks).

## 5. Judging angles to emphasize in the write-up

- **Meaningful PayPal use:** checkout is the enforcement point. Authorize/capture/void maps onto the real print
  workflow, the spec hash in `custom_id` helps with dispute evidence, and invoicing covers customers who pay by
  email.
- **Meaningful AI use:** vision + cross-document reasoning + arithmetic checks, which a rules engine can't do on
  free-form emails and artwork. Back it with the eval numbers.
- **Working prototype:** hosted URL plus demo mode, so judges can run it without any keys; full mode with sandbox keys.
- **Real market:** print shops, Etsy/print-on-demand sellers, promo product distributors, sign shops.

## 6. Risks and mitigations

| Risk | Owner | Mitigation |
|---|---|---|
| AI misses an issue or invents one | A | Evidence must quote sources; merchant confirms every value; eval with targets (A4/A5); "info" severity for low-stakes notes |
| Prompt injection in customer emails | A | A12: sources are marked as data; injection sample in the eval |
| Long analysis latency on large PDFs | A/B | `maxDuration` 300s; elapsed-time loading state (B4); lower effort for re-runs if needed |
| PayPal sandbox authorize/capture/webhook quirks | A | Done on day 2 (A3); idempotency keys already in place; webhook simulator for testing |
| Hosting with file storage | A | SQLite + persistent disk (A10/A11) |
| Video takes longer than planned | B | Script is fixed now (§4); record on day 13 with a day to spare |
| One person blocked or unavailable | A+B | Cut rules in §3.7; each person reviews the other's area, so either can pick up a task |
| Scope creep | A+B | Nothing new after J3 freeze; extra ideas go to "What's next" in the write-up |

## 7. Open decisions

1. **Product name.** "ProofPay" is a placeholder. B9 checks it doesn't clash with an existing product before it
   goes in the video.
2. **Who is A and who is B.** A suits whoever is stronger on backend/APIs; B suits whoever is stronger on UI,
   writing and video.
3. **Sponsor tools.** Render for hosting (A11). Postman could be used for a PayPal API collection in the repo, but
   it isn't needed.
