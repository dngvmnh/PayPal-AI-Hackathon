# Devpost write-up (draft, AI-10)

Paste into the Devpost form section by section. The held-out numbers come from the one run on the `prompt-locked` tag
(`docs/eval/heldout-2026-11-04-7b64f66.md`).

## Tagline

Catch mistakes in custom t-shirt orders before the customer pays, and tie the PayPal payment to the exact version they
approved.

## Inspiration

A custom t-shirt order lives in three places that drift apart: the shop's order brief, the email thread with the
customer, and the artwork file. The customer emails "make it 150", but the brief still says 120. The artwork still says
last year. A third ink color sneaks in that nobody priced. Shops usually find out after printing, when the only fixes
are a reprint or a refund.

## What it does

ProofPay is **AI-assisted verification backed by merchant and customer confirmation**.

1. The merchant creates an order with the brief, the message thread and the artwork.
2. A vision model reads them together and flags mismatches in four areas: quantity and sizes, printed text and dates,
   colors, and pricing. Each finding quotes its sources, and code checks that the quotes are really there.
3. The merchant settles every finding. Spec errors get a confirmed value. Artwork errors need a corrected file: the
   merchant sets what it must show, and the re-check compares that field by field.
4. The customer sees the spec, the current artwork and the amount, and approves that exact version. The approval is
   saved on the server with a hash of all of it, and any later change cancels it.
5. The customer pays with PayPal. The money is authorized, not taken. The merchant captures when production starts, or
   voids to cancel or to reopen the order for changes, which needs a new approval and a new payment.

The AI doesn't replace a human proof check. File hashes and evidence checks show it looked at the right file and cited
real text, not that it read the image perfectly. That's why the merchant confirms every value and the customer approves
the artwork itself.

## How we built it

- **App:** Next.js 16 and TypeScript on Node 22, with orders stored as JSON files. Hosted on Render's free plan.
- **PayPal (sandbox):**
  - JS SDK buttons with `intent=authorize` on the proof page.
  - Orders v2 to create and authorize. `custom_id` carries `order:revision:versionHash`, so each payment points at one
    approved version.
  - Payments v2 to capture and void.
  - Webhooks verified with `verify-webhook-signature` keep the status in sync.
  - Every call sends a `PayPal-Request-Id`, so retries don't create duplicates.
- **AI:** `qwen3-vl`, a vision model, through the Astropods AI gateway's OpenAI-style API, returning JSON against a
  schema generated from our Zod types. A reply that fails, or doesn't parse, fails the check, and a failed check blocks
  payment.
- **Code around the model:**
  - Evidence validation checks every quote against its source.
  - A field-by-field comparison decides whether corrected artwork passes.
  - Code checks do the arithmetic on the brief (sizes against quantity, price lists, totals).
  - The approval gate is plain code with unit tests.
- **Prompt injection:** source contents are treated as order data. One tuning sample hides an instruction to report
  nothing inside a customer email, and the quantity mismatch in it must still be reported.

## Evaluation

Sample orders have planted issues and answer keys, scored by `npm run eval`. Reports are in `docs/eval/`.

- **Held-out result, on 3 held-out orders, one run each, `prompt-locked` tag:** all 4 planted issues found, 0 false
  blocking findings, including 0 on the order with no issues and the one with a prompt injection attempt. 3 of 4 artwork
  re-check fields came out as expected. The fourth was a safe failure: a correct file was rejected because our year
  check, which is code and not the model, treated the team number `4471` as a second year. A merchant would have had
  to dismiss it by hand. The version with a leftover old year was correctly rejected. We fixed that check afterwards, so
  numbers outside 1900 to 2099 no longer count as years, but the result above is the run as measured, before the fix.
- **How to read it:** the held-out cases were committed before the prompt was locked, with a fingerprint, and weren't
  run or read during tuning. They were visible in the repo, and the same person who wrote them also did the final
  tuning, so they aren't fully independent. Three orders is a small sample, and we make no general accuracy claim.
- **Tuning set, for context only:** the tuning history is in `docs/eval/TUNING.md`, including what still falls short of
  our targets. Don't quote these numbers as accuracy: the code checks were written while looking at these samples.

## Demo notes for judges

The hosted demo runs without an AI key, so its AI results are saved ones, labelled as such in the UI. The re-check only
accepts the sample's own corrected file. PayPal, webhooks, file hashes and the field-by-field comparison are real in
sandbox. Add a gateway key to run live checks. The free instance sleeps when idle and loses its orders;
**Load sample order** recreates the sample.

## Challenges

- Model replies vary from run to run. Plain arithmetic was the least reliable part, so we moved it into code.
- A re-check sees the same sources, so the model reports the same problems again. One field is now one finding across
  runs, and the merchant's decision stays.
- Models leave out fields or send unexpected ones. We fill in what's safely unknown, and anything that could pass an
  artwork check without proof fails closed.
- A redeploy on a free host wipes orders, so a capture can succeed at PayPal while the app loses the order. We saw it
  once, and it's in our notes as a known limit of the free plan.

## Accomplishments

- One payment tied to one approved version, visible in the PayPal sandbox through `custom_id`.
- A real void-and-reopen flow that keeps the payment history and requires a fresh approval.
- Numbers that show where the AI still falls short, including the runs that missed our targets.

## What we learned

- "AI found it" isn't enough for money: every finding needs evidence a person can check.
- Authorize-then-capture fits made-to-order work, because the money is held while the order can still change.

## What's next

- Persistent storage and accounts for real shops.
- PDF artwork through the gateway, and more artwork formats.
- More evaluation orders from real shops, in formats we didn't write ourselves.

## Built with

`next.js`, `typescript`, `node.js`, `paypal-orders-api`, `paypal-payments-api`, `paypal-webhooks`,
`paypal-js-sdk`, `astropods-ai-gateway`, `qwen3-vl`, `zod`, `render`

## Before submitting

- [ ] Video link (https://youtu.be/nZE4VfG551E, public, under 3:00) and repo link added; repo public, license visible in About.
- [ ] Model name still matches what the eval ran on.
- [ ] Dang has reviewed the PayPal parts.
