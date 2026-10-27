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
3. **Resolve.** The merchant confirms or waives each finding, or copies the AI-written clarification email.
   Confirming a value updates the final spec and the amount due.
4. **Payment gate.** `lib/gate.ts` allows payment only when the check has run, no blocking finding is open, and
   pricing is complete.
5. **Customer proof + PayPal.** The customer sees the final spec and the artwork, ticks "I approve", and pays with
   PayPal Checkout (Orders v2, `intent: AUTHORIZE`). The spec hash goes into `custom_id`/`invoice_id`. If the spec
   changes between checkout and approval, authorization is refused.
6. **Production.** The merchant captures the authorization (Payments v2) when production starts.

## PayPal integration

| Step | API |
|---|---|
| Customer checkout button | PayPal JS SDK via `@paypal/react-paypal-js` (`PayPalButtons`, `intent=authorize`) |
| Create order with line items, `custom_id` = order:specHash, `invoice_id` | `POST /v2/checkout/orders` |
| Hold funds when the customer approves the proof | `POST /v2/checkout/orders/{id}/authorize` |
| Capture when production starts | `POST /v2/payments/authorizations/{id}/capture` |

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

Then click **Load sample order (Riverside 5K)** → **Run AI check** → confirm the 5 blocking findings →
**Send proof to customer** → **Open customer proof page** → approve and pay with a sandbox *personal* account →
back on the order, **Start production & capture payment**.

Tests: `npm test` (payment gate, resolution and pricing logic, fixture integrity). Type check and build: `npm run build`.

## Project layout

```
app/                     Next.js App Router pages and API routes
  orders/[id]/           merchant review workspace
  p/[id]/                customer proof + PayPal checkout
  api/orders/...         create, analyze, resolve, spec edits, PayPal create/authorize/capture
lib/
  ai.ts                  Claude cross-check (prompt, multimodal content, structured output)
  paypal.ts              PayPal REST client (Orders v2, Payments v2)
  gate.ts                payment gate + spec hash
  orders.ts              apply analysis, resolve findings, status machine
  store.ts               JSON-file persistence (.data/)
samples/riverside-5k/    sample brief, message thread, design PNG, demo analysis
docs/PLAN.md             roadmap to submission
```

## License

MIT, see [LICENSE](LICENSE).
