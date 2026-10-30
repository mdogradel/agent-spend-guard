// ============================================================
// Agent Spend Guard — Domain Types
// ============================================================

// ────────────────────────────────────────────────────────────
// Rules
// ────────────────────────────────────────────────────────────

/** A monthly spending cap for a named category (e.g. "Dining"). */
export interface CategoryLimit {
  id: string;             // uuid v4
  type: 'category_limit';
  category: string;       // 1–100 chars
  limitAmountUSD: number; // 0.01 – 999_999_999.99
  createdAt: string;      // ISO 8601 UTC
  updatedAt: string;
}

/** A monthly spending cap for a specific merchant (e.g. "Amazon"). */
export interface MerchantLimit {
  id: string;
  type: 'merchant_limit';
  merchant: string;       // 1–100 chars
  limitAmountUSD: number; // 0.01 – 999_999_999.99
  createdAt: string;      // ISO 8601 UTC
  updatedAt: string;
}

/**
 * A single approval threshold. Any purchase with USD-equivalent amount
 * STRICTLY GREATER THAN thresholdAmountUSD requires manual approval.
 */
export interface ApprovalThreshold {
  id: string;
  type: 'approval_threshold';
  thresholdAmountUSD: number; // 0.01 – 999_999_999.99
  updatedAt: string;          // ISO 8601 UTC
}

/** All purchases in this category are auto-declined with no override path. */
export interface BlockedCategory {
  id: string;
  type: 'blocked_category';
  category: string; // 1–100 chars
  createdAt: string; // ISO 8601 UTC
}

export type SpendingRule =
  | CategoryLimit
  | MerchantLimit
  | ApprovalThreshold
  | BlockedCategory;

export interface RuleSet {
  categoryLimits: CategoryLimit[];
  merchantLimits: MerchantLimit[];
  approvalThreshold: ApprovalThreshold | null;
  blockedCategories: BlockedCategory[];
}

// ────────────────────────────────────────────────────────────
// Purchase Request & Structured Intent
// ────────────────────────────────────────────────────────────

/**
 * Machine-readable intent fields submitted alongside Intent_Text.
 * All fields are optional — absence means "not specified".
 * These are the authoritative source for mismatch checks.
 */
export interface StructuredIntent {
  /** Numeric spend cap provided by the user (in budgetCurrency). */
  maxBudgetAmount?: number;
  /** ISO 4217 currency code for maxBudgetAmount (e.g. "EUR"). */
  budgetCurrency?: string;
  /** Array of ISO 8601 date strings the user intended for travel. */
  travelDates?: string[];
  /** Category the user intended the purchase to fall under. */
  intendedCategory?: string;
}

/** A purchase request submitted by the Agent Simulator. */
export interface PurchaseRequest {
  id: string;               // uuid v4
  agentName: string;
  merchantName: string;
  category: string;
  amount: number;           // as submitted (may be non-USD)
  currency: string;         // ISO 4217
  /** Raw human-readable instruction. Stored for audit; not parsed for checks. */
  intentText: string | null;
  /** Structured fields for deterministic mismatch evaluation. */
  structuredIntent: StructuredIntent | null;
  /** Actual booking/travel dates on the purchase (for date mismatch check). */
  travelDates?: string[];
  submittedAt: string;      // ISO 8601 UTC
}

// ────────────────────────────────────────────────────────────
// FX Rate Cache
// ────────────────────────────────────────────────────────────

/** Where a stored USD rate came from. Older receipts may omit this. */
export type FxRateSource = 'live' | 'cache' | 'fallback';

export interface FxRateCacheEntry {
  fromCurrency: string; // source currency code (e.g. "EUR")
  toCurrency: 'USD';
  rate: number;         // rounded to 6 decimal places
  fetchedAt: string;    // ISO 8601 UTC
  /** true when the entry was used after a failed refresh attempt */
  isStale: boolean;
  /** live Frankfurter quote, a cached live quote, or the bundled fallback table */
  source?: FxRateSource;
}

/** Keyed by fromCurrency, e.g. { "EUR": FxRateCacheEntry } */
export type FxRateCache = Record<string, FxRateCacheEntry>;

// ────────────────────────────────────────────────────────────
// Rules Engine Decision
// ────────────────────────────────────────────────────────────

export type DecisionOutcome = 'auto_approved' | 'needs_approval' | 'declined';

export interface RuleFailure {
  ruleType:
    | 'invalid_amount'
    | 'blocked_category'
    | 'approval_threshold'
    | 'no_intent'
    | 'category_limit'
    | 'merchant_limit'
    | 'fx_failed';
  /** Concise human-readable clause, e.g. "over your $50.00 threshold" */
  explanation: string;
}

export interface EngineDecision {
  outcome: DecisionOutcome;
  /** All rule failures collected during evaluation. */
  failures: RuleFailure[];
  /** Concatenation of all failure.explanation strings, joined by " and ". */
  explanation: string;
  evaluatedAt: string; // ISO 8601 UTC
}

// ────────────────────────────────────────────────────────────
// Rules Engine Input
// ────────────────────────────────────────────────────────────

/** Committed spend totals for the current calendar month. */
export interface CommittedSpend {
  /** category name → USD sum (approved + pending, current month) */
  byCategory: Record<string, number>;
  /** merchant name → USD sum (approved + pending, current month) */
  byMerchant: Record<string, number>;
}

/** Full input passed to the pure evaluateRules function. */
export interface EngineInput {
  request: PurchaseRequest;
  /** Pre-converted USD equivalent. NaN or 0 if fxFailed is true. */
  usdAmount: number;
  /** true when currency conversion could not be completed. */
  fxFailed: boolean;
  rules: RuleSet;
  committedSpend: CommittedSpend;
}

// ────────────────────────────────────────────────────────────
// Intent Receipt & Mismatch
// ────────────────────────────────────────────────────────────

export type MismatchFlagType =
  | 'price_mismatch'
  | 'date_mismatch'
  | 'category_mismatch';

export interface MismatchFlag {
  type: MismatchFlagType;
  /** Human-readable description of the specific mismatch. */
  detail: string;
}

export type PurchaseStatus =
  | 'auto_approved'
  | 'needs_approval'
  | 'approved'   // user manually approved
  | 'declined'   // auto-declined or manually declined
  | 'expired';   // expired at monthly reset

export interface OverrideLog {
  overriddenAt: string;  // ISO 8601 UTC
  /** Human-readable description, e.g. "Dining $60.00 over $300.00 monthly limit" */
  overageDetail: string;
}

export interface IntentReceipt {
  /** Same as PurchaseRequest.id */
  id: string;
  purchaseRequest: PurchaseRequest;

  // Currency conversion (populated for non-USD purchases)
  usdEquivalentAmount: number | null;
  fxRate: FxRateCacheEntry | null;

  // Rules engine output
  decision: EngineDecision;
  status: PurchaseStatus;

  // Mismatch analysis
  mismatches: MismatchFlag[];
  /** true when the price check was skipped due to a missing FX rate */
  priceCheckSkipped: boolean;
  priceCheckSkipReason?: string;

  // Manual actions
  approvedAt: string | null;  // ISO 8601 UTC
  declinedAt: string | null;  // ISO 8601 UTC
  overrideLog: OverrideLog | null;

  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
}

// ────────────────────────────────────────────────────────────
// Monthly Reset State
// ────────────────────────────────────────────────────────────

export interface MonthlyResetState {
  /**
   * "YYYY-MM" in the user's local timezone, or null on first run.
   * Used to detect when the calendar month has changed.
   */
  lastSeenMonth: string | null;
}
