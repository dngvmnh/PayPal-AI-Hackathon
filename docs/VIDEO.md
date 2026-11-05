# Demo video checklist (J-5)

Script: `docs/PLAN.md` §7. The Nov 5 cut, how it was made and its manifest: `docs/video/PRODUCTION.md`. Limit: under 3:00, public on YouTube, no copyrighted music or third-party trademarks
beyond PayPal's own checkout UI.

## Which AI results the video uses

Payment, webhooks, the file hashes and the field-by-field comparison are real in both modes. Only the AI's answers
can differ.

| Step | Live mode | Saved mode |
|---|---|---|
| First AI check | Live model on Riverside | `demo-analysis.json`, labelled "demo fixture" |
| Re-check of `front-v2.png` | Live model reads the file | `demo-recheck.json`, labelled "saved re-check … (not a live check)". Works only for the exact bytes of that file |
| Field-by-field comparison | Code, on the model's reading | Code, on the saved reading |
| PayPal authorize, capture, void, webhooks | Real sandbox | Real sandbox |

**Default: saved mode, on the hosted app, with the label in frame and the line below as a caption (and in the voice-over, if one is added):** "this run uses a saved AI result
for the sample, so the demo needs no AI key." The eval numbers shown at the end come from live runs.

**Use live mode only if `npm run eval -- --runs 3` on the frozen build shows, for `riverside-5k`:** all 5 planted
issues found in all 3 runs, and no new blocking findings on the re-check. New blocking findings keep the order from
reaching "ready for approval", so the flow would stall on camera. Nov 4 result at `345036e`: all 5 issues found in all
3 runs, but one re-check added a new blocking finding, so saved mode stays (see `docs/eval/TUNING.md`).

If live mode is used: set `ASTRO_GATEWAY_API_KEY`, `ASTRO_GATEWAY_URL` and `ASTRO_MODEL` on Render only for the
recording, wait for the redeploy, record, then remove them and confirm `GET /api/health` shows `ai: demo` again.
The rate limits cap the damage while the key is set, but the key still shouldn't stay on a public app.

## Before recording (on the frozen build, tag `v0.9-freeze`)

- [ ] Auto-deploy is off on Render, and nobody pushes during the recording. A deploy wipes all orders.
- [ ] `GET /api/health` on https://proofpay-vpw3.onrender.com shows the expected `ai` mode, and PayPal and the webhook
      as `configured`. Load the app a few minutes early: a sleeping instance takes about a minute to wake, and waking
      also clears the order list.
- [ ] Download `front-v2.png` from the link in the **Artwork** panel, ready to upload.
- [ ] Required values at hand. Printed text: **Year** = `2026`, **Date** = `Sunday, May 17`, **URL** = `riverside5k.org`.
      Ink colors: **Ink colors** = `white, safety orange`.
- [ ] Sandbox personal account email and password at hand; log out of PayPal in the browser first.
- [ ] Browser at 1280×800, zoom 110%, bookmarks bar hidden, notifications off. Second browser profile (or private
      window) for the customer view.
- [ ] Do one full dry run. Keep one order going to the end in a single sitting, so the instance doesn't sleep midway.

## Shots

| Time | Screen | Show |
|---|---|---|
| 0:00–0:20 | Brief, email, artwork side by side | 120 vs 150 shirts; 2025 on the artwork |
| 0:20–1:02 | Merchant workspace | Run AI check; findings with quotes from each source; the mode label |
| 1:02–1:36 | Merchant workspace | Confirm quantity, sizes and total; set required artwork fields; upload `front-v2.png`; re-check shows expected vs read; gate turns green at $1,425 |
| 1:36–2:06 | Customer proof page | Artwork version 2, amount, version hash (not the spec table, which names the garment brand); tick, name, **Approve this version**; PayPal popup with the sandbox personal account; "Approved and paid" receipt |
| 2:06–2:26 | Merchant workspace | Order locked; **Start production & capture**; webhook event appears in the payment panel (refresh if needed, it can take a few seconds). Quick cut: second order, **Void & reopen**, revision 2 asks for a new approval |
| 2:26–2:52 | Sandbox log + README | `custom_id` with the version hash; held-out eval numbers with the sample count, as measured; tools used. Say "AI-assisted verification backed by merchant and customer confirmation" |

## After

- [x] Export at 1080p, check length < 3:00, upload to YouTube as **Public** (https://youtu.be/nZE4VfG551E), add the link to the README.
- [ ] Add the link to the Devpost form.
- [ ] If keys were added for recording, confirm they are removed.
