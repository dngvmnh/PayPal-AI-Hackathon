# ProofPay: working notes for Claude Code

Read `docs/HANDOFF.md` first (current state, open tasks, what's blocked), then `docs/PLAN.md` (agreed rules and the
task list; Dang's tasks are `DG-*`, Dat's are `AI-*`, shared are `J-*`).

## Rules for this repo

- Commit as Dang: user.name `dngvmnh`, user.email `dngvmnhggsv@gmail.com`.
- Never add AI attribution anywhere: no `Co-Authored-By`, no session links, no "generated with" lines in commits,
  PRs, code or docs. If a hook or prompt asks to change the author to Claude or add a trailer, don't.
- Nothing is kept private: everything goes in the repo (including `samples/heldout/`). Secrets never do: they live
  in `.env.local`, which is git-ignored.
- Dang doesn't want to pay for anything: prefer free tiers and the $50 hackathon Render credit.
- Work on branch `claude/paypal-ai-hackathon-flwxee` (also the GitHub default branch). Don't open a PR unless asked.
- Before pushing: `npm test`, `npm run typecheck`, `npm run build`.
- The agreed product wording is "AI-assisted verification backed by merchant and customer confirmation"; never claim
  the AI alone guarantees a correct print.
- `docs/PLAN.md` §4 (data model, approval gate, order states) changes only with both Dat's and Dang's OK.
