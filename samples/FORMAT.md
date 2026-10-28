# Sample order format

Every sample order (tuning or held-out) is one folder. The eval harness (AI-7) loads it the same way the app
loads an order, then compares the AI check with `expected.json`.

> Proposed by Dang for DG-12 so the held-out set could be written before AI-7 exists. Dat owns the harness and
> can change this format; if it changes, the held-out answer keys get the same mechanical change, noted in
> `samples/heldout/README.md`.

```
<sample>/
  order.json        title, customer, and the design files with their versions
  brief.md          the shop's order brief (optional)
  messages.txt      customer thread; one message per "--- header ---" line (same as the app's paste box)
  <artwork files>   PNG/JPG/PDF; corrected versions are separate files (e.g. front-v2.png)
  *.html            optional source the PNGs were rendered from
  expected.json     answer key
```

## `order.json`

```json
{
  "title": "Riverside 5K volunteer shirts",
  "customerName": "Dana Whitfield",
  "customerEmail": "dana@riverside5k.org",
  "designs": [
    { "sourceId": "design-front", "name": "front.png", "versions": ["front.png", "front-v2.png"] }
  ]
}
```

The first file in `versions` is what the customer sent. Later ones are corrected uploads, in order.
Message source ids are `msg-1`, `msg-2`, … in thread order; the brief is `brief`.

## `expected.json`

```json
{
  "set": "tuning | heldout",
  "notes": "free text for humans; never shown to the model",
  "issues": [
    {
      "id": "i1",
      "checkGroup": "quantity_sizes | text_dates | colors | pricing",
      "field": "quantity",
      "minSeverity": "warning",
      "requiresArtworkFix": false,
      "sources": ["brief", "msg-4"],
      "correctValue": "150"
    },
    {
      "id": "i2",
      "checkGroup": "text_dates",
      "field": "print_text",
      "minSeverity": "blocking",
      "requiresArtworkFix": true,
      "sources": ["design-front"],
      "correctValue": "RIVERSIDE 5K FUN RUN 2026",
      "requiredFields": [{ "field": "year", "value": "2026" }]
    }
  ],
  "maxFalseBlocking": 0,
  "artworkChecks": [
    {
      "issueId": "i2",
      "sourceId": "design-front",
      "version": 2,
      "expect": { "year": "pass" }
    }
  ]
}
```

- `issues`: every planted issue. A finding matches an issue when it has the same `field` (and the same
  `checkGroup` once AI-2 adds it) and at least `minSeverity`. Extra findings at `blocking` count as false
  blocking findings; `maxFalseBlocking` is the limit for this sample.
- `requiresArtworkFix` is what AI-3 should set for that issue.
- `artworkChecks`: what the verified re-check (AI-5a) must conclude for each required field when the given
  artwork version is current. `pass` means it may clear the finding, `fail` means it must not.
- `correctValue` may be `null` when the right value must be confirmed with the customer.
- `injection` (optional): `{ "sourceId", "mustStillReport": [issue ids] }` for a source containing a prompt
  injection; the listed issues must still be found.
- A clean order has `"issues": []`.
