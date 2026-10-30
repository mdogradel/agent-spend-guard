# Agent Spend Guard

## What I built and why

Busy people are starting to let AI agents buy things on their card. Those agents do not share one inbox, so a hotel booking and a coffee run are easy to lose track of, and hard to explain to a bank.

Agent Spend Guard is one place that connects those agents. They follow your spending rules and your stated intent. Anything over a limit waits for your OK. Every purchase shows which agent bought what, and when. If the purchase does not match the intent, you can copy a plain text dispute summary.

Nothing here moves money. There is no login, no bank connection, and no real card. Rules, receipts, and rates stay in this browser.

## APIs

The only external API is Frankfurter, used to turn a foreign currency amount into USD before the rules run.

`GET https://api.frankfurter.dev/v1/latest?base={from}&symbols={to}`

The rate is `rates.USD`. No API key.

A live quote is preferred. The call stops after 2.5 seconds. A successful quote is cached in the browser for 24 hours. If a refresh fails and an older live rate is already cached, that rate is used and the receipt says it may be stale. If there is no live rate, these currencies use a bundled snapshot from 2026-10-30: EUR, GBP, JPY, CAD, AUD, CHF, SEK, and NZD. The receipt labels that as a fallback. The fallback is not stored as a fresh cache entry, so the next purchase tries Frankfurter again. A currency that is not in the table, and has no cache, goes to the inbox and is never auto approved.

## How to run it

Live demo: https://agent-spend-guard-git-main-spf12.vercel.app/

Locally:

```bash
npm install
npm run dev
```

Open http://localhost:3000. The home page sends you to the dashboard.

Other commands:

```bash
npm test          # unit and property tests
npm run test:e2e  # Playwright
npm run build
npm start         # production server, after build
```

Playwright needs a Chromium install the first time: `npx playwright install chromium`.

Try it:

1. Go to Rules and click Load sample rules. That adds Dining, Travel, and Groceries limits, a $50 approval threshold, and a blocked Gambling category.
2. Go to the simulator and pick Hotel Lisbon. The stay is 480 EUR. The intent says checkout on 14 November 2026. The booking checks out on 15 November 2026.
3. Submit it. The EUR amount is converted to USD. If Frankfurter does not answer in time, the receipt uses the bundled fallback rate and says so. You should see a date mismatch and a Dispute button. Dispute copies a plain text summary. If the browser has no clipboard, the same text appears in a box you can select. With the sample $50 threshold loaded, this purchase still waits for approval because the USD amount is over $50. It is inside the $2,000 Travel limit. A missing exchange rate is not the reason.
4. To see the inbox, set a Dining limit below $8.50 and submit Coffee Shop. Approve it. The app warns you about the overage and lets you decline or override once. The override is stored on the receipt.

## Product decisions

The spec is in `.kiro/specs/agent-spend-guard` (`requirements.md`, `design.md`, `tasks.md`). These are the choices that shaped the app.

**Intent receipts and disputes.** Free text is a bad thing to parse. The agent keeps the raw instruction for the record, and also sends structured fields: max budget, budget currency, travel dates, and intended category. The mismatch checks use those fields. A price may be up to 5% over the budget. Dates must match exactly, because a wrong date is a wrong booking. Hotel Lisbon is off by one checkout day on purpose so the demo shows that flag. A dispute summary is plain text, with the intent, the purchase, each mismatch, the decision, and the exchange rate when there is one. The Dispute button only appears when there is a mismatch. If the clipboard is missing, the text is shown in a box you can copy by hand.

**Plain English decisions.** The rules engine is a pure function. It does not read the browser or the network. Invalid amount, a failed conversion, and a blocked category stop the check. A blocked category is declined, with no override. After that, the engine collects every other failure instead of stopping at the first one: approval threshold, missing intent, category limit, and merchant limit. The explanation is those reasons joined into one sentence, with the dollar amounts filled in.

**Approval threshold.** "Anything over $50 needs my ok" means $50 exactly can go through. The check is strictly greater than the threshold. If several limits apply, the purchase has to pass all of them. At approval time the pending item is left out of the spend total (`committedSpendExcluding`), so it is not counted twice. If it no longer fits, you see the overage and can decline or override once. The override is written on the receipt. Pending purchases count toward this month's spend, so the dashboard shows the worst case. At the start of a new month in your local timezone, old pending items expire instead of silently spending next month's budget.

**What was cut.** Real payments, bank connections, authentication, and multi user state. The requirements say the whole app runs in the browser on localStorage. That was the assignment, not a half finished backend.

## What I would add with more time

- A Stripe Issuing sandbox, so a decision can be tied to a test card, still without live charges.
- Real authentication, so the rules belong to a person instead of one browser profile.
- More than one user, with rules and receipts stored on a server. Today, clearing site data clears the history, and two people cannot share a rule set.
- A way to refresh the bundled FX snapshot. It is a fixed table from 2026-10-30, which is fine for the demo and wrong if it sits there for months.

## Specs, hook, and the AI log

Requirements, design, and the task list: `.kiro/specs/agent-spend-guard`.

Kiro hook: `.kiro/hooks`. It is set to append a log entry when an agent turn stops. Phases 1 to 3 of the log were filled in from chat after that hook failed. Entries from Task 1 on were written as the work happened.

The log itself: `docs/ai-collaboration/session-log.md`.

Tasks 1 to 3 were built in Kiro, in spec mode. Kiro free credits ran out during Task 4 and upgrading failed. Tasks 4 to 15 were finished with Cursor, directed by Mohit, against the same Kiro spec. The FX service files were already in the repo at that handoff and were checked rather than rewritten. The bundled rate table was added later, after a manual test where Hotel Lisbon timed out waiting on Frankfurter.
