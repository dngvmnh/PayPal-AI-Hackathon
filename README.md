# ProofPay

**AI catches mistakes in custom print orders before you take the customer's money.**

Custom print jobs (shirts, banners, stickers, packaging) are specified across three places that drift apart:
the shop's order brief, a long email or chat thread with the customer, and the design file the customer sent.
A changed quantity, last year's date left on the artwork, or a third ink color nobody priced turns into a reprint,
a refund, or a chargeback.

ProofPay reads all three with Claude (text **and** the design image or PDF), lists every inconsistency with quotes
from each source, and **blocks PayPal checkout until every blocking issue is settled**. The customer then approves
a single, reconciled proof and pays through PayPal. The payment is tied to that exact spec version.

> Built for the PayPal AI Hackathon (Devpost, 2026). Uses the PayPal sandbox only.

## How it works

1. **Collect sources.** The merchant creates an order with the brief, the pasted message thread, and design files
   (PNG/JPG/WebP/GIF/PDF).
2. **AI cross-check.** Claude (`claude-opus-5-5`, structured output) pulls out 12 spec fields from every source,
   checks the arithmetic (sizes add up to the quantity, quantity × unit price equals the total), reads the artwork
   for wrong text, dates, URLs and extra ink colors, and returns findings. Each finding has a severity, evidence
   quoted from each source, a suggested corrected value, and a question to send the customer.
3. **Resolve.** Spec errors: the merchant confirms the value. Artwork errors: the merchant sets what the artwork
   must show, uploads a corrected file (kept as a new version with its sha256), and re-runs the check. A finding
   can also be waived with a reason the customer sees, or dismissed as an AI error with a logged reason.
4. **Approval gate.** `lib/gate.ts` allows approval only when the latest check succeeded on the current artwork,
   no blocking or warning finding is open, artwork errors were fixed by a new file (or dismissed), and pricing is
   complete.
5. **Customer approval.** The customer sees the final spec, the exact artwork version, the amount and any waived
   exceptions, and approves that version. The approval is saved on the server with a hash of all of it. Any later
   change cancels the approval.
6. **PayPal.** The customer pays with PayPal Checkout (Orders v2, `intent: AUTHORIZE`); `custom_id` carries the
   order, iteration and approved version hash. The order is then locked.
7. **Capture or void.** The merchant captures when production starts (Payments v2), or voids: either to cancel,
   or to reopen the order for changes, which needs a new approval and a new payment. Webhooks keep the status in
   sync with PayPal.

## PayPal integration

| Step | API |
|---|---|
| Customer checkout button | PayPal JS SDK via `@paypal/react-paypal-js` (`PayPalButtons`, `intent=authorize`) |
| Create order with line items, `custom_id` = order:iteration:versionHash, `invoice_id` | `POST /v2/checkout/orders` |
| Hold funds once the customer has approved the version | `POST /v2/checkout/orders/{id}/authorize` |
| Capture when production starts | `POST /v2/payments/authorizations/{id}/capture` |
| Void to cancel, or to reopen the order for changes | `POST /v2/payments/authorizations/{id}/void` |
| Keep status in sync (`PAYMENT.AUTHORIZATION.CREATED/VOIDED`, `PAYMENT.CAPTURE.COMPLETED/DENIED`) | Webhook at `/api/paypal/webhook`, verified with `POST /v1/notifications/verify-webhook-signature` |

All calls send `PayPal-Request-Id` so retries are idempotent. Code: `lib/paypal.ts`.

## AI usage

| What | How |
|---|---|
| Model | Claude Opus 5.5 (`claude-opus-5-5`) through the official `@anthropic-ai/sdk` |
| Inputs | Brief and messages as text; design files as image/PDF content blocks (vision) |
| Output | Zod schema (`lib/types.ts` → `AIAnalysis`) enforced with structured outputs (`messages.parse`) |
| Safety | Handles `refusal` stop reasons and enables server-side `fallbacks: "default"` |
| Demo mode | Without `ANTHROPIC_API_KEY`, the bundled sample order uses a saved analysis (`samples/riverside-5k/demo-analysis.json`) so the whole flow can be tried offline |

Code: `lib/ai.ts`.

## Run it locally

Requirements: Node.js 20+.

```bash
git clone <this repo> && cd PayPal-AI-Hackathon
npm install
cp .env.example .env.local   # fill in the keys below
npm run dev                  # http://localhost:3000
```

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com (optional: leave empty for demo mode) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal Developer Dashboard → Apps & Credentials → **Sandbox** app |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Same sandbox client ID (used by the browser button) |
| `PAYPAL_WEBHOOK_ID` | Sandbox app → Webhooks → add `<your public URL>/api/paypal/webhook` with the four events above; copy its id. Optional locally (needs a public URL, e.g. a tunnel) |

Then click **Load sample order (Riverside 5K)** → **Run AI check** → settle the findings → **Open customer proof
page** → tick the box, type a name, **Approve this version** → pay with a sandbox *personal* account → back on the
order, **Start production & capture**, or **Void & reopen for changes** / **Void & cancel order**.

Tests: `npm test` (approval gate, finding rules, artwork versions, approval invalidation, payment iterations,
void/reopen, webhook handling, fixture integrity). Type check and build: `npm run build`.

## Project layout

```
app/                     Next.js App Router pages and API routes
  orders/[id]/           merchant review workspace
  p/[id]/                customer proof + PayPal checkout
  api/orders/...         create, analyze, finding actions, spec edits, artwork upload, approve,
                         PayPal create/authorize/capture/void
  api/paypal/webhook     verified PayPal webhook events
lib/
  ai.ts                  Claude cross-check (prompt, multimodal content, structured output)
  paypal.ts              PayPal REST client (Orders v2, Payments v2)
  gate.ts                approval gate + version hash
  orders.ts              state transitions: findings, artwork versions, approval, payments, status
  webhooks.ts            maps PayPal webhook events onto payment iterations
  store.ts               JSON-file persistence (.data/)
samples/riverside-5k/    sample brief, message thread, design PNG, demo analysis
docs/PLAN.md             roadmap to submission
```

## License

MIT, see [LICENSE](LICENSE).
