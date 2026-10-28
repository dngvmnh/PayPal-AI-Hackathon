# Demo video checklist (J-5, owner Dang)

Script: `docs/PLAN.md` §7. Limit: under 3:00, public on YouTube, no copyrighted music or third-party trademarks
beyond PayPal's own checkout UI.

## Before recording (on the frozen build, tag `v0.9-freeze`)

- [ ] Live keys in the environment: `ANTHROPIC_API_KEY`, PayPal sandbox app keys, `PAYPAL_WEBHOOK_ID`; the app runs
      on the hosted URL (or a tunnel) so webhooks arrive. `GET /api/health` shows `ai: live`, everything configured.
- [ ] Fresh `DATA_DIR` so the order list only shows the demo order.
- [ ] Corrected Riverside artwork `front-v2.png` from Dat's samples (AI-6) on the desktop, ready to upload.
- [ ] Sandbox personal account email and password at hand; log out of PayPal in the browser first.
- [ ] Browser at 1280×800, zoom 110%, bookmarks bar hidden, notifications off. Second browser profile (or private
      window) for the customer view.
- [ ] Do one full dry run; a live AI check takes a while, so plan to cut the wait in editing.

## Shots

| Time | Screen | Show |
|---|---|---|
| 0:00–0:20 | Brief, email, artwork side by side | 120 vs 150 shirts; 2025 on the artwork |
| 0:20–1:05 | Merchant workspace | Run AI check; findings by group with quotes from each source |
| 1:05–1:40 | Merchant workspace | Confirm quantity and price; set required artwork fields; upload `front-v2.png`; re-check shows expected vs read; gate turns green at $1,425 |
| 1:40–2:10 | Customer proof page | Spec, artwork version, amount; tick, name, **Approve this version**; PayPal popup with the sandbox personal account; "Approved and paid" receipt |
| 2:10–2:30 | Merchant workspace | Order locked; **Start production & capture**; webhook event appears in the payment panel. Quick cut: second order, **Void & reopen**, revision 2 asks for a new approval |
| 2:30–3:00 | Sandbox dashboard + README | `custom_id` with the version hash; held-out eval numbers with the sample count; tools used. Say "AI-assisted verification backed by merchant and customer confirmation" |

## After

- [ ] Export at 1080p, check length < 3:00, upload to YouTube as **Public**, add the link to the README and Devpost.
