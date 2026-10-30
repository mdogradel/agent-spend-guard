# AI Collaboration Log — Agent Spend Guard

This log records design decisions, requirement clarifications, pushbacks, and changes made during the AI-assisted spec process. An entry is appended after every task.

---

## Phase 1 — Requirements Clarification

**Date:** Session start  
**What the user asked:** Before writing requirements, answer 5 clarifying questions about the user and edge cases.

### Q&A

**Q1: Rule conflict priority (merchant-level vs category-level limits)**  
*Answer:* Stricter limit wins. A purchase must pass every applicable rule — no loopholes.  
*Impact:* Requirements 4.2, 4.7 — rules engine evaluates all applicable rules; a purchase must pass every one to be auto-approved.

**Q2: Concurrent pending approvals that together would exceed a limit**  
*Answer:* Check at the moment the user taps approve. If the budget no longer fits, warn with the specific overage (e.g. "puts Dining $60 over") and present Decline or Override Once. Overrides are logged in the receipt.  
*Impact:* Requirements 5.2–5.5 — re-evaluation at approval time, overage warning modal, override log on receipt.

**Q3: Intent mismatch thresholds**  
*Answer:* 5% grace on price (FX and taxes drift). Dates are exact — any date difference is a flag because a wrong date is a wrong booking.  
*Impact:* Requirements 7.4 (5% grace), 7.5 (exact date match).

**Q4: Monthly reset and pending approvals**  
*Answer:* Pending items expire at month end, shown as "expired: monthly reset". Do not carry them over — that would silently spend next month's budget. The agent can resubmit.  
*Impact:* Requirements 6.1–6.5 — expiry logic, no carry-over, agent must resubmit.

**Q5: No-intent purchases**  
*Answer:* Always route to approval. No intent means no evidence if needed for a dispute, so it should never auto-approve.  
*Impact:* Requirements 4.9 — no-intent always escalates to `needs_approval` (except when blocked category applies first).

---

## Phase 2 — Requirements Pushbacks

Six targeted changes made after the initial requirements draft was written.

### Pushback 1 — Structured intent fields

**What the user said:** Parsing budget and dates out of free text is fragile. Have the agent send structured intent fields too: max budget, budget currency, dates, category. Keep the raw instruction text as the record, but run the mismatch checks on the structured fields.

**What changed:**
- Added `Intent_Text` and `Structured_Intent` to the glossary.
- Requirement 2: simulator now populates and allows independent override of all four structured fields (`maxBudgetAmount`, `budgetCurrency`, `travelDates[]`, `intendedCategory`).
- Requirement 7: mismatch checks now run against structured fields, not parsed free text. Receipt stores both.
- Requirement 8: dispute summary includes both `Intent_Text` and all structured fields.

### Pushback 2 — Price check in intent's currency

**What the user said:** The price check should compare in the intent's currency. If I said under 500 EUR, compare the EUR amount to 500, not the USD conversion — otherwise FX swings create fake mismatches.

**What changed:**
- Requirement 7.4: price mismatch now compares in `budget_currency`. If purchase currency differs from `budget_currency`, the purchase amount is converted to `budget_currency` using the stored FX rate before comparing. Both `max_budget_amount` and `budget_currency` must be present.
- Unit test list updated to cover same-currency direct comparison and cross-currency conversion cases.

*(Note: This was later superseded by Design Fix 3 — see below.)*

### Pushback 3 — Approval threshold strictly greater than

**What the user said:** The approval threshold should be strictly greater than. I said anything over $50 needs my ok, so exactly $50 goes through.

**What changed:**
- Requirement 4.4: changed from "equals or exceeds" to "strictly greater than the configured Approval_Threshold".
- Glossary entry for `Approval_Threshold` was already correct ("above which").

### Pushback 4 — Blocked category always wins

**What the user said:** Blocked category should always win. Requirement 4.9 says no-intent goes to approval regardless of other rules, but a blocked category purchase should still be declined even with no intent. Order should be: invalid amount, blocked, then everything else.

**What changed:**
- Requirement 4.10: invalid amount check "runs before all other rule evaluations".
- Requirement 4.3: blocked category "takes precedence over all rule evaluations except the invalid amount check".
- Requirement 4.7: evaluation order now `invalid amount → Blocked_Category → Approval_Threshold → no-intent → Category_Limit → Merchant_Limit`.
- Requirement 4.9: no-intent escalation only fires if the purchase "does not belong to a Blocked_Category".

### Pushback 5 — Collect all rule failures, not just the first

**What the user said:** Don't stop at the first failing rule. Collect every rule that fails and show them all in the explanation, like "over your $50 threshold and puts Travel $120 over the limit". The outcome is still the strictest one, but I want to see all the reasons.

**What changed:**
- Requirement 4.2: engine now collects all failing rules into a failure list; outcome derived from strictest failure.
- Requirement 4.7: `invalid amount` and `Blocked_Category` still short-circuit; `Approval_Threshold`, `no-intent`, `Category_Limit`, `Merchant_Limit` all evaluate in full and collect failures.
- Requirement 4.12: explanation is a single concatenated plain-English string covering every failure.

### Pushback 6 — Local timezone for monthly reset; simplify pending-items warning

**What the user said:** Monthly reset should use my local timezone, not UTC — otherwise my month flips at 4pm on the last day. Also simplify 1.9: when I edit a rule, just warn me how many pending items it affects, and re-check pending items against the new rules when I act on them.

**What changed:**
- Requirement 6.1: month boundary detection now uses user's local timezone.
- Requirement 6.2: expiry marking interprets origination timestamps in local timezone.
- Requirement 1.9: warning simplified to "how many are affected before saving"; re-evaluation happens lazily at approve/decline time.

---

## Phase 3 — Design Fixes

Four targeted fixes applied after the initial design draft.

### Design Fix 1 — `travelDates` on PurchaseRequest

**What the user said:** Date mismatch compares intent `travelDates` to the purchase's travel dates, but `PurchaseRequest` has no travel date field. Add `travelDates?: string[]` to `PurchaseRequest`, have Hotel Lisbon and Flight Tokyo presets fill it in, and make one of them off by a day so the demo shows a date mismatch.

**What changed:**
- Added `travelDates?: string[]` to `PurchaseRequest` interface.
- Hotel Lisbon preset: purchase `travelDates: ["2024-11-12", "2024-11-15"]` vs intent `travelDates: ["2024-11-12", "2024-11-14"]` — intentional checkout date mismatch for demo.
- Flight Tokyo: matching dates, no mismatch.
- Date mismatch check now explicitly compares `structuredIntent.travelDates` against `purchase.travelDates`.

### Design Fix 2 — Double-count on approval re-check

**What the user said:** At approval time, `committedSpend` already counts this pending item, so the re-check would count it twice. Exclude the receipt being approved from `committedSpend` when re-checking it.

**What changed:**
- Added `committedSpendExcluding(receiptId: string): CommittedSpend` getter to the Zustand store.
- `approvePurchase` calls this getter instead of `committedSpend()` to prevent double-counting.
- Added a "Approval Re-evaluation and Double-Count Prevention" subsection in the design.

### Design Fix 3 — Simplify price check to USD comparison

**What the user said:** Cross-currency price check is too complicated. Convert both amounts to USD using the cached rates and compare in USD. If either rate is missing, skip the price check and note "price check skipped, no rate" on the receipt.

**What changed:**
- Price mismatch check now converts both `maxBudgetAmount` and the purchase amount to USD via `fxCache` before comparing.
- `checkMismatches` signature updated to accept `usdEquivalentAmount: number | null` and `fxCache: FxRateCache`.
- Returns `{ flags, priceCheckSkipped, priceCheckSkipReason? }` — skips with note if either rate is missing.
- Added `priceCheckSkipped: boolean` and `priceCheckSkipReason?: string` to `IntentReceipt`.
- This supersedes Requirement Pushback 2 (budget-currency comparison) for the implementation; the requirement text was not re-opened but the design is the authoritative implementation guide.
- Unit tests updated: removed cross-currency-to-budget-currency case; added "rate missing → priceCheckSkipped = true" and "usdEquivalentAmount null → priceCheckSkipped = true" cases.

### Design Fix 4 — Correct Frankfurter API endpoint

**What the user said:** Please verify the Frankfurter endpoint against their current docs. I believe it's `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD`, and the response is `rates.USD`, not a flat `rate` field.

**What was verified:** Live-tested against `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD`. Response confirmed: `{"amount":1.0,"base":"EUR","date":"2026-10-29","rates":{"USD":1.113}}`. The `/v2` endpoint timed out and is not available.

**What changed:**
- Endpoint corrected to `GET https://api.frankfurter.dev/v1/latest?base={fromCurrency}&symbols={toCurrency}`.
- Rate parsed from `response.rates[toCurrency]`, not `response.rate`.
- All `/v2` references removed from the design.
- Rate fetch wrapped in `fetchFxRate(from, to)` for easy maintenance.
- Cache pseudocode updated to check `response.rates[toCurrency]` exists before accepting a response.

---

## Phase 4 — Task Planning

**Tasks generated:** 15 top-level tasks, dependency-ordered across 14 parallel waves.  
**User adjustment:** Reduce Playwright tests from 5 to 2 — keep only the approval override flow (14.2) and the Hotel Lisbon dispute (14.5). Tasks 14.1, 14.3, 14.4 removed.

---

*Entries below are appended after each implementation task.*

---

## Task 1 — Scaffold Next.js 15 project and configure tooling

**What the user asked:** Start with task 1.

**What was done:**
- Scaffolded Next.js 16.4.3 App Router project with TypeScript, Tailwind CSS, ESLint, `src/` layout, and `@/*` path alias (via temp dir due to existing `.kiro/` files in workspace).
- Installed dev dependencies: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `fast-check`, `@playwright/test`.
- Installed `zustand` as a production dependency.
- Installed Playwright Chromium browser via `playwright install --with-deps chromium`.
- Created `vitest.config.ts` (jsdom environment, globals, `@/` alias, setup file).
- Created `playwright.config.ts` (Chromium only, `http://localhost:3000`, webServer block).
- Created `vercel.json` (empty `{}`).
- Created directory skeleton: `src/types/`, `src/lib/`, `src/store/`, `src/components/`, `src/lib/__tests__/`, `tests/`.
- Added `test`, `test:watch`, `test:e2e` scripts to `package.json`.
- Fixed a broken `.bin/next` shim (caused by `cp -r` from temp dir) by reinstalling the `next` package.

**Build result:** `npm run build` passes cleanly — 4 static pages generated.

**Anything changed or rejected:** None. Followed the task spec exactly.

---

## Task 2 — Define all TypeScript interfaces and shared types

**What the user asked:** Go ahead with task 2.

**What was done:**
- Created `src/types/index.ts` with all domain interfaces from the design, organised into labelled sections:
  - **Rules:** `CategoryLimit`, `MerchantLimit`, `ApprovalThreshold`, `BlockedCategory`, `SpendingRule` union, `RuleSet`
  - **Purchase Request:** `StructuredIntent`, `PurchaseRequest` (including `travelDates?: string[]` from Design Fix 1)
  - **FX Rate Cache:** `FxRateCacheEntry`, `FxRateCache`
  - **Rules Engine Decision:** `DecisionOutcome`, `RuleFailure`, `EngineDecision`
  - **Rules Engine Input:** `CommittedSpend`, `EngineInput`
  - **Intent Receipt & Mismatch:** `MismatchFlagType`, `MismatchFlag`, `PurchaseStatus`, `OverrideLog`, `IntentReceipt` (including `priceCheckSkipped` and `priceCheckSkipReason` from Design Fix 3)
  - **Monthly Reset:** `MonthlyResetState`
- Added inline comments referencing key design decisions (threshold strictly-greater-than, stale flag, no-intent marker, etc.)
- Fixed a second stale `.bin/tsc` shim left from the `cp -r` scaffold step by reinstalling TypeScript.

**Verification:** `npx tsc --noEmit` and `npm run build` both pass with zero errors.

**Anything changed or rejected:** None.
