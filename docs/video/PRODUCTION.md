# Demo video production (J-5)

How the ProofPay demo video was made. Rules and the checklist for any re-recording are in
[`docs/VIDEO.md`](../VIDEO.md).

**Status (Nov 5):** cut finished and exported from Canva. Not yet on YouTube.

**Canva design:** [PayPal AI Hackathon](https://www.canva.com/design/DAHaCvWdRVY/c6QIuWS5NVrUii9cepAZDw/edit),
`DAHaCvWdRVY`: six 1920×1080 pages, one video per page.

**Export:** MP4, 1920×1080, 30 fps, 2:52 (172.01 s), 12.1 MB, with a silent audio track. No music. Voice-over script and steps: [`VOICEOVER.md`](VOICEOVER.md).

## Scenes

| Scene | Time | Shows | Source |
|---|---|---|---|
| S1 The problem | 0:00–0:20 | Brief 120 shirts, email 150 shirts, artwork 2025, "$1,140" | `samples/riverside-5k/` files, rendered as panels |
| S2 AI check | 0:20–1:02 | Run AI check, saved-result caption, five blocking issues, quotes | Hosted app, order A |
| S3 Resolve | 1:02–1:36 | Confirm values, required artwork fields, `front-v2.png`, re-check, green banner at $1,425 | Hosted app, order A |
| S4 Approve and pay | 1:36–2:06 | Exact version and hash, approval, PayPal sandbox popup, receipt | Hosted app, order A; popup from order B |
| S5 Capture or void | 2:06–2:26 | Lock, capture and webhook event, void and reopen, revision 2 | Hosted app, orders A and B |
| S6 Why it matters | 2:26–2:52 | `custom_id` in the sandbox log, held-out numbers and limits, tools, closing wording | `6-sandbox-custom-id.png`; numbers from `docs/eval/` |

## What is real and what is added

**Real:** every app screen, id, amount and webhook event, recorded from `v0.9-freeze` on the hosted app in demo mode
against the PayPal sandbox on Nov 5. The AI results are the saved ones, labelled in the app and captioned as such.

**Added in the edit:** captions, highlight boxes and an editor's cursor, all drawn over the recording. Browser actions
were scripted at close to normal pace, and each beat was retimed by ×0.78–1.20 to fit its slot, so no "4× speed" label
is needed.

**Disclosed differences:**

- The S4 PayPal popup comes from order B's payment, not order A's. Order A's popup showed a real login email during
  sign-in, so that footage was deleted. Both orders use the same sample, amount and sandbox buyer.
- The login step isn't shown.
- Hard cuts replace the planned split screen and wipe. S1 ends on a black "$1,140" card rather than a zoom.
- Captions are part of the scene videos, because the Canva connector can't set timing or animation on text.

## How it was built

1. Scripted Chrome recording of the hosted app, frames with timestamps. Merchant at 860×730 so the layout is one
   column and the Final spec (which names the garment brand) is never beside the findings. Customer at 1280×720.
2. Captions and cards rendered to PNG in Chrome with Space Grotesk, then combined with the frames in ffmpeg.
3. Scenes imported into Canva and placed one per page, then exported. Canva's page lengths matched the scene lengths
   without manual changes.

**Canva connector limits met:**

| Task | Result |
|---|---|
| Direct upload of MP4 or MOV | Rejected: "Unsupported file format" |
| Import from a public URL | Works, but not from GitHub release assets. Used a temporary branch through jsDelivr, since deleted |
| Text font, animation, transitions | No connector setting |

## Checks on the export

- Length 2:52, under the 3:00 limit.
- Matches the local cut frame by frame: lowest SSIM 0.971.
- Text recognition on every second of the export and on every half second of the local cut: no garment brand, no
  email other than the fictional `dana@riverside5k.org`, no password.
- Audio track is silence (-91 dB).
- Numbers and limits read at full size against `docs/eval/`.

Text recognition can miss small text, so a person should still watch it once before it goes public.

## Decision: garment brand stays out

The sample names a garment brand, and `docs/VIDEO.md` bans third-party trademarks beyond PayPal's checkout UI (Dang,
Nov 5). The brief in S1 starts at the Quantity line, the merchant is recorded in one column, and the proof page never
scrolls to the specification table.

## Manifest

| ID | Asset | Type | Scene |
|---|---|---|---|
| A01 | `samples/riverside-5k/brief.md`, lines from Quantity to Price | Real source | S1 |
| A02 | `samples/riverside-5k/messages.txt`, Mar 9 email | Real source | S1 |
| A03 | `samples/riverside-5k/front.png` | Real artwork | S1 |
| A04 | `docs/screenshots/6-sandbox-custom-id.png` | Real screenshot | S6 |
| R1 | Hosted app, order `42a56d3a` (captured) | Real recording | S2–S5 |
| R2 | Hosted app, order `19c70f0b` (revision 1 voided, revision 2 captured) | Real recording | S4, S5 |
| C01 | Title, caption, numbers, tools and end cards | Made for the video | All |
| V01 | Canva export, MP4 | Final | All |

No AI-generated images are used.
