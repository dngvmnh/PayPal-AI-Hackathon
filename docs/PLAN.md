# ProofPay: refined plan

**Deadline:** Nov 13, 2026 04:00 GMT+8 (= Nov 12, 20:00 UTC). Plan to submit by **Nov 11**, leaving a day of buffer.

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
   captured only when printing starts. If the job is cancelled before production, the hold can be voided instead of
   refunded (void is planned for M3).
5. **Closes the loop with the customer.** Every finding has a ready-to-send question, and the open ones are
   combined into one clarification email.

## 2. Status: what the scaffold already does

- [x] Next.js 16 + TypeScript app, JSON-file storage, MIT license
- [x] Create order from brief + message thread + design uploads
- [x] Claude Opus 5.5 multimodal cross-check with structured output (12 spec fields, severity, evidence, suggested
      value, customer question), refusal handling + server-side fallback
- [x] Demo mode with a sample order (Riverside 5K shirts, 5 planted blocking issues) that works without an API key
- [x] Merchant workspace: findings, confirm/waive/reopen, inline spec edits, clarification email draft
- [x] Payment gate + spec hash; unit tests (`npm test`)
- [x] Customer proof page with PayPal JS SDK buttons (`intent=authorize`)
- [x] PayPal Orders v2 create / authorize, Payments v2 capture, idempotency keys
- [ ] **Not yet tested against a live PayPal sandbox or the live Claude API.** That's first on the list below.

## 3. Milestones

| Dates | Milestone | Done when |
|---|---|---|
| Oct 27–29 | **M1: Live end-to-end** | Sandbox app created; full sample flow passes with live Claude + real sandbox authorize & capture. Fix whatever the live APIs disagree with. |
| Oct 30–Nov 2 | **M2: AI quality** | 5–8 more sample orders (banner, stickers, PDF proof, multi-page brief, a "clean" order with zero issues). A small eval script runs them all and checks the planted issues are found with no false blocking findings. Tune the prompt and effort level. |
| Nov 3–5 | **M3: PayPal depth** (pick 2) | (a) **PayPal Invoicing v2**: send the reconciled proof as a PayPal invoice for customers who prefer email. (b) **Webhooks** (`PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.CAPTURE.COMPLETED`) update order status. (c) **Void** the authorization when a job is cancelled. (d) Deposit split: authorize 100%, capture 50% at production start and 50% on pickup. |
| Nov 6–7 | **M4: Polish** | Corrected-artwork annotation (highlight the problem regions on the image), loading/progress for long analyses, empty/error states, mobile check. |
| Nov 8 | **M5: Hosting** | Deploy to Render (sponsor) or similar; swap JSON storage for SQLite or a persistent disk; hosted demo URL in README. |
| Nov 9–10 | **M6: Submission assets** | Demo video under 3 min, Devpost text, screenshots, architecture diagram, repo About + license visible. |
| Nov 11 | **Submit** | Leaves Nov 12 as buffer. |

## 4. Demo video script (≤ 3:00)

1. **0:00–0:20 Problem.** "A shop takes $1,140 for 120 shirts. The customer asked for 150 by email, and the artwork
   says 2025." Show the three sources side by side.
2. **0:20–1:10 AI check.** Run the check on the Riverside 5K order. Walk through the findings: quantity, sizes,
   artwork text (year, date, URL read from the image), 3rd ink color, total. Point out the quotes from each source.
3. **1:10–1:40 Resolve.** Confirm values, copy the clarification email. The gate turns green and the amount updates
   to $1,425.
4. **1:40–2:30 PayPal.** Customer proof page → approve → PayPal sandbox checkout → authorized. Back to merchant →
   capture. Show the `custom_id` with the spec hash in the sandbox dashboard.
5. **2:30–3:00 Why it matters.** Fewer reprints and disputes; payments tied to an approved version. Name the tools
   used (Claude, PayPal Orders/Payments, JS SDK).

## 5. Judging angles to emphasize in the write-up

- **Meaningful PayPal use:** checkout is the enforcement point. Authorize/capture maps onto the real print
  workflow, and the spec hash in `custom_id` helps with dispute evidence.
- **Meaningful AI use:** vision + cross-document reasoning + arithmetic checks, which a rules engine can't do on
  free-form emails and artwork.
- **Working prototype:** demo mode means judges can run it without any keys; full mode with sandbox keys.
- **Real market:** print shops, Etsy/print-on-demand sellers, promo product distributors, sign shops.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| AI misses an issue or invents one | Evidence must quote sources; the merchant confirms every value; eval set in M2; "info" severity for low-stakes notes |
| Long analysis latency on large PDFs | `maxDuration` 300s, progress UI in M4; consider a lower effort level for re-runs |
| PayPal sandbox authorize/capture quirks | Do M1 first; idempotency keys already in place |
| Hosting with file storage | Persistent disk or SQLite in M5 |
| Scope creep | M3 is "pick 2"; anything else goes to a "future work" section in the write-up |

## 7. Open decisions for you

1. **Product name.** "ProofPay" is a placeholder. Check it doesn't clash with an existing product before using it
   in the video.
2. **Which M3 PayPal extras.** My recommendation: Invoicing + webhooks. They show the most PayPal breadth.
3. **Sponsor tools.** Render for hosting costs nothing extra; APIMatic/Postman could be used for the PayPal client
   but aren't needed.
4. **Team.** If you have a designer, M4 (annotated artwork) is the best visual upgrade for the video.
