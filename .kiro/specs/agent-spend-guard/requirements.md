# Requirements Document

## Introduction

Agent Spend Guard is a client-side web application that gives users control over purchases made on their behalf by AI agents. Users set spending rules (category limits, merchant limits, approval thresholds, blocked categories), a mock agent simulator submits purchase requests, a rules engine decides whether to approve, escalate, or decline each request, and intent receipts store the evidence needed to dispute a wrong transaction with an issuer. Everything runs in the browser using localStorage — no real payments, no bank connections, no authentication, no multi-user state.

## Glossary

- **System**: The Agent Spend Guard application as a whole.
- **Rules_Engine**: The pure-function module that evaluates a purchase request against the active rule set and returns a decision.
- **Mismatch_Checker**: The pure-function module that compares a purchase's actual details against the original intent and returns a list of mismatch flags.
- **Agent_Simulator**: The UI component that constructs and submits mock purchase requests with preset or custom parameters.
- **Approvals_Inbox**: The UI view that lists all purchase requests in a `needs_approval` state and allows the user to approve or decline each one.
- **Dashboard**: The UI view that displays spend-vs-limit progress by category and a recent-activity feed.
- **Intent_Receipt**: The record stored alongside every purchase containing the original user instruction, actual purchase details, rule decision, and any mismatch flags.
- **Dispute_Summary**: A human-readable text comparing the original intent against what was actually purchased, suitable for sending to a bank.
- **Category_Limit**: A monthly spending cap applied to all purchases within a named category (e.g., Dining, Travel, Groceries).
- **Merchant_Limit**: A monthly spending cap applied to purchases at a specific named merchant.
- **Approval_Threshold**: A monetary amount above which every purchase must be manually approved, regardless of category or merchant limits.
- **Blocked_Category**: A category from which all purchases are automatically declined with no override path.
- **FX_Rate**: A conversion rate from a foreign currency to USD, sourced from the Frankfurter API and cached locally for 24 hours.
- **Pending_Purchase**: A purchase request in the `needs_approval` state that has not yet been acted on by the user.
- **Committed_Spend**: The sum of all approved purchases plus all Pending_Purchases within the current calendar month for a given budget dimension.
- **Monthly_Reset**: The transition from one calendar month to the next, at which point all monthly accumulators return to zero.
- **Override**: A user action approving a purchase that would exceed a limit after being warned of the overage.
- **Intent_Text**: The raw, human-readable instruction provided by the user to the agent (e.g., "hotel in Lisbon under 500 EUR, Nov 12–14"). Stored for audit and dispute purposes only; not parsed for mismatch evaluation.
- **Structured_Intent**: The machine-readable fields submitted alongside the Intent_Text: `max_budget_amount` (optional numeric), `budget_currency` (optional ISO 4217 code), `travel_dates` (optional array of ISO 8601 dates), and `intended_category` (optional string). Used as the authoritative source for mismatch checks.

---

## Requirements

### Requirement 1: Spending Rules Configuration

**User Story:** As a user, I want to define category limits, merchant limits, an approval threshold, and blocked categories, so that the system can automatically enforce my spending preferences without requiring me to review every transaction.

#### Acceptance Criteria

1. THE System SHALL allow the user to create a Category_Limit by specifying a category name of 1 to 100 characters and a maximum monthly spend amount between 0.01 and 999,999,999.99 USD.
2. THE System SHALL allow the user to create a Merchant_Limit by specifying a merchant name of 1 to 100 characters and a maximum monthly spend amount between 0.01 and 999,999,999.99 USD.
3. THE System SHALL allow the user to set exactly one Approval_Threshold amount between 0.01 and 999,999,999.99 USD; setting a new Approval_Threshold SHALL replace the previously stored value.
4. THE System SHALL allow the user to designate any number of categories as Blocked_Category entries.
5. THE System SHALL allow the user to edit or delete any existing rule at any time, including while Pending_Purchases exist.
6. IF the user submits a rule with a limit amount that is zero, negative, non-numeric, or outside the range 0.01 to 999,999,999.99 USD, THEN THE System SHALL reject the input and display a validation error indicating that the amount must be a positive value up to 999,999,999.99 USD.
7. THE System SHALL persist all rules such that the complete rule set is restored without data loss after a page reload.
8. IF the user attempts to create a Category_Limit or Merchant_Limit whose name exactly matches an existing rule of the same type, THEN THE System SHALL reject the submission and display a validation error indicating that a rule for that name already exists.
9. WHEN the user edits a rule, IF one or more Pending_Purchases reference that rule's category or merchant dimension, THEN THE System SHALL display a warning stating how many Pending_Purchases are affected before saving; WHEN the user subsequently acts on any affected Pending_Purchase (approve or decline), THE System SHALL re-evaluate it against the current rule set at that moment.

---

### Requirement 2: Mock Agent Simulator

**User Story:** As a user, I want a mock agent simulator with preset and custom purchase scenarios, so that I can test my rules without connecting a real agent or card.

#### Acceptance Criteria

1. THE Agent_Simulator SHALL provide at least four distinct presets, where each preset covers a different spending category, and at least one preset represents a cross-currency scenario (e.g., a 480 EUR hotel booking).
2. WHEN the user selects a preset, THE Agent_Simulator SHALL populate all request fields: agent name, merchant name, category, amount, currency, Intent_Text, and Structured_Intent fields (max_budget_amount, budget_currency, travel_dates, intended_category).
3. THE Agent_Simulator SHALL allow the user to override any individual populated field before submitting, including each Structured_Intent field independently.
4. IF the user submits a purchase request with an amount of zero or less, THEN THE Agent_Simulator SHALL reject the submission and display a validation error indicating the amount must be greater than zero, without forwarding the request to the Rules_Engine.
5. THE Agent_Simulator SHALL allow submission of a purchase request with the Intent_Text field and all Structured_Intent fields left blank, representing a purchase that arrives without an attached user instruction.
6. WHEN the user submits a purchase request, THE System SHALL pass it to the Rules_Engine and display the resulting decision within 2 seconds of submission.

---

### Requirement 3: Currency Conversion

**User Story:** As a user, I want all foreign-currency purchases converted to USD before rule evaluation, so that my limits always apply in a single consistent currency.

#### Acceptance Criteria

1. WHEN a purchase request contains a non-USD currency, THE System SHALL retrieve the FX_Rate for that currency from the Frankfurter API within 5 seconds before evaluating the request.
2. THE System SHALL cache each retrieved FX_Rate in localStorage with a timestamp, and IF the cached FX_Rate for that currency is less than 24 hours old, THEN THE System SHALL reuse the cached rate instead of making a new API call.
3. IF the Frankfurter API call fails or returns no response within 5 seconds and a cached FX_Rate exists for that currency, THEN THE System SHALL use the cached rate and SHALL display a "rate may be stale" indicator alongside the converted USD amount on the purchase record.
4. IF the Frankfurter API call fails or returns no response within 5 seconds and no cached FX_Rate exists for the requested currency, THEN THE Rules_Engine SHALL route the purchase to the Approvals_Inbox as `needs_approval` and SHALL never auto-approve it.
5. IF a purchase request contains a currency for which the Frankfurter API returns no rate and no cached rate exists, THEN THE Rules_Engine SHALL route the purchase to the Approvals_Inbox as `needs_approval` and SHALL never auto-approve it.
6. THE System SHALL display the USD-equivalent amount rounded to 2 decimal places and the FX_Rate rounded to 6 decimal places on every purchase record involving a foreign currency.

---

### Requirement 4: Rules Engine Decision Logic

**User Story:** As a user, I want the rules engine to automatically approve, escalate, or decline every purchase request based on my configured rules, so that I only review the transactions that actually need my attention.

#### Acceptance Criteria

1. THE Rules_Engine SHALL produce a deterministic outcome (`auto_approved`, `needs_approval`, or `declined`) and a decision explanation for every purchase request evaluation, with no observable side effects on external state.
2. WHEN a purchase request is evaluated, THE Rules_Engine SHALL evaluate every applicable rule (those whose scope matches the purchase by category, merchant, or amount), collect all rules that fail into a failure list, and derive the outcome from the strictest failure in that list; a purchase receives `auto_approved` only when the failure list is empty.
3. IF a purchase belongs to a Blocked_Category, THEN THE Rules_Engine SHALL return `declined`; this check takes precedence over all rule evaluations except the invalid amount check.
4. IF the USD-equivalent amount of a purchase is strictly greater than the configured Approval_Threshold, THEN THE Rules_Engine SHALL return `needs_approval`; this check takes precedence over Category_Limit and Merchant_Limit evaluations.
5. IF approving a purchase would cause the Committed_Spend for its category to exceed the configured Category_Limit, THEN THE Rules_Engine SHALL return `needs_approval`, unless a Blocked_Category rule has already returned `declined`.
6. IF approving a purchase would cause the Committed_Spend for its merchant to exceed the configured Merchant_Limit, THEN THE Rules_Engine SHALL return `needs_approval`, unless a Blocked_Category or Approval_Threshold rule has already determined the outcome.
7. THE Rules_Engine SHALL evaluate rules in this order: invalid amount check → Blocked_Category → Approval_Threshold → no-intent check → Category_Limit → Merchant_Limit; the invalid amount check and Blocked_Category check short-circuit on failure (no further rules are evaluated); all remaining rules are evaluated in full regardless of intermediate failures, and every failing rule is added to the failure list.
8. WHEN a purchase amount exactly equals the remaining headroom under a Category_Limit or Merchant_Limit, THE Rules_Engine SHALL treat the purchase as within limit and SHALL NOT escalate solely on that basis.
9. IF a purchase request contains no intent and the purchase does not belong to a Blocked_Category, THEN THE Rules_Engine SHALL return `needs_approval`.
10. IF a purchase amount is zero or negative, THEN THE Rules_Engine SHALL return `declined` with a decision explanation indicating the amount is invalid; this check runs before all other rule evaluations.
11. IF currency conversion to USD-equivalent fails for a purchase, THEN THE Rules_Engine SHALL return `needs_approval` with a decision explanation indicating the conversion could not be completed.
12. THE Rules_Engine SHALL return a single decision explanation that lists every rule in the failure list with the values that triggered each failure (such as the limit amount, threshold, category name, or overage amount), concatenated into one plain-English string (e.g., 'over your $50.00 threshold and puts Travel $120.00 over the $300.00 monthly limit').

---

### Requirement 5: Approvals Inbox

**User Story:** As a user, I want an approvals inbox where I can review, approve, or decline pending purchase requests, so that I retain final control over anything the rules engine flags.

#### Acceptance Criteria

1. THE Approvals_Inbox SHALL display all Pending_Purchases in reverse-chronological order (newest first) with: agent name, merchant name, category, USD amount (with FX indicator if applicable), original intent, and the plain-English reason from the Rules_Engine.
2. WHEN the user taps Approve on a Pending_Purchase, THE System SHALL re-evaluate the current Committed_Spend including all other non-declined Pending_Purchases at that moment.
3. IF re-evaluation at approval time shows that approving the purchase would exceed any applicable limit, THEN THE System SHALL warn the user with the specific overage (e.g., "Approving this puts Dining $60.00 over the $300.00 monthly limit") and SHALL present Decline and Override Once options.
4. IF re-evaluation at approval time shows no limit violation, THEN THE System SHALL mark the purchase as `approved`, remove it from the Approvals_Inbox, and release it for execution.
5. WHEN the user selects Override Once, THE System SHALL approve the purchase, log the override in the Intent_Receipt, and record the overage amount.
6. WHEN the user taps Decline on a Pending_Purchase, THE System SHALL mark the purchase as `declined`, remove it from the Approvals_Inbox, and exclude it from all subsequent Committed_Spend calculations.
7. THE Approvals_Inbox SHALL show a count badge reflecting the current number of Pending_Purchases in the navigation, and SHALL update the badge immediately after each approve or decline action.
8. THE System SHALL persist all Pending_Purchases to localStorage so they survive a page reload.

---

### Requirement 6: Monthly Reset and Pending Expiry

**User Story:** As a user, I want my monthly spend accumulators to reset at the start of each calendar month and pending approvals from the previous month to expire cleanly, so that next month's budget is never silently consumed by old requests.

#### Acceptance Criteria

1. WHEN the System detects on load that the current calendar month in the user's local timezone differs from the stored last-seen month, THE System SHALL reset all monthly spend accumulators to zero before rendering any spend data.
2. WHEN a Monthly_Reset is applied, THE System SHALL mark all Pending_Purchases whose origination timestamp, interpreted in the user's local timezone, falls in the previous calendar month with the status `expired: monthly reset`.
3. WHILE the Approvals_Inbox is displayed, THE System SHALL show expired Pending_Purchases with the `expired: monthly reset` label and SHALL NOT include their USD-equivalent amounts in the current month's Committed_Spend.
4. THE System SHALL NOT move any expired Pending_Purchase into the new month's active pending approvals queue; the agent must resubmit if the purchase is still needed.
5. IF no last-seen month is stored (first run), THEN THE System SHALL treat the current month as the baseline and SHALL NOT apply any reset or expiry logic.

---

### Requirement 7: Intent Receipts

**User Story:** As a user, I want every agent purchase to carry a stored intent receipt, so that I have evidence of what I asked for versus what was actually purchased in case a dispute arises.

#### Acceptance Criteria

1. THE System SHALL create an Intent_Receipt for every purchase request, regardless of the Rules_Engine outcome.
2. THE Intent_Receipt SHALL store: the Intent_Text (or a `no_intent` marker if both Intent_Text and all Structured_Intent fields are absent), all submitted Structured_Intent fields, the submitted purchase details (agent, merchant, category, amount, currency, USD-equivalent), the Rules_Engine decision and decision explanation, the FX_Rate used (if applicable), a staleness flag if the rate was retrieved from cache at the time of the decision, the UTC timestamp of the decision, and any manual approval or override action subsequently taken by the user.
3. THE Mismatch_Checker SHALL compare the Structured_Intent fields against the actual purchase details to produce a list of mismatch flags, and SHALL return an empty list without performing any checks when both Intent_Text and all Structured_Intent fields are absent (i.e., the `no_intent` case).
4. THE Mismatch_Checker SHALL flag a price mismatch IF `max_budget_amount` and `budget_currency` are both present in the Structured_Intent AND the purchase's amount in `budget_currency` exceeds `max_budget_amount` by more than 5%; IF the purchase currency differs from `budget_currency`, THE Mismatch_Checker SHALL convert the purchase amount to `budget_currency` using the same FX_Rate already retrieved for the transaction before comparing; IF `max_budget_amount` is absent, THEN no price mismatch flag SHALL be raised.
5. THE Mismatch_Checker SHALL flag a date mismatch IF `travel_dates` is present and non-empty in the Structured_Intent AND any date in `travel_dates` does not exactly match the corresponding date in the purchase details; IF `travel_dates` is absent or empty, THEN no date mismatch flag SHALL be raised.
6. THE Mismatch_Checker SHALL flag a category mismatch IF `intended_category` is present in the Structured_Intent AND the purchase category field does not match it.
7. WHEN a purchase has one or more mismatch flags, THE System SHALL display a mismatch indicator on the corresponding Intent_Receipt entry.
8. THE Mismatch_Checker SHALL have unit tests covering: price within 5% grace in budget_currency (no flag), price exactly at 5% boundary in budget_currency (no flag), price exceeding 5% in budget_currency (flag), purchase currency matches budget_currency — direct comparison without conversion (no flag when within grace), purchase currency differs from budget_currency — converted to budget_currency before comparison (flag when over grace), exact date match (no flag), date off by one day (flag), category match (no flag), category mismatch (flag), all Structured_Intent fields absent (empty flag list returned), max_budget_amount absent (no price flag), travel_dates absent (no date flag), intended_category absent (no category flag).

---

### Requirement 8: Dispute Summary

**User Story:** As a user, I want to generate a dispute summary for any flagged purchase, so that I have a ready-to-send document comparing what I instructed the agent to do versus what it actually did.

#### Acceptance Criteria

1. WHEN a purchase has one or more mismatch flags, THE System SHALL display a Dispute button on the Intent_Receipt detail view.
2. WHEN the user clicks Dispute, THE System SHALL generate a Dispute_Summary containing: the Intent_Text, all submitted Structured_Intent fields, the actual purchase details, a plain-English description of each mismatch flag, the Rules_Engine decision and decision explanation, any override log, the FX_Rate and staleness flag if applicable, and the UTC timestamp.
3. THE Dispute_Summary SHALL be formatted as plain text with no binary encoding or markup, suitable for copying and sending directly to a bank or card issuer.
4. THE System SHALL allow the user to copy the Dispute_Summary to the clipboard with a single action.
5. IF the clipboard API is unavailable, THEN THE System SHALL display the Dispute_Summary in a selectable text area so the user can copy it manually.
6. IF a purchase has no mismatch flags, THEN THE System SHALL NOT display the Dispute button for that purchase.

---

### Requirement 9: Dashboard

**User Story:** As a user, I want a dashboard showing my spend versus limits and recent activity, so that I can understand my budget position at a glance without reviewing individual transactions.

#### Acceptance Criteria

1. WHILE the Dashboard is displayed, THE System SHALL show a spend progress indicator for each active Category_Limit containing: category name, Committed_Spend to date, the limit amount, and the remaining headroom.
2. WHILE the Dashboard is displayed, THE System SHALL show a spend progress indicator for each active Merchant_Limit containing: merchant name, Committed_Spend to date, the limit amount, and the remaining headroom.
3. WHEN Committed_Spend reaches 80% or more of a limit, THE Dashboard SHALL apply a visual warning state to that indicator.
4. WHEN Committed_Spend equals or exceeds a limit, THE Dashboard SHALL apply a visual exceeded state to that indicator.
5. WHILE the Dashboard is displayed, THE System SHALL show a recent-activity feed of the last 20 purchase requests in reverse-chronological order, each entry showing: merchant, category, USD amount, decision badge (approved / needs_approval / declined / expired), and a mismatch indicator if the purchase has one or more mismatch flags.
6. WHILE the Dashboard is displayed, THE System SHALL show a summary row containing the total Committed_Spend across all Category_Limits and the total configured Category_Limit amount, and a separate summary row for Merchant_Limits.
7. WHEN Pending_Purchases exist, THE Dashboard SHALL include the sum of their USD-equivalent amounts in the Committed_Spend total so that displayed headroom reflects worst-case budget consumption.
8. WHEN the user navigates to the Dashboard, THE System SHALL recalculate all Committed_Spend figures and mismatch indicators from the current persisted state before rendering.

---

### Requirement 10: Data Persistence

**User Story:** As a user, I want all my rules, transactions, receipts, and pending approvals to survive a page reload, so that I do not lose my configuration or history when I close the browser tab.

#### Acceptance Criteria

1. WHEN any rule (Category_Limit, Merchant_Limit, Approval_Threshold, or Blocked_Category) is created, edited, or deleted, THE System SHALL write the updated rule set to localStorage before the UI confirms the change.
2. WHEN an Intent_Receipt is created or updated, THE System SHALL write the updated receipt to localStorage before completing the associated action.
3. WHEN a Pending_Purchase is created, approved, declined, or expired, THE System SHALL write the updated Pending_Purchase record to localStorage before the UI reflects the new status.
4. WHEN a new FX_Rate is retrieved from the Frankfurter API, THE System SHALL write the rate and its retrieval timestamp to localStorage; cached rates SHALL be retained until they are more than 24 hours old, at which point a fresh rate SHALL be requested on the next use.
5. WHEN the System initialises, THE System SHALL load all persisted data from localStorage before rendering any UI.
6. IF localStorage is unavailable or a stored entry cannot be parsed, THEN THE System SHALL discard only the corrupt entries, start with an empty state for those data types, and display a non-blocking warning banner visible without obscuring the primary content.
7. WHEN a localStorage write fails (e.g., storage quota exceeded), THE System SHALL display a non-blocking warning informing the user that data may not be saved, and SHALL continue operating with in-memory state for the current session.
