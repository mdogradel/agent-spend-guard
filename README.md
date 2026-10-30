# Agent Spend Guard

Agent Spend Guard is a small web app for trying out spending rules on purchases made by an AI agent. You set category limits, merchant limits, an approval threshold, and blocked categories. A mock agent submits a purchase. A rules engine approves it, sends it to an inbox, or declines it. Every purchase keeps an intent receipt, and a flagged purchase can produce a plain-text dispute summary.

Nothing here moves money. There is no login, no bank connection, and no real card. All of the data stays in this browser.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The home page sends you to the dashboard.

Other commands:

```bash
npm test          # unit and property tests
npm run test:e2e  # Playwright: approval override, and the Hotel Lisbon dispute
npm run build
```

Playwright needs a Chromium install the first time: `npx playwright install chromium`.

## Try the demo

1. Go to Rules and click Load sample rules. That adds Dining, Travel, and Groceries limits, a $50 approval threshold, and a blocked Gambling category.
2. Go to the simulator and pick Hotel Lisbon. The stay is 480 EUR. The intent says checkout on 14 November 2026. The booking checks out on 15 November 2026.
3. Submit it. The EUR amount is converted to USD. If Frankfurter does not answer in time, the receipt uses the bundled fallback rate and says so. You should see a date mismatch and a Dispute button. Dispute copies a plain-text summary. If the browser has no clipboard, the same text appears in a box you can select. With the sample $50 threshold loaded, this purchase still waits for approval because the USD amount is over $50. It is inside the $2,000 Travel limit. A missing exchange rate is not the reason.
4. To see the inbox, set a Dining limit below $8.50 and submit Coffee Shop. Approve it. The app warns you about the overage and lets you decline or override once. The override is stored on the receipt.

## How it is built

The rules engine is a pure function. It does not read the browser or the network. It checks the amount, then a failed currency conversion, then blocked categories. Those three stop the evaluation. After that it collects every other problem: the approval threshold (strictly over the amount), a missing intent, the category limit, and the merchant limit. Exact remaining budget is still inside the limit. The decision text joins every reason.

Foreign amounts are converted to USD before the rules run. The live rate comes from `https://api.frankfurter.dev/v1/latest?base={from}&symbols={to}`, and the number used is `rates.USD`. The call gives up after about 2.5 seconds. A fresh rate is cached for 24 hours. If a refresh fails and an older live rate is cached, that rate is used and the receipt says it may be stale. If there is no live rate, common currencies (EUR, GBP, JPY, CAD, and a few others) use a bundled fallback table dated 2026-10-30, and the receipt says it is a fallback. A currency that is not in that table, with no cache, still goes to the inbox and is never auto-approved.

The mismatch checker compares the structured intent with the purchase. Price allows a 5% grace. When the currencies match, it compares them directly. When they differ, it converts into the intent's currency with the cached rate. If that rate is missing, it skips the price check and records why. Dates have to match exactly. Hotel Lisbon is off by one day on purpose.

Intent receipts, rules, FX rates, and the last-seen month are stored in localStorage under keys that start with `asg_`. The Zustand store writes to storage before it updates the screen. Approving a pending purchase uses `committedSpendExcluding` so that purchase is not counted twice. At the start of a new local month, leftover pending items are marked expired and are not carried into the new budget.

The dispute summary is plain text: the original instruction, the purchase, each mismatch, the rules decision, and the exchange rate when there is one.

## How AI was used

The spec was written in Kiro, in spec mode: requirements, then design, then a task list. Tasks 1 to 3, and the FX service in task 4, were implemented there. Kiro's free credits ran out during task 4 and upgrading failed. Tasks 4 through 15 were then finished by a Cursor cloud agent, directed by Mohit, against the same spec. The running notes are in `docs/ai-collaboration/session-log.md`. Phases 1 to 3 of that log were backfilled from chat after a hook failed. Entries from task 1 on were written as the work happened.

## Known limitations

- This is mock mode only. A submitted purchase is not sent anywhere.
- Data lives in one browser profile. Clearing site data clears the rules and the history.
- A live Frankfurter quote is preferred, but the demo does not depend on it. Common currencies fall back to a snapshot from 2026-10-30. An unsupported currency with no cache still cannot be converted.
- There is one set of rules per browser, not per person.
- The dev server may mention Next.js instant navigation. These pages depend on localStorage, so they are not a static shell. Validation of that check is left off unless a route opts in.

## Next steps

- Connect a Stripe Issuing sandbox so a decision can be tied to a test card, still without live charges.
- Add real authentication so the rules belong to a person instead of a browser.
- Support more than one user, with rules and receipts stored on a server instead of only in localStorage.
