# Implementation Plan: Agent Spend Guard

## Overview

Implement Agent Spend Guard as a Next.js 15 App Router application with client-side-only state (localStorage + Zustand). The plan follows a strict bottom-up dependency order: scaffold → types → domain layer → persistence → store → pages/components → tests. Property-based tests (fast-check) and Playwright integration tests come last, after all unit tests pass.

## Tasks

- [x] 1. Scaffold Next.js 15 project and configure tooling
  - [x] 1.1 Initialise Next.js 15 App Router project with TypeScript, Tailwind CSS, ESLint, and path aliases (`@/`)
    - Run `npx create-next-app@latest` with `--ts --tailwind --eslint --app` flags; confirm `src/` directory layout
    - Add `vitest`, `@vitejs/plugin-react`, `jsdom`, and `@testing-library/react` for unit testing
    - Add `fast-check` for property-based tests
    - Add `@playwright/test` for integration tests and run `playwright install`
    - Configure `vitest.config.ts` with jsdom environment and path alias resolution
    - Configure `playwright.config.ts` pointing at `http://localhost:3000`
    - _Requirements: 2.6, 10.1_

  - [x] 1.2 Add Zustand and configure project structure
    - Install `zustand`
    - Create directory skeleton: `src/types/`, `src/lib/`, `src/store/`, `src/components/`, `src/app/`
    - Add `vercel.json` (empty / default config) and confirm `next.config.ts` exports static-compatible settings
    - _Requirements: 1.7, 10.1_

- [x] 2. Define all TypeScript interfaces and shared types
  - [x] 2.1 Create `src/types/index.ts` with all domain types
    - Implement `CategoryLimit`, `MerchantLimit`, `ApprovalThreshold`, `BlockedCategory`, `SpendingRule`, `RuleSet`
    - Implement `StructuredIntent`, `PurchaseRequest`
    - Implement `FxRateCacheEntry`, `FxRateCache`
    - Implement `DecisionOutcome`, `RuleFailure`, `EngineDecision`
    - Implement `MismatchFlagType`, `MismatchFlag`, `PurchaseStatus`, `OverrideLog`, `IntentReceipt`
    - Implement `MonthlyResetState`
    - Implement `EngineInput`, `CommittedSpend` (used by rules engine)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.6, 4.1, 7.1, 7.2_

- [x] 3. Implement persistence layer
  - [x] 3.1 Create `src/lib/persistence.ts` with safe localStorage utilities
    - Implement `safeRead<T>(key, fallback): T` — wrap `localStorage.getItem` + `JSON.parse` in try/catch; log warning and return fallback on failure
    - Implement `safeWrite<T>(key, value): boolean` — wrap `localStorage.setItem` + `JSON.stringify` in try/catch; return `false` on `QuotaExceededError` or `SecurityError`
    - Implement `isLocalStorageAvailable(): boolean` — probe with a temp key; return `false` in private browsing environments
    - Export `STORAGE_KEYS` constant object for all four `asg_` prefixed keys
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 3.2 Write unit tests for persistence layer
    - Test `safeRead` with valid JSON, corrupt JSON (returns fallback), and missing key (returns fallback)
    - Test `safeWrite` with a mock that throws `QuotaExceededError` — must return `false`
    - Test `isLocalStorageAvailable` with a mock that throws on `setItem` — must return `false`
    - _Requirements: 10.6, 10.7_

- [x] 4. Implement FX conversion service
  - [x] 4.1 Create `src/lib/fx-service.ts` with `fetchFxRate` and `convertToUSD`
    - Implement `fetchFxRate(from: string, to: string): Promise<number>` — calls `https://api.frankfurter.dev/v1/latest?base={from}&symbols={to}` with a 5-second `AbortController` timeout; parses `response.rates[to]`; throws on 404/422 or unexpected shape
    - Implement `convertToUSD(amount, fromCurrency, cache, timeoutMs?): Promise<{ result: FxResult; updatedCache: FxRateCache }>` with the full cache-lookup logic: USD passthrough → cache hit < 24 h → fresh fetch → stale fallback → failed
    - Round stored rate to 6 decimal places
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x]* 4.2 Write unit tests for FX service
    - USD input — no fetch, rate = 1, `isStale = false`, `failed = false`
    - Cache hit under 24 h — no fetch, returns cached rate
    - Cache over 24 h + successful fetch — updates cache entry, returns fresh rate
    - API timeout + stale cache entry — returns stale rate, `isStale = true`
    - API failure + no cache — returns `failed = true`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Implement the rules engine
  - [x] 5.1 Create `src/lib/rules-engine.ts` with `evaluateRules` pure function
    - Implement the seven-step evaluation order with correct short-circuit behaviour (steps 1–3) and collect-all-failures model (steps 4–7)
    - Step 1: invalid amount (≤ 0) → `declined`, short-circuit
    - Step 2: FX failed → `needs_approval`, short-circuit
    - Step 3: blocked category (case-insensitive) → `declined`, short-circuit
    - Step 4: approval threshold exceeded → add `approval_threshold` failure
    - Step 5: no-intent → add `no_intent` failure
    - Step 6: category limit (`committed + proposed > limit`) → add `category_limit` failure
    - Step 7: merchant limit → add `merchant_limit` failure
    - Derive final outcome: non-empty failures → `needs_approval`; empty → `auto_approved`
    - Format currency amounts in explanations using `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })`
    - Concatenate all `RuleFailure.explanation` strings into `EngineDecision.explanation`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12_

  - [x]* 5.2 Write unit tests for rules engine
    - Invalid amount (0 and negative) → `declined`, short-circuit, only `invalid_amount` failure
    - FX failed → `needs_approval`, short-circuit
    - Blocked category → `declined`, ignores threshold and limit rules
    - Approval threshold exceeded → `needs_approval`
    - No-intent → `needs_approval` with `no_intent` failure
    - Category limit exactly met (`committed + amount === limit`) → `auto_approved`
    - Category limit exceeded by 1 cent → `needs_approval` with `category_limit` failure
    - Multiple simultaneous failures → failure list contains all; explanation concatenated
    - All rules pass → `auto_approved`, empty failure list
    - _Requirements: 4.1–4.12_

  - [x]* 5.3 Write property-based tests for rules engine (fast-check)
    - **Property 1: Blocked category always produces declined** — for any request with a matching blocked category (and valid amount), outcome is `declined` with only a `blocked_category` failure
    - **Validates: Requirements 4.3, 4.7**
    - **Property 2: Rules engine is deterministic** — calling `evaluateRules` twice with identical inputs produces identical `EngineDecision` objects
    - **Validates: Requirements 4.1**
    - **Property 3: Auto-approval iff failure list is empty** — `outcome === 'auto_approved'` ↔ `failures.length === 0`
    - **Validates: Requirements 4.2**
    - **Property 4: Exact headroom is not escalated** — proposed amount equals `limit - committed` → no `category_limit` or `merchant_limit` failure
    - **Validates: Requirements 4.8**
    - **Property 5: Invalid amount always produces declined** — amount ≤ 0 → `declined` with `invalid_amount` failure, no other rules evaluated
    - **Validates: Requirements 4.10**
    - **Property 6: No-intent purchase is always escalated** — no intentText and all StructuredIntent fields absent, non-blocked, valid amount, FX ok → failure list contains `no_intent`
    - **Validates: Requirements 4.9**
    - **Property 7: Explanation string contains all failure clauses** — for any decision with ≥ 2 failures, `explanation` contains each `RuleFailure.explanation` as a substring
    - **Validates: Requirements 4.12**
    - _Minimum 100 iterations per property_

- [x] 6. Implement the mismatch checker
  - [x] 6.1 Create `src/lib/mismatch-checker.ts` with `checkMismatches` pure function
    - Return empty array immediately when both `intentText` and all `StructuredIntent` fields are absent
    - Price check: skip if `maxBudgetAmount` or `budgetCurrency` absent; convert purchase to `budgetCurrency` via `fxCache`; flag if `purchaseAmountInBudgetCurrency > maxBudgetAmount * 1.05`; record `priceCheckSkipped = true` if rate missing or `usdEquivalentAmount` is null
    - Date check: skip if `structuredIntent.travelDates` absent or empty; flag any date in intent not present in `purchase.travelDates` (exact ISO 8601 string comparison)
    - Category check: skip if `intendedCategory` absent; flag if `purchase.category` does not match after case-insensitive trim
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

  - [x]* 6.2 Write unit tests for mismatch checker
    - Price within 5% grace in USD (no flag)
    - Price exactly at 5% boundary in USD (no flag)
    - Price exceeding 5% in USD (flag)
    - Purchase currency matches `budgetCurrency` — direct comparison, no conversion needed (no flag when within grace)
    - `budgetCurrency` rate missing from `fxCache` — price check skipped, `priceCheckSkipped = true`
    - `usdEquivalentAmount` is null — price check skipped, `priceCheckSkipped = true`
    - Exact date match (no flag)
    - Date off by one day (flag)
    - Category match (no flag)
    - Category mismatch (flag)
    - All `StructuredIntent` fields absent → empty flag list
    - `maxBudgetAmount` absent → no price flag
    - `travelDates` absent → no date flag
    - `intendedCategory` absent → no category flag
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.8_

  - [x]* 6.3 Write property-based tests for mismatch checker (fast-check)
    - **Property 8: Mismatch checker returns empty list for no-intent purchases** — any purchase with null/empty intentText and all StructuredIntent fields absent → empty flag array
    - **Validates: Requirements 7.3**
    - **Property 9: Price mismatch flag respects 5% grace boundary** — `purchaseAmount > maxBudgetAmount * 1.05` ↔ `price_mismatch` flag present; at or below threshold → no flag
    - **Validates: Requirements 7.4**
    - **Property 10: Price comparison converts to budget currency** — when `budgetCurrency` ≠ purchase currency, comparison is made after FX conversion, not on raw amounts
    - **Validates: Requirements 7.4**
    - _Minimum 100 iterations per property_

- [x] 7. Implement dispute summary generator
  - [x] 7.1 Create `src/lib/dispute-generator.ts` with `generateDisputeSummary` pure function
    - Produce the plain-text dispute document in the exact section structure defined in the design (`ORIGINAL INTENT`, `ACTUAL PURCHASE`, `MISMATCHES`, `RULES ENGINE DECISION`, `EXCHANGE RATE`)
    - Output contains no HTML tags or markup
    - Include UTC timestamp at the top
    - Conditionally include override log and FX rate sections only when present
    - _Requirements: 8.2, 8.3_

  - [x]* 7.2 Write property-based tests for dispute generator (fast-check)
    - **Property 11: Dispute summary contains all required fields** — any receipt with ≥ 1 mismatch → output contains intent text (or no-intent marker), each mismatch type and detail, decision outcome, explanation, UTC timestamp, and no HTML tags
    - **Validates: Requirements 8.2, 8.3**

- [x] 8. Checkpoint — domain layer complete
  - Ensure all unit tests and property-based tests for persistence, FX service, rules engine, mismatch checker, and dispute generator pass (`npx vitest --run`). Ask the user if any clarifications are needed before continuing.

- [x] 9. Implement Zustand store
  - [x] 9.1 Create `src/store/useSpendGuardStore.ts` with full store shape and actions
    - Implement `SpendGuardState` interface with all persisted fields (`rules`, `receipts`, `fxCache`, `lastSeenMonth`), transient UI fields (`storageWarning`, `storageWarningMessage`), and all actions
    - Implement `committedSpend()` derived getter: filters receipts for current calendar month, sums USD amounts for `auto_approved`, `approved`, and `needs_approval` statuses by category and merchant
    - Implement `committedSpendExcluding(receiptId)` getter: same as `committedSpend()` but excludes the specified receipt to prevent double-counting at approval time
    - Implement `pendingCount()` getter: count of receipts with `status === 'needs_approval'`
    - Implement `addRule`, `updateRule`, `deleteRule` — each follows write-before-confirm: compute next state → `safeWrite` → commit to store; on write failure set `storageWarning = true`
    - Implement `submitPurchase(request)`: FX conversion → write `fxCache` → `evaluateRules` → `checkMismatches` → construct `IntentReceipt` → write `receipts` → commit
    - Implement `approvePurchase(receiptId)`: re-evaluate with `committedSpendExcluding(receiptId)` — if no overage mark `approved`; if overage caller handles modal (returns overage detail string for UI to show)
    - Implement `declinePurchase(receiptId)`: mark `declined`, write, commit
    - Implement `overridePurchase(receiptId, overageDetail)`: mark `approved`, set `overrideLog`, write, commit
    - Implement `runMonthlyResetIfNeeded()`: detect month change in local timezone; expire prior-month pending receipts; update `lastSeenMonth`
    - Implement `dismissStorageWarning()`
    - Initialise store by reading all four `asg_` keys via `safeRead` on creation
    - _Requirements: 1.5, 1.7, 3.2, 4.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 10.1–10.7_

  - [x]* 9.2 Write property-based tests for Zustand store (fast-check)
    - **Property 12: Dispute button visibility matches mismatch presence** — receipt with `mismatches.length > 0` → dispute button rendered; receipt with empty mismatches → dispute button absent (tested via store state, UI rendering tested in Playwright)
    - **Validates: Requirements 8.1, 8.6**
    - **Property 13: Dashboard visual state thresholds are correct** — for any (committedSpend, limitAmount) pair, warning state ↔ `committedSpend / limitAmount >= 0.8`; exceeded state ↔ `committedSpend >= limitAmount`; mutually exclusive
    - **Validates: Requirements 9.3, 9.4**
    - **Property 14: Committed spend includes pending purchases** — store state with pending receipts for a category → `committedSpend` equals sum of approved + pending for that category
    - **Validates: Requirements 9.7**
    - **Property 15: Serialization round-trip preserves all persisted types** — any valid `RuleSet`, `IntentReceipt[]`, or `FxRateCache` value: `JSON.parse(JSON.stringify(value))` deeply equals original
    - **Validates: Requirements 1.7, 10.2, 10.3**
    - **Property 16: Monthly reset expires only prior-month pending purchases** — after reset from month M to M+1, all pending receipts from M → `expired`; pending receipts from M+1 → `needs_approval`
    - **Validates: Requirements 6.2, 6.4**
    - **Property 17: Corruption isolation preserves valid entries** — mix of valid and corrupt localStorage entries → valid entries loaded correctly, corrupt entries fall back to empty defaults without affecting others
    - **Validates: Requirements 10.6**
    - _Minimum 100 iterations per property_

- [x] 10. Implement simulator presets
  - [x] 10.1 Create `src/lib/simulator-presets.ts` with all four preset definitions
    - **Coffee Shop**: category Dining, 8.50 USD, no travel dates, simple intentText and StructuredIntent
    - **Hotel Lisbon**: category Travel, 480.00 EUR, purchase `travelDates: ["2024-11-12", "2024-11-15"]`, intent `travelDates: ["2024-11-12", "2024-11-14"]` (intentional date mismatch), `maxBudgetAmount: 500, budgetCurrency: "EUR"`
    - **Grocery Run**: category Groceries, 95.00 USD, no travel dates
    - **Flight Tokyo**: category Travel, 85000 JPY, purchase and intent `travelDates: ["2024-12-01", "2024-12-08"]` (no mismatch)
    - Each preset exports a full `PurchaseRequest`-shaped object with all fields including `intentText` and `structuredIntent`
    - _Requirements: 2.1, 2.2_

- [x] 11. Implement shared UI components
  - [x] 11.1 Create `src/components/NavBar.tsx` with `PendingBadge`
    - Full-width top navigation with links to `/dashboard`, `/inbox`, `/rules`, `/simulator`, `/receipts`
    - `PendingBadge` reads `pendingCount()` from store; renders a numeric badge on the Inbox link; updates immediately after approve/decline
    - Mark as `"use client"`
    - _Requirements: 5.7_

  - [x] 11.2 Create `src/components/SpendProgressBar.tsx`
    - Props: `label`, `committed`, `limit` (all numbers)
    - Renders label, committed/limit amounts, remaining headroom
    - Applies warning colour class when `committed / limit >= 0.8` (and not exceeded)
    - Applies exceeded colour class when `committed >= limit`
    - Warning and exceeded states are mutually exclusive
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 11.3 Create `src/components/StorageWarningBanner.tsx`
    - Non-blocking banner (not a modal) visible at top of page without obscuring content
    - Reads `storageWarning` and `storageWarningMessage` from store
    - Renders dismiss button that calls `dismissStorageWarning()`
    - _Requirements: 10.6, 10.7_

  - [x] 11.4 Create `src/components/ActivityFeedItem.tsx`
    - Props: subset of `IntentReceipt` fields needed for a single row
    - Shows merchant, category, USD amount, decision badge (colour-coded by status), mismatch indicator dot
    - _Requirements: 9.5_

  - [x] 11.5 Create `src/components/PurchaseCard.tsx`
    - Shows agent name, merchant name, category, USD amount with FX indicator if applicable, original intent text, rules engine reason
    - Approve and Decline buttons
    - _Requirements: 5.1_

  - [x] 11.6 Create `src/components/OverageWarningModal.tsx`
    - Modal dialog displaying the specific overage string (e.g., "Approving this puts Dining $60.00 over the $300.00 monthly limit")
    - Presents Decline and Override Once buttons
    - _Requirements: 5.3, 5.5_

  - [x] 11.7 Create `src/components/RuleForm.tsx`
    - Shared form for create and edit; accepts rule type selector and fields appropriate to each type
    - Inline validation: empty name, amount out of range (0.01–999,999,999.99), duplicate name
    - Calls `addRule` or `updateRule` on submit
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.8_

  - [x] 11.8 Create `src/components/SimulatorForm.tsx`
    - Preset selector dropdown populates all fields on change
    - Editable fields for agent name, merchant name, category, amount, currency, intentText, and all four StructuredIntent fields
    - Client-side validation: amount > 0
    - Submit calls `store.submitPurchase(request)` and displays the resulting decision
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 11.9 Create `src/components/IntentReceiptDetail.tsx`
    - Renders all receipt fields: purchase details, USD equivalent + FX rate, decision outcome badge, failure explanations, mismatch flags, override log
    - Shows "rate may be stale" indicator when `fxRate.isStale === true`
    - Conditionally renders mismatch indicator section
    - _Requirements: 7.2, 7.7, 3.3, 3.6_

  - [x] 11.10 Create `src/components/DisputeSummaryPanel.tsx`
    - Calls `generateDisputeSummary(receipt)` and renders the result
    - Copy to clipboard button that calls `navigator.clipboard.writeText`
    - Fallback: if clipboard API unavailable, shows the summary text in a `<textarea>` for manual copy
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [ ] 12. Implement application routes and pages
  - [x] 12.1 Create `src/app/layout.tsx` and wire monthly reset + storage guard
    - Root layout renders `<NavBar>` and `{children}`
    - Include `<StorageWarningBanner>` in layout
    - `useEffect` on mount calls `store.runMonthlyResetIfNeeded()`
    - `"use client"` on the layout (all pages are client components)
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 10.5_

  - [x] 12.2 Create `src/app/page.tsx` (root redirect to `/dashboard`)
    - _Requirements: 9.1_

  - [x] 12.3 Create `src/app/rules/page.tsx` — Rules Configuration page
    - List all active Category_Limits, Merchant_Limits, Approval_Threshold, and Blocked_Categories
    - Add/edit via `<RuleForm>` inline or modal
    - Delete button per rule
    - Show pending-purchase warning when editing a rule that affects pending receipts (counts affected pending purchases; blocks save until user acknowledges)
    - _Requirements: 1.1–1.9_

  - [x] 12.4 Create `src/app/simulator/page.tsx` — Agent Simulator page
    - Render `<SimulatorForm>` with preset selector
    - Show decision result (outcome badge + explanation) after submission
    - _Requirements: 2.1–2.6_

  - [x] 12.5 Create `src/app/dashboard/page.tsx` — Dashboard page
    - Render `<SpendProgressBar>` for each Category_Limit and Merchant_Limit
    - Render summary rows for total category spend vs limits and total merchant spend vs limits
    - Render `<ActivityFeedItem>` list for the 20 most recent receipts (reverse chronological)
    - Recalculate all spend figures from store on each navigation to page
    - _Requirements: 9.1–9.8_

  - [x] 12.6 Create `src/app/inbox/page.tsx` — Approvals Inbox page
    - Render `<PurchaseCard>` for each pending receipt in reverse-chronological order
    - On Approve click: call `store.approvePurchase(id)`; if overage returned, show `<OverageWarningModal>`
    - On Decline click: call `store.declinePurchase(id)`
    - On Override Once click (from modal): call `store.overridePurchase(id, overageDetail)`
    - Show `expired: monthly reset` label on expired receipts (non-interactive)
    - _Requirements: 5.1–5.8_

  - [x] 12.7 Create `src/app/receipts/page.tsx` — Intent Receipts list page
    - Table/list of all receipts in reverse-chronological order
    - Each row: merchant, category, amount, status badge, mismatch indicator
    - Each row links to `/receipts/[id]`
    - _Requirements: 7.1, 7.7_

  - [ ] 12.8 Create `src/app/receipts/[id]/page.tsx` — Receipt detail + Dispute page
    - Render `<IntentReceiptDetail>` for the receipt matching the URL param
    - Render `<DisputeSummaryPanel>` only when `receipt.mismatches.length > 0`
    - _Requirements: 7.2, 8.1, 8.2, 8.6_

- [ ] 13. Checkpoint — full feature wired end-to-end
  - Ensure all unit and property-based tests still pass (`npx vitest --run`). Manually verify the four simulator presets produce expected decisions and the Hotel Lisbon preset triggers a date mismatch flag. Ask the user if any clarifications are needed before writing integration tests.

- [ ]* 14. Write Playwright integration tests
  - [ ]* 14.2 Approvals Inbox approve-with-overage flow
    - Test: configure a Category_Limit below the pending purchase amount; navigate to Inbox; click Approve → `OverageWarningModal` appears with correct overage text; click Override Once → receipt moves out of Inbox, override log present on receipt detail
    - _Requirements: 5.2, 5.3, 5.5_

  - [ ]* 14.5 Dispute summary copy and fallback
    - Test: submit Hotel Lisbon preset (triggers date mismatch); navigate to receipt detail; assert Dispute button visible; click Dispute; assert `navigator.clipboard.writeText` called with non-empty string
    - Test: mock clipboard unavailable; assert fallback `<textarea>` rendered with non-empty dispute text
    - _Requirements: 8.1, 8.4, 8.5_

- [ ] 15. Final checkpoint — all tests pass
  - Ensure all unit tests, property-based tests, and Playwright integration tests pass. Confirm Vercel deployment config (`vercel.json`) is present. Ask the user if any questions remain.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; all core functionality is covered by non-optional tasks
- Each task references specific requirements for full traceability
- The Hotel Lisbon preset (Task 10.1) is the primary demo path for date-mismatch and dispute features
- `committedSpendExcluding(id)` (Task 9.1) is critical for preventing double-counting when approving pending items — do not omit
- All pages must be `"use client"` components; no server components are needed
- The `asg_` localStorage key prefix must be consistent across all persistence calls
- fast-check property tests must include the `// Feature: agent-spend-guard, Property N: ...` annotation comment per the design spec
- Property tests should run with a minimum of 100 iterations

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "10.1", "9.1"] },
    { "id": 7, "tasks": ["9.2", "11.1", "11.2", "11.3", "11.4"] },
    { "id": 8, "tasks": ["11.5", "11.6", "11.7", "11.8", "11.9", "11.10"] },
    { "id": 9, "tasks": ["12.1", "12.2"] },
    { "id": 10, "tasks": ["12.3", "12.4"] },
    { "id": 11, "tasks": ["12.5", "12.6", "12.7"] },
    { "id": 12, "tasks": ["12.8"] },
    { "id": 13, "tasks": ["14.2", "14.5"] }
  ]
}
```
