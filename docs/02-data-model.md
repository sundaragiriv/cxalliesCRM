# CXAllies — Data Model (Pass 1: Architecture)

> Architectural data model for **CXAllies — Intelligent AI/ERP Solutions**, a product of Varahi Group LLC.
> This is Pass 1 of 2: entity-relationship overview, table inventory, cross-module foreign keys, indexing strategy, and design decisions. No Drizzle code yet — Pass 2 ships the actual TypeScript schema files.
> All vocabulary follows [`04-glossary.md`](./04-glossary.md). Architectural commitments follow [`01-architecture.md`](./01-architecture.md). Decisions are anchored in [ADR-0001](./adr/0001-modular-monolith.md), [ADR-0002](./adr/0002-drizzle-over-prisma.md), [ADR-0003](./adr/0003-ai-first-class-module.md), [ADR-0004](./adr/0004-storage-r2-and-drive.md).

---

## 0. Reading guide

- §1 covers global rules every table follows.
- §2–§13 cover one module each. Each section lists tables, columns at a logical level, and rationale.
- §14 covers cross-module FKs in one place so the dependency graph is visible.
- §15 covers indexing strategy.
- §16 covers seed data needed at launch.
- §17 lists open questions before Pass 2.

When you see a table written like `module_table_name`, that is the actual Postgres table name. When you see `field_name`, that is the actual column name. Conventions in §1.5.

---

## 1. Global rules

### 1.1 Every table has

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Primary key. UUIDs everywhere — no auto-increment integers. |
| `organization_id` | `uuid NOT NULL FK → organizations.id` | Multi-tenant readiness. Singleton today (one Varahi Group). |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | Creation timestamp. |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | Last modified. Trigger-updated on every UPDATE. |
| `deleted_at` | `timestamptz NULL` | Soft delete. NULL = active. |

Exceptions:
- `audit_log` — append-only, no `updated_at`, no `deleted_at`.
- `ai_runs` — append-only, no `updated_at`, no `deleted_at`.
- `journal_lines` — append-only (accounting integrity), no `updated_at`, no `deleted_at`.
- Junction tables (e.g., `entity_tags`) — no `deleted_at`; deletes are hard.

### 1.2 Money

- All monetary amounts stored as `bigint` cents in a column suffixed `_cents`. No floats anywhere.
- Every monetary column is paired with a `currency_code char(3) NOT NULL DEFAULT 'USD'`.
- Multi-currency display uses `exchange_rates` (table defined in §3.6) — Phase 1 stores USD only but the schema supports conversion later.

### 1.3 Dates

- Dates stored as `timestamptz` (with timezone). Database time is UTC.
- API serializes to ISO 8601 strings.
- UI displays in the user's configured timezone (default `America/New_York` for both owners).
- Date-only fields (e.g., invoice date, expense date) use `date` type without time, also UTC.

### 1.4 Soft deletes

- `deleted_at IS NULL` filter is the default for all list queries via the `active(table)` helper (per ADR-0002 §5.3).
- Hard deletes occur only via:
  - Compliance/DSAR scripts (administrative)
  - Junction-table deletes (no soft delete on those)
  - 30-day cleanup job for files (per ADR-0004 §6.2)

### 1.5 Naming conventions

| What | Convention | Example |
|---|---|---|
| Table names | `module_entity_plural` (snake_case) | `finance_expense_entries`, `crm_deals` |
| Cross-module shared tables | `entity_plural` (no prefix) | `parties`, `activities`, `audit_log`, `files`, `users` |
| Column names | `snake_case` | `business_line_id`, `amount_cents` |
| Foreign key columns | `referenced_entity_singular_id` | `party_id`, `business_line_id`, `chart_of_accounts_id` |
| Boolean columns | `is_X` or `has_X` or `was_X` | `is_billable`, `has_2fa_enabled`, `was_paid` |
| Money columns | `X_cents` | `amount_cents`, `total_cents` |
| Junction tables | `parent_table_x_other_table` (alphabetical) | `parties_x_tags`, `users_x_roles` |

### 1.6 Foreign key rules

- All FKs declared with `REFERENCES table(column)`.
- `ON DELETE` behavior is explicit on every FK:
  - `RESTRICT` for business-critical references (default — a Party cannot be deleted while it has Invoices)
  - `CASCADE` for ownership relationships (a Project's TimeEntries cascade-delete when the Project is hard-deleted, which only happens via DSAR)
  - `SET NULL` for soft references (an AI Suggestion's `decided_by_user_id` becomes NULL if the user is hard-deleted)
- Most FKs are `RESTRICT` because soft deletes are the norm — hard deletes are rare and intentional.

### 1.7 JSONB usage

JSONB is allowed in three specific places only:

| Column | Purpose | Schema-validated? |
|---|---|---|
| `*.custom_fields` | Per-business-line custom data (e.g., a consulting Deal's "client industry") | Yes, via `custom_field_definitions` |
| `*.metadata` | Free-form integration data (e.g., Stripe webhook payload) | No — append-only by trusted code |
| `ai_suggestions.payload` | AI output, shape varies by suggestion kind | Yes, validated by Zod schema per kind |

JSONB is forbidden for storing structured data that should be normalized (don't put `[{..}, {..}]` arrays of related entities in JSONB — make a child table).

### 1.8 Indexing baseline

- Every FK column has a `btree` index.
- Every `(organization_id, created_at)` pair has a composite index for tenant-scoped time queries.
- Every column used in `WHERE`, `ORDER BY`, or `GROUP BY` has an index.
- Every soft-delete table has a partial index `WHERE deleted_at IS NULL` on hot query columns.
- Specific cases (full-text search, vector search, partitioning) called out per-module in §15.

### 1.9 Audit trail

Every mutation writes to `audit_log` (defined in §13.2). Implementation is a Drizzle middleware in `src/lib/audit/` that wraps every action. Append-only. No deletes, no updates.

### 1.10 Activity feed

Every business-relevant event writes to `activities` (defined in §13.1). Activities are user-visible (the Customer 360 timeline); audit_log entries are admin-only (the compliance trail). Some events write to both.

---

## 2. Module: `auth`

Owns authentication, authorization, sessions, and OAuth tokens.

### 2.1 `users`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | (standard) | |
| `email` | `text NOT NULL UNIQUE` | Login identifier |
| `email_verified_at` | `timestamptz NULL` | |
| `password_hash` | `text NOT NULL` | Better Auth managed |
| `display_name` | `text NOT NULL` | |
| `avatar_file_id` | `uuid NULL FK → files.id` | Profile picture |
| `party_id` | `uuid NULL FK → parties.id` | Link to the Party record (Venkata is both User and Party) |
| `timezone` | `text NOT NULL DEFAULT 'America/New_York'` | |
| `locale` | `text NOT NULL DEFAULT 'en-US'` | |
| `has_2fa_enabled` | `boolean NOT NULL DEFAULT false` | |
| `last_login_at` | `timestamptz NULL` | |

### 2.2 `auth_sessions`

DB-backed sessions per ADR-0001 §7.1. Better Auth managed.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `user_id` | `uuid NOT NULL FK → users.id ON DELETE CASCADE` | |
| `token_hash` | `text NOT NULL UNIQUE` | SHA-256 of the opaque token |
| `expires_at` | `timestamptz NOT NULL` | |
| `ip_address` | `inet NULL` | For audit |
| `user_agent` | `text NULL` | For audit |
| `created_at` | `timestamptz` | |

No `organization_id` (sessions are user-scoped, not org-scoped).

### 2.3 `auth_oauth_tokens`

Per ADR-0004 §4.2. Encrypted at rest.

| Column | Type | Notes |
|---|---|---|
| `id`, `created_at`, `updated_at`, `deleted_at` | (standard) | |
| `user_id` | `uuid NOT NULL FK → users.id ON DELETE CASCADE` | |
| `provider` | `enum('google', 'microsoft')` | Microsoft reserved for future |
| `access_token_encrypted` | `text NOT NULL` | AES-256-GCM |
| `refresh_token_encrypted` | `text NOT NULL` | AES-256-GCM |
| `expires_at` | `timestamptz NOT NULL` | |
| `scopes` | `text[] NOT NULL` | |
| `account_email` | `text NOT NULL` | Display |

### 2.4 `roles`

Seed table. Per glossary §12.

| Column | Type | Notes |
|---|---|---|
| `id` | `text PK` | `'owner'`, `'admin'`, `'bookkeeper'`, `'sales'`, `'support_agent'` |
| `display_name` | `text NOT NULL` | |
| `description` | `text NOT NULL` | |
| `is_system` | `boolean NOT NULL DEFAULT true` | System roles cannot be deleted |
| `created_at`, `updated_at` | | |

No soft delete on system roles. No `organization_id` (roles are global definitions).

### 2.5 `user_roles`

Junction.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid NOT NULL FK → users.id ON DELETE CASCADE` | |
| `role_id` | `text NOT NULL FK → roles.id` | |
| `granted_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `granted_by_user_id` | `uuid NULL FK → users.id` | |
| **PK** | `(user_id, role_id)` | |

### 2.6 Out of scope for Phase 1

- Custom permission overrides per user (Phase 2, ADR-0007)
- API keys for programmatic access (Phase 5)
- SSO / SAML (deferred indefinitely)

---

## 3. Module: `parties`

Owns the universal contact record — the spine of the system.

### 3.1 `organizations`

The Varahi Group singleton. Every other table FKs into this for multi-tenant readiness.

| Column | Type | Notes |
|---|---|---|
| `id`, `created_at`, `updated_at`, `deleted_at` | | |
| `legal_name` | `text NOT NULL` | "Varahi Group LLC" |
| `display_name` | `text NOT NULL` | "Varahi Group" |
| `ein` | `text NULL` | Federal Employer Identification Number |
| `state_tax_id` | `text NULL` | NC state tax ID |
| `home_state` | `char(2) NOT NULL DEFAULT 'NC'` | |
| `default_currency` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `default_timezone` | `text NOT NULL DEFAULT 'America/New_York'` | |
| `address_line_1`, `address_line_2`, `city`, `state`, `postal_code`, `country` | `text` | Legal mailing address |
| `phone`, `email`, `website` | `text NULL` | Contact info |
| `logo_file_id` | `uuid NULL FK → files.id` | |

No `organization_id` self-FK — this *is* the organization.

### 3.2 `brands`

Per glossary §1. Brands roll up under Varahi Group; Business Lines roll up under Brands.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `name` | `text NOT NULL` | "CXAllies", "Pravara.ai" |
| `display_name` | `text NOT NULL` | |
| `domain` | `text NULL` | "cxallies.com" |
| `logo_file_id` | `uuid NULL FK → files.id` | |
| `description` | `text NULL` | |

### 3.3 `business_lines`

Configurable revenue streams / cost centers. Replaces hardcoded enum.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `brand_id` | `uuid NOT NULL FK → brands.id ON DELETE RESTRICT` | |
| `name` | `text NOT NULL` | "SAP/AI Consulting", "Pravara.ai Matrimony" |
| `slug` | `text NOT NULL` | "consulting", "matrimony" |
| `kind` | `enum('services', 'subscription', 'ad_revenue', 'product', 'other')` | Drives reporting templates |
| `is_active` | `boolean NOT NULL DEFAULT true` | |
| `display_order` | `integer NOT NULL DEFAULT 0` | UI ordering |

Unique on `(organization_id, slug)`.

### 3.4 `parties`

The universal contact. Person or organization.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `kind` | `enum('person', 'organization')` | |
| `display_name` | `text NOT NULL` | "Apex Systems" or "John Doe" |
| `first_name`, `last_name`, `title` | `text NULL` | Person only |
| `legal_name`, `dba` | `text NULL` | Organization only |
| `ein` | `text NULL` | Organization, for 1099 |
| `industry` | `text NULL` | Organization |
| `employer_party_id` | `uuid NULL FK → parties.id` | Person who works for an Organization-Party |
| `primary_email` | `text NULL` | |
| `primary_phone` | `text NULL` | |
| `website` | `text NULL` | |
| `notes` | `text NULL` | |
| `custom_fields` | `jsonb NOT NULL DEFAULT '{}'` | Per-Business-Line schema |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | Integration data |

Indexes: `(organization_id, kind, deleted_at)`, GIN on `custom_fields`, full-text search on `(display_name, primary_email, notes)`.

### 3.5 `party_roles`

A Party can hold many roles simultaneously (Vendor + End Client over time, etc.).

| Column | Type | Notes |
|---|---|---|
| `party_id` | `uuid NOT NULL FK → parties.id ON DELETE CASCADE` | |
| `role` | `enum('vendor', 'end_client', 'customer', 'lead', 'partner', 'employee', 'contractor', 'supplier')` | |
| `business_line_id` | `uuid NULL FK → business_lines.id` | Some roles are scoped to a Business Line; others (Employee, Supplier) are org-wide |
| `assigned_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `is_active` | `boolean NOT NULL DEFAULT true` | |
| **PK** | `(party_id, role, business_line_id)` | |

### 3.6 `party_relationships`

A Person can be associated with multiple Organizations (e.g., a contact who works at both Apex and Magnit). The `employer_party_id` shortcut on `parties` covers the primary case; this table handles N:N.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `from_party_id` | `uuid NOT NULL FK → parties.id ON DELETE CASCADE` | |
| `to_party_id` | `uuid NOT NULL FK → parties.id ON DELETE CASCADE` | |
| `kind` | `enum('works_at', 'spouse_of', 'manages', 'subsidiary_of', 'partner_of', 'other')` | |
| `notes` | `text NULL` | |

### 3.7 `addresses`

Polymorphic — referenced by Parties, Shipments (deferred module), Pay Stubs.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `entity_table` | `text NOT NULL` | `'parties'`, `'organizations'`, etc. |
| `entity_id` | `uuid NOT NULL` | |
| `kind` | `enum('billing', 'shipping', 'home', 'office', 'other')` | |
| `is_primary` | `boolean NOT NULL DEFAULT false` | |
| `line_1`, `line_2`, `city`, `state`, `postal_code`, `country` | `text` | |
| `formatted` | `text NOT NULL` | Pre-formatted display string |

Index: `(entity_table, entity_id, is_primary)`.

### 3.8 `tags` (cross-module)

Defined here because `parties` is the most common consumer.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `name` | `text NOT NULL` | |
| `slug` | `text NOT NULL` | |
| `color` | `text NULL` | Hex |

Unique on `(organization_id, slug)`.

### 3.9 `entity_tags`

Polymorphic junction.

| Column | Type | Notes |
|---|---|---|
| `tag_id` | `uuid NOT NULL FK → tags.id ON DELETE CASCADE` | |
| `entity_table` | `text NOT NULL` | |
| `entity_id` | `uuid NOT NULL` | |
| `tagged_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `tagged_by_user_id` | `uuid NULL FK → users.id` | |
| **PK** | `(tag_id, entity_table, entity_id)` | |

### 3.10 `custom_field_definitions`

Drives the `parties.custom_fields` JSONB schema, also used by `crm_deals` and `support_tickets`.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `entity_table` | `text NOT NULL` | Which entity this field applies to |
| `business_line_id` | `uuid NULL FK → business_lines.id` | Some custom fields are per-Business-Line (e.g., consulting needs "client industry") |
| `field_key` | `text NOT NULL` | Used as JSONB key |
| `field_label` | `text NOT NULL` | UI label |
| `field_type` | `enum('text', 'number', 'date', 'boolean', 'select', 'multiselect')` | |
| `options` | `jsonb NULL` | For select/multiselect |
| `is_required` | `boolean NOT NULL DEFAULT false` | |
| `display_order` | `integer NOT NULL DEFAULT 0` | |

Unique on `(organization_id, entity_table, business_line_id, field_key)`.

---

## 4. Module: `finance`

The accounting backbone. Phase 1 priority: replace QuickBooks.

### 4.1 `chart_of_accounts`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `account_number` | `text NOT NULL` | "4000-Consulting Revenue", numbered scheme TBD in §17 |
| `account_name` | `text NOT NULL` | |
| `account_type` | `enum('asset', 'liability', 'equity', 'revenue', 'expense', 'cogs')` | |
| `account_subtype` | `text NOT NULL` | E.g., "current_asset", "long_term_liability" — for balance sheet grouping |
| `business_line_id` | `uuid NULL FK → business_lines.id` | NULL = org-wide |
| `parent_account_id` | `uuid NULL FK → chart_of_accounts.id` | For hierarchical accounts |
| `is_active` | `boolean NOT NULL DEFAULT true` | |
| `description` | `text NULL` | |

Unique on `(organization_id, account_number)`.

### 4.2 `journal_entries`

A single accounting fact. Designed-for-double-entry, recorded in single-entry mode in Phase 1.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at` | | |
| `entry_date` | `date NOT NULL` | |
| `entry_number` | `text NOT NULL` | Sequential, formatted "JE-2026-00001" |
| `description` | `text NOT NULL` | |
| `source_table`, `source_id` | `text NOT NULL`, `uuid NOT NULL` | What created this entry — `'finance_revenue_entries'`, `'finance_expense_entries'`, etc. |
| `is_reversal` | `boolean NOT NULL DEFAULT false` | |
| `reversed_journal_entry_id` | `uuid NULL FK → journal_entries.id` | |

Unique on `(organization_id, entry_number)`. Indexes on `(source_table, source_id)`.

No `deleted_at` — accounting entries are immutable. Reversals create new entries.

### 4.3 `journal_lines`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at` | | |
| `journal_entry_id` | `uuid NOT NULL FK → journal_entries.id ON DELETE CASCADE` | |
| `chart_of_accounts_id` | `uuid NOT NULL FK → chart_of_accounts.id ON DELETE RESTRICT` | |
| `debit_cents` | `bigint NOT NULL DEFAULT 0` | |
| `credit_cents` | `bigint NOT NULL DEFAULT 0` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `description` | `text NULL` | |
| `business_line_id` | `uuid NULL FK → business_lines.id` | Per-line P&L |
| `party_id` | `uuid NULL FK → parties.id` | For AR/AP detail |
| `line_number` | `integer NOT NULL` | Order within entry |

CHECK constraint: `(debit_cents > 0 AND credit_cents = 0) OR (debit_cents = 0 AND credit_cents > 0)`.

No `updated_at`, no `deleted_at`. Append-only.

### 4.4 `revenue_entries`

Money in.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `entry_date` | `date NOT NULL` | |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `party_id` | `uuid NULL FK → parties.id` | Who paid |
| `chart_of_accounts_id` | `uuid NOT NULL FK → chart_of_accounts.id` | Revenue account |
| `description` | `text NOT NULL` | |
| `amount_cents` | `bigint NOT NULL` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `payment_method` | `enum('check', 'ach', 'wire', 'card', 'cash', 'other')` | |
| `payment_status` | `enum('expected', 'received', 'failed', 'refunded')` | |
| `received_at` | `timestamptz NULL` | |
| `invoice_id` | `uuid NULL FK → billing_invoices.id` | If from an invoice |
| `subscription_id` | `uuid NULL FK → billing_subscriptions.id` | If from a subscription |
| `journal_entry_id` | `uuid NULL FK → journal_entries.id` | Created on payment received |
| `notes` | `text NULL` | |

### 4.5 `expense_entries`

Money out.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `entry_date` | `date NOT NULL` | |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `chart_of_accounts_id` | `uuid NOT NULL FK → chart_of_accounts.id` | Expense account |
| `payee_party_id` | `uuid NULL FK → parties.id` | Supplier or Vendor being paid |
| `description` | `text NOT NULL` | |
| `amount_cents` | `bigint NOT NULL` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `payment_source` | `enum('business_card', 'personal_card_business_use', 'personal_cash', 'business_check', 'business_ach', 'vendor_paid')` | |
| `corporate_card_id` | `uuid NULL FK → corporate_cards.id` | |
| `is_billable` | `boolean NOT NULL DEFAULT false` | Pass-through to End Client |
| `is_reimbursable` | `boolean NOT NULL DEFAULT false` | Varahi owes employee |
| `project_id` | `uuid NULL FK → billing_projects.id` | For consulting expense tracking |
| `expense_report_id` | `uuid NULL FK → expense_reports.id` | If part of a reimbursement batch |
| `invoice_id` | `uuid NULL FK → billing_invoices.id` | If billed back to End Client |
| `submitted_by_user_id` | `uuid NULL FK → users.id` | For employee expenses |
| `receipt_file_id` | `uuid NULL FK → files.id` | |
| `journal_entry_id` | `uuid NULL FK → journal_entries.id` | Created on payment |
| `notes` | `text NULL` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Indexes: `(organization_id, entry_date DESC)`, `(business_line_id, entry_date)`, `(project_id, entry_date)`, `(is_billable, invoice_id)` partial WHERE `is_billable = true`, `(is_reimbursable, expense_report_id)` partial WHERE `is_reimbursable = true AND expense_report_id IS NULL`.

### 4.6 `expense_reports`

Per the kickoff scope addition. Groups employee expenses for reimbursement.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `report_number` | `text NOT NULL` | "EXP-2026-001" |
| `submitted_by_user_id` | `uuid NOT NULL FK → users.id` | |
| `subject_party_id` | `uuid NULL FK → parties.id` | The Employee Party |
| `business_line_id` | `uuid NULL FK → business_lines.id` | |
| `project_id` | `uuid NULL FK → billing_projects.id` | E.g., "Trip to Zoox, Feb 12-14" |
| `purpose` | `text NOT NULL` | "Client visit — Zoox SAP rollout" |
| `period_start`, `period_end` | `date NOT NULL` | |
| `status` | `enum('draft', 'submitted', 'approved', 'rejected', 'reimbursed')` | |
| `total_cents` | `bigint NOT NULL DEFAULT 0` | Denormalized sum of associated expenses |
| `submitted_at`, `approved_at`, `reimbursed_at` | `timestamptz NULL` | |
| `approved_by_user_id`, `reimbursed_by_user_id` | `uuid NULL FK → users.id` | |
| `reimbursement_payment_id` | `uuid NULL FK → finance_revenue_entries.id` | Reverse — Varahi out, Employee in. Stored as expense from Varahi's books, revenue from Employee's perspective. Modeled here as a reference. |

Unique on `(organization_id, report_number)`.

### 4.7 `corporate_cards`

Per the kickoff scope addition.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `nickname` | `text NOT NULL` | "Chase Sapphire — Business" |
| `last_four` | `char(4) NOT NULL` | |
| `card_type` | `enum('visa', 'mastercard', 'amex', 'discover', 'other')` | |
| `ownership` | `enum('business_owned', 'personal_with_business_use')` | Drives reimbursement default |
| `holder_user_id` | `uuid NULL FK → users.id` | Which employee holds it (NULL for jointly-held business cards) |
| `is_active` | `boolean NOT NULL DEFAULT true` | |
| `notes` | `text NULL` | |

### 4.8 `tax_rates`

Configurable. Owner can adjust as IRS/NC tables change.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `tax_kind` | `enum('federal_income', 'state_income', 'self_employment', 'fica_ss', 'fica_medicare', 'medicare_additional')` | |
| `effective_from`, `effective_to` | `date` | |
| `bracket_low_cents`, `bracket_high_cents` | `bigint NULL` | NULL high = unbounded |
| `filing_status` | `enum('single', 'married_jointly', 'married_separately', 'head_of_household') NULL` | |
| `rate_basis_points` | `integer NOT NULL` | 2200 = 22.00% |
| `state_code` | `char(2) NULL` | NC for state-specific |

### 4.9 `tax_estimates`

Auto-recomputed quarterly.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `tax_year`, `tax_quarter` | `integer NOT NULL` | |
| `period_start`, `period_end` | `date NOT NULL` | |
| `gross_income_cents` | `bigint NOT NULL` | |
| `deductible_expenses_cents` | `bigint NOT NULL` | |
| `taxable_income_cents` | `bigint NOT NULL` | |
| `federal_estimate_cents` | `bigint NOT NULL` | |
| `state_estimate_cents` | `bigint NOT NULL` | |
| `self_employment_estimate_cents` | `bigint NOT NULL` | |
| `total_estimate_cents` | `bigint NOT NULL` | |
| `due_date` | `date NOT NULL` | |
| `paid_at` | `timestamptz NULL` | |
| `paid_amount_cents` | `bigint NULL` | |
| `notes` | `text NULL` | |

Unique on `(organization_id, tax_year, tax_quarter)`.

---

## 5. Module: `billing`

Time, projects, invoices, payments, subscriptions.

### 5.1 `projects`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `project_number` | `text NOT NULL` | "PRJ-2026-001" |
| `name` | `text NOT NULL` | |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `contract_id` | `uuid NULL FK → crm_contracts.id` | The governing Contract |
| `end_client_party_id` | `uuid NULL FK → parties.id` | |
| `vendor_party_id` | `uuid NULL FK → parties.id` | NULL for direct engagements |
| `start_date`, `end_date` | `date` | |
| `status` | `enum('planned', 'active', 'on_hold', 'completed', 'canceled')` | |
| `default_billable_rate_cents` | `bigint NULL` | Override per-time-entry possible |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `budget_hours` | `numeric(10,2) NULL` | |
| `description` | `text NULL` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Indexes: `(business_line_id, status)`, `(end_client_party_id, status)`, `(contract_id)`.

### 5.2 `time_entries`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `project_id` | `uuid NOT NULL FK → projects.id` | |
| `submitted_by_user_id` | `uuid NOT NULL FK → users.id` | Employee logging the time |
| `entry_date` | `date NOT NULL` | |
| `hours` | `numeric(5,2) NOT NULL` | |
| `description` | `text NOT NULL` | |
| `billable_rate_cents` | `bigint NOT NULL` | Snapshotted from Project at entry time |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `status` | `enum('draft', 'submitted', 'approved', 'invoiced', 'rejected')` | |
| `timesheet_id` | `uuid NULL FK → timesheets.id` | |
| `invoice_line_id` | `uuid NULL FK → invoice_lines.id` | Set when invoiced |
| `notes` | `text NULL` | |

Indexes: `(project_id, entry_date)`, `(submitted_by_user_id, entry_date)`, `(status)`, `(timesheet_id)`.

### 5.3 `timesheets`

A weekly aggregation row. Per glossary §4 — `time_entries` is the data; `timesheets` is the approval workflow record.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `submitted_by_user_id` | `uuid NOT NULL FK → users.id` | |
| `week_starting` | `date NOT NULL` | Monday of the week |
| `status` | `enum('draft', 'submitted', 'approved', 'rejected')` | |
| `total_hours` | `numeric(7,2) NOT NULL DEFAULT 0` | Denormalized sum |
| `submitted_at`, `approved_at`, `rejected_at` | `timestamptz NULL` | |
| `approved_by_user_id` | `uuid NULL FK → users.id` | |
| `rejection_reason` | `text NULL` | |

Unique on `(organization_id, submitted_by_user_id, week_starting)`.

### 5.4 `invoices`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `invoice_number` | `text NOT NULL` | "INV-2026-0001" — scheme TBD in §17 |
| `bill_to_party_id` | `uuid NOT NULL FK → parties.id` | Vendor or End Client |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `project_id` | `uuid NULL FK → projects.id` | Denormalized for filter speed |
| `issue_date` | `date NOT NULL` | |
| `due_date` | `date NOT NULL` | |
| `period_start`, `period_end` | `date NULL` | The work period this invoice covers |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `subtotal_cents` | `bigint NOT NULL DEFAULT 0` | |
| `tax_cents` | `bigint NOT NULL DEFAULT 0` | |
| `total_cents` | `bigint NOT NULL DEFAULT 0` | |
| `paid_cents` | `bigint NOT NULL DEFAULT 0` | |
| `status` | `enum('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'canceled')` | |
| `pdf_file_id` | `uuid NULL FK → files.id` | |
| `sent_at`, `paid_at`, `voided_at` | `timestamptz NULL` | |
| `terms` | `text NULL` | "Net 30", custom terms |
| `notes` | `text NULL` | |

Unique on `(organization_id, invoice_number)`.

### 5.5 `invoice_lines`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at` | | |
| `invoice_id` | `uuid NOT NULL FK → invoices.id ON DELETE CASCADE` | |
| `line_number` | `integer NOT NULL` | |
| `description` | `text NOT NULL` | |
| `kind` | `enum('time', 'expense', 'fixed', 'discount', 'tax')` | |
| `project_id` | `uuid NULL FK → projects.id` | |
| `quantity` | `numeric(10,2) NOT NULL DEFAULT 1` | Hours for time, units for fixed |
| `unit_price_cents` | `bigint NOT NULL` | |
| `amount_cents` | `bigint NOT NULL` | quantity * unit_price |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `tax_rate_basis_points` | `integer NULL` | 2200 = 22.00% |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Indexes: `(invoice_id, line_number)`, `(project_id)`.

### 5.6 `payments`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `payment_number` | `text NOT NULL` | "PAY-2026-0001" |
| `from_party_id` | `uuid NOT NULL FK → parties.id` | |
| `payment_date` | `date NOT NULL` | |
| `amount_cents` | `bigint NOT NULL` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `payment_method` | `enum('check', 'ach', 'wire', 'card', 'cash', 'other')` | |
| `reference` | `text NULL` | Check number, wire confirmation |
| `notes` | `text NULL` | |
| `revenue_entry_id` | `uuid NULL FK → finance_revenue_entries.id` | |

### 5.7 `payment_applications`

A payment can split across multiple invoices.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at` | | |
| `payment_id` | `uuid NOT NULL FK → payments.id ON DELETE CASCADE` | |
| `invoice_id` | `uuid NOT NULL FK → invoices.id` | |
| `applied_cents` | `bigint NOT NULL` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |

### 5.8 `subscription_plans`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `name` | `text NOT NULL` | |
| `slug` | `text NOT NULL` | |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `price_cents` | `bigint NOT NULL` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `billing_period` | `enum('monthly', 'quarterly', 'annual', 'lifetime')` | |
| `trial_days` | `integer NOT NULL DEFAULT 0` | |
| `is_active` | `boolean NOT NULL DEFAULT true` | |
| `features` | `jsonb NOT NULL DEFAULT '[]'` | |
| `description` | `text NULL` | |

Unique on `(organization_id, slug)`.

### 5.9 `subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `subscriber_party_id` | `uuid NOT NULL FK → parties.id` | |
| `plan_id` | `uuid NOT NULL FK → subscription_plans.id ON DELETE RESTRICT` | |
| `status` | `enum('trialing', 'active', 'past_due', 'canceled', 'expired', 'paused')` | |
| `current_period_start`, `current_period_end` | `date NOT NULL` | |
| `trial_ends_at` | `date NULL` | |
| `started_at` | `timestamptz NOT NULL` | |
| `canceled_at` | `timestamptz NULL` | |
| `cancel_at_period_end` | `boolean NOT NULL DEFAULT false` | |
| `auto_renew` | `boolean NOT NULL DEFAULT true` | |
| `external_subscription_id` | `text NULL` | Stripe ID, Phase 3 |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Indexes: `(subscriber_party_id)`, `(status, current_period_end)` — for finding renewals.

### 5.10 `subscription_events`

Lifecycle log. Distinct from `activities` because subscription history needs structured replay (downgrade history, renewal failures).

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at` | | |
| `subscription_id` | `uuid NOT NULL FK → subscriptions.id ON DELETE CASCADE` | |
| `event_kind` | `enum('created', 'trial_started', 'trial_ended', 'activated', 'renewed', 'upgraded', 'downgraded', 'paused', 'resumed', 'canceled', 'expired', 'reactivated', 'payment_failed', 'payment_succeeded')` | |
| `from_plan_id` | `uuid NULL FK → subscription_plans.id` | For upgrades/downgrades |
| `to_plan_id` | `uuid NULL FK → subscription_plans.id` | |
| `triggered_by_user_id` | `uuid NULL FK → users.id` | NULL = system-triggered |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Append-only.

### 5.11 `memberships`

Distinct from subscriptions — for non-recurring access grants.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `member_party_id` | `uuid NOT NULL FK → parties.id` | |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `tier` | `text NOT NULL` | "founding_member", "lifetime", "vip" |
| `subscription_id` | `uuid NULL FK → subscriptions.id` | If derived from a subscription |
| `granted_at` | `timestamptz NOT NULL` | |
| `expires_at` | `timestamptz NULL` | NULL = perpetual |
| `revoked_at` | `timestamptz NULL` | |
| `notes` | `text NULL` | |

---

## 6. Module: `crm`

Phase 1 ships skeleton (Contracts + Deals as Won-stage). Full pipeline UI in Phase 2.

### 6.1 `deal_stages`

Configurable per Business Line.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `name` | `text NOT NULL` | |
| `slug` | `text NOT NULL` | |
| `display_order` | `integer NOT NULL` | |
| `kind` | `enum('open', 'won', 'lost')` | Terminal-ness |
| `default_probability` | `integer NOT NULL DEFAULT 0` | 0–100 |

Unique on `(organization_id, business_line_id, slug)`.

### 6.2 `deals`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `deal_number` | `text NOT NULL` | "DEAL-2026-0001" |
| `name` | `text NOT NULL` | |
| `primary_party_id` | `uuid NOT NULL FK → parties.id` | The buyer |
| `vendor_party_id` | `uuid NULL FK → parties.id` | The intermediary, for consulting |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `stage_id` | `uuid NOT NULL FK → deal_stages.id` | |
| `expected_value_cents` | `bigint NOT NULL DEFAULT 0` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `probability` | `integer NOT NULL` | 0–100, snapshot from stage default |
| `expected_close_date` | `date NULL` | |
| `closed_at` | `timestamptz NULL` | |
| `closed_won_at`, `closed_lost_at` | `timestamptz NULL` | |
| `lost_reason` | `text NULL` | |
| `owner_user_id` | `uuid NOT NULL FK → users.id` | |
| `source` | `text NULL` | "Referral from Apex", "Inbound from website" |
| `description` | `text NULL` | |
| `custom_fields` | `jsonb NOT NULL DEFAULT '{}'` | |

Indexes: `(business_line_id, stage_id, deleted_at)`, `(primary_party_id)`, `(owner_user_id, stage_id)`.

### 6.3 `contracts`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `contract_number` | `text NOT NULL` | "CON-2026-0001" |
| `name` | `text NOT NULL` | |
| `deal_id` | `uuid NULL FK → deals.id` | Source deal |
| `end_client_party_id` | `uuid NOT NULL FK → parties.id` | |
| `vendor_party_id` | `uuid NULL FK → parties.id` | |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `rate_card_id` | `uuid NULL FK → rate_cards.id` | |
| `start_date`, `end_date` | `date NOT NULL` | |
| `status` | `enum('draft', 'sent', 'signed', 'active', 'expired', 'renewed', 'terminated')` | |
| `signed_at`, `terminated_at` | `timestamptz NULL` | |
| `auto_renews` | `boolean NOT NULL DEFAULT false` | |
| `renewal_notice_days` | `integer NULL` | |
| `signed_pdf_file_id` | `uuid NULL FK → files.id` | |
| `total_value_cents` | `bigint NULL` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `terms` | `text NULL` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Indexes: `(end_client_party_id, status)`, `(business_line_id, end_date)`, `(status, end_date)` — for finding renewals.

### 6.4 `rate_cards`

Versioned rate sheets.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `name` | `text NOT NULL` | "Standard Consulting 2026" |
| `business_line_id` | `uuid NOT NULL FK → business_lines.id` | |
| `effective_from`, `effective_to` | `date` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `version` | `integer NOT NULL DEFAULT 1` | |
| `notes` | `text NULL` | |

### 6.5 `rate_card_lines`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at` | | |
| `rate_card_id` | `uuid NOT NULL FK → rate_cards.id ON DELETE CASCADE` | |
| `role_name` | `text NOT NULL` | "Senior SAP Consultant" |
| `seniority` | `text NULL` | "L4", "Principal" |
| `hourly_rate_cents` | `bigint NOT NULL` | |
| `daily_rate_cents` | `bigint NULL` | |
| `notes` | `text NULL` | |

---

## 7. Module: `support` (Phase 2)

Skeleton only. Full schema covered in Phase 2 ticket. Listed here for completeness.

| Table | Purpose |
|---|---|
| `support_tickets` | Inbound requests. Status, priority, channel, assignee. |
| `support_ticket_messages` | Conversation threads. |
| `support_canned_responses` | Reusable templates. |
| `support_kb_articles` | Internal + public KB. |
| `support_kb_categories` | KB hierarchy. |
| `support_sla_policies` | SLA targets per priority. |

---

## 8. Module: `marketing` (Phase 3)

Skeleton only. Full schema covered in Phase 3 ticket.

| Table | Purpose |
|---|---|
| `marketing_campaigns` | Outbound efforts. |
| `marketing_sequences` | Multi-step automation. |
| `marketing_sequence_steps` | Steps within a sequence. |
| `marketing_segments` | Saved party queries. |
| `marketing_lead_forms` | Embeddable forms. |
| `marketing_lead_form_submissions` | Form submissions. |
| `marketing_promotions` | Discount codes. |

---

## 9. Module: `payroll` (Phase 4)

Phase 1 reserves these tables — Payroll references `hr_employees`.

| Table | Purpose |
|---|---|
| `payroll_pay_periods` | Fixed payroll windows. |
| `payroll_pay_runs` | Execution of payroll for a period. |
| `payroll_pay_stubs` | Per-employee output. |
| `payroll_owner_draws` | Owner profit distributions (separate from W-2 wages). |

---

## 10. Module: `hr`

Phase 1 ships `hr_employees` skeleton because Payroll references it.

### 10.1 `hr_employees`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `party_id` | `uuid NOT NULL FK → parties.id ON DELETE RESTRICT` | The Person-Party |
| `user_id` | `uuid NULL FK → users.id` | If they have a CXAllies login |
| `employee_number` | `text NOT NULL` | "EMP-001" |
| `classification` | `enum('w2', '1099_contractor', 'owner_employee')` | |
| `hire_date`, `termination_date` | `date` | |
| `status` | `enum('active', 'on_leave', 'terminated')` | |
| `pay_frequency` | `enum('weekly', 'biweekly', 'semi_monthly', 'monthly')` | |
| `default_pay_rate_cents` | `bigint NULL` | Hourly or per-period |
| `pay_rate_kind` | `enum('hourly', 'salary')` | |
| `currency_code` | `char(3) NOT NULL DEFAULT 'USD'` | |
| `federal_filing_status` | `enum('single', 'married_jointly', 'married_separately', 'head_of_household') NULL` | |
| `federal_allowances` | `integer NULL` | |
| `state_code` | `char(2) NOT NULL DEFAULT 'NC'` | |
| `state_allowances` | `integer NULL` | |
| `additional_withholding_cents` | `bigint NOT NULL DEFAULT 0` | |
| `bank_account_last_four` | `char(4) NULL` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Unique on `(organization_id, employee_number)`.

Phase 4 adds: `hr_pto_balances`, `hr_pto_requests`, `hr_employee_documents`, `hr_performance_reviews` (all skeletal).

---

## 11. Module: `reporting`

### 11.1 `dashboards`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `name` | `text NOT NULL` | |
| `slug` | `text NOT NULL` | |
| `owner_user_id` | `uuid NULL FK → users.id` | NULL = org-wide |
| `is_default` | `boolean NOT NULL DEFAULT false` | |
| `layout` | `jsonb NOT NULL DEFAULT '[]'` | Tile positions |

### 11.2 `dashboard_tiles`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | | |
| `dashboard_id` | `uuid NOT NULL FK → dashboards.id ON DELETE CASCADE` | |
| `tile_kind` | `enum('kpi', 'line_chart', 'bar_chart', 'table', 'list', 'project_health')` | |
| `data_source` | `text NOT NULL` | Registered query name |
| `config` | `jsonb NOT NULL DEFAULT '{}'` | Per-tile config |
| `display_order` | `integer NOT NULL DEFAULT 0` | |

### 11.3 `reporting_rollups`

Per ADR §10 performance budget. Pre-computed daily aggregations.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at`, `updated_at` | | |
| `rollup_kind` | `text NOT NULL` | "revenue_by_business_line_daily" |
| `dimension_key` | `text NOT NULL` | E.g., business_line_id |
| `period_date` | `date NOT NULL` | |
| `value_cents` | `bigint NULL` | |
| `value_count` | `integer NULL` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Unique on `(organization_id, rollup_kind, dimension_key, period_date)`.

Refreshed by pg-boss jobs subscribing to relevant events.

---

## 12. Module: `ai`

Per ADR-0003. Tables defined there; recapped here for completeness.

| Table | Purpose | Phase |
|---|---|---|
| `ai_runs` | Every LLM call. Append-only. | 1 |
| `ai_suggestions` | AI outputs tied to entities. Pending → accepted/rejected. | 1 |
| `ai_embeddings` | Vector embeddings. `pgvector`. | 1 |
| `ai_budgets` | Per-module budgets. | 1 |

---

## 13. Module: `files` and cross-module shared tables

### 13.1 `activities`

The unified timeline. Per ADR-0001 §3.2 — one of three tables exempt from module ownership.

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at` | | No `updated_at` (rare), no `deleted_at` (rare); soft-archive via `is_archived` if needed |
| `party_id` | `uuid NULL FK → parties.id` | The party this activity is "about" |
| `kind` | `text NOT NULL` | "invoice_paid", "ticket_created", "deal_stage_changed", "note", etc. |
| `entity_table` | `text NULL` | Source entity |
| `entity_id` | `uuid NULL` | |
| `business_line_id` | `uuid NULL FK → business_lines.id` | |
| `actor_user_id` | `uuid NULL FK → users.id` | NULL = system |
| `summary` | `text NOT NULL` | Display string |
| `occurred_at` | `timestamptz NOT NULL` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

Indexes: `(party_id, occurred_at DESC)`, `(entity_table, entity_id, occurred_at DESC)`, `(business_line_id, occurred_at DESC)`, `(organization_id, occurred_at DESC)`.

Partitioned by `occurred_at` month once volume exceeds ~100K rows (per ADR-0001 §10).

### 13.2 `audit_log`

Append-only mutation history.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `organization_id` | `uuid NOT NULL FK → organizations.id` | |
| `occurred_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `actor_user_id` | `uuid NULL FK → users.id` | |
| `action` | `enum('insert', 'update', 'delete', 'soft_delete', 'restore')` | |
| `table_name` | `text NOT NULL` | |
| `record_id` | `uuid NOT NULL` | |
| `before` | `jsonb NULL` | Pre-mutation snapshot (NULL for insert) |
| `after` | `jsonb NULL` | Post-mutation snapshot (NULL for delete) |
| `request_id` | `uuid NULL` | For correlating multi-table mutations from one request |
| `ip_address` | `inet NULL` | |
| `user_agent` | `text NULL` | |

Indexes: `(table_name, record_id, occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`, `(organization_id, occurred_at DESC)`.

### 13.3 `files`

Per ADR-0004 §4.1. Recapped: unified file metadata, R2 or Drive backend.

### 13.4 `exchange_rates`

| Column | Type | Notes |
|---|---|---|
| `id`, `organization_id`, `created_at` | | |
| `from_currency` | `char(3) NOT NULL` | |
| `to_currency` | `char(3) NOT NULL` | |
| `rate_date` | `date NOT NULL` | |
| `rate` | `numeric(18,8) NOT NULL` | |
| `source` | `text NOT NULL` | "manual", "openexchangerates" |

Unique on `(organization_id, from_currency, to_currency, rate_date)`.

---

## 14. Cross-module foreign keys

The graph that justifies the modular monolith. Every cross-module FK is reviewed at PR time per ADR-0001 §5.4.

| From table | From module | To table | To module | Why |
|---|---|---|---|---|
| `users.party_id` | auth | `parties` | parties | A User can be a Party (Venkata is both) |
| `users.avatar_file_id` | auth | `files` | files | Profile picture |
| `parties.employer_party_id` | parties | `parties` (self) | parties | Person works at Organization |
| `party_relationships.from/to_party_id` | parties | `parties` | parties | Relationship graph |
| `addresses.entity_id` (polymorphic) | parties | various | various | Polymorphic; not enforced via FK |
| `business_lines.brand_id` | parties | `brands` | parties | Brand→BL hierarchy |
| `chart_of_accounts.business_line_id` | finance | `business_lines` | parties | Per-line accounts |
| `journal_lines.party_id` | finance | `parties` | parties | AR/AP detail |
| `revenue_entries.invoice_id` | finance | `invoices` | billing | Source invoice |
| `revenue_entries.subscription_id` | finance | `subscriptions` | billing | Source subscription |
| `expense_entries.payee_party_id` | finance | `parties` | parties | Supplier/Vendor paid |
| `expense_entries.project_id` | finance | `projects` | billing | Consulting expense link |
| `expense_entries.invoice_id` | finance | `invoices` | billing | Pass-through billed |
| `expense_entries.receipt_file_id` | finance | `files` | files | Receipt |
| `expense_entries.submitted_by_user_id` | finance | `users` | auth | Employee who submitted |
| `expense_reports.submitted_by_user_id` | finance | `users` | auth | |
| `expense_reports.subject_party_id` | finance | `parties` | parties | Employee Party |
| `expense_reports.project_id` | finance | `projects` | billing | |
| `corporate_cards.holder_user_id` | finance | `users` | auth | |
| `projects.contract_id` | billing | `contracts` | crm | The governing contract |
| `projects.end_client_party_id` | billing | `parties` | parties | |
| `projects.vendor_party_id` | billing | `parties` | parties | |
| `time_entries.submitted_by_user_id` | billing | `users` | auth | |
| `invoices.bill_to_party_id` | billing | `parties` | parties | |
| `invoices.project_id` | billing | `projects` | billing | (intra-module) |
| `invoice_lines.project_id` | billing | `projects` | billing | (intra-module) |
| `payments.from_party_id` | billing | `parties` | parties | |
| `subscriptions.subscriber_party_id` | billing | `parties` | parties | |
| `deals.primary_party_id` | crm | `parties` | parties | |
| `deals.vendor_party_id` | crm | `parties` | parties | |
| `deals.owner_user_id` | crm | `users` | auth | |
| `contracts.deal_id` | crm | `deals` | crm | (intra-module) |
| `contracts.end_client_party_id` | crm | `parties` | parties | |
| `contracts.vendor_party_id` | crm | `parties` | parties | |
| `contracts.signed_pdf_file_id` | crm | `files` | files | |
| `hr_employees.party_id` | hr | `parties` | parties | Employee Party |
| `hr_employees.user_id` | hr | `users` | auth | |
| `dashboards.owner_user_id` | reporting | `users` | auth | |
| `ai_suggestions.entity_*` | ai | various | various | Polymorphic |
| `ai_runs.triggered_by_user_id` | ai | `users` | auth | |
| `activities.party_id` | (shared) | `parties` | parties | |
| `activities.actor_user_id` | (shared) | `users` | auth | |
| `audit_log.actor_user_id` | (shared) | `users` | auth | |
| `files.uploaded_by_user_id` | files | `users` | auth | |
| `files.drive_account_id` | files | `auth_oauth_tokens` | auth | |

This graph is dense — that is the point. The modular monolith is the right answer because these joins are first-class queries, not orchestration overhead.

---

## 15. Indexing strategy

### 15.1 Standard indexes per table

- Primary key (UUID, btree)
- `(organization_id, created_at)` composite — for tenant-scoped time queries
- Every FK column individually
- Every column in a frequent `WHERE`, `ORDER BY`, or `GROUP BY` per table's query patterns

### 15.2 Partial indexes

| Index | Why |
|---|---|
| `expense_entries (is_billable, invoice_id) WHERE is_billable = true` | "Find unbilled billable expenses" — Project Health tile |
| `expense_entries (is_reimbursable, expense_report_id) WHERE is_reimbursable = true AND expense_report_id IS NULL` | "Find unreimbursed expenses" |
| `invoices (status, due_date) WHERE status IN ('sent', 'partially_paid')` | "Find AR aging" |
| `subscriptions (status, current_period_end) WHERE status IN ('active', 'past_due')` | "Find renewals due" |
| `contracts (status, end_date) WHERE status IN ('active', 'signed')` | "Find expiring contracts" |
| `deals (stage_id, deleted_at) WHERE deleted_at IS NULL AND stage_id IN ('open' stages)` | "Active pipeline" |
| `time_entries (status) WHERE status = 'approved'` | "Find invoiceable time" |

### 15.3 Full-text search

Postgres `tsvector` columns + GIN indexes on:

- `parties (display_name, primary_email, notes)` — Customer 360 search
- `crm_contracts (name, terms)` — contract lookup
- `support_kb_articles (title, body)` — KB search
- `support_tickets (subject, body)` — ticket search

Phase 5+ may move to Typesense or Meilisearch for richer search UX. Phase 1–4 ships with native Postgres FTS.

### 15.4 Vector indexes

Per ADR-0003. HNSW index on `ai_embeddings.embedding`.

### 15.5 Partitioning

`activities` — partitioned by `occurred_at` (monthly partitions) once row count exceeds ~100K. Phase 1 ships unpartitioned; partitioning migration scheduled for Phase 2 ticket if volume warrants.

`audit_log` — same strategy, but threshold is higher (~500K rows).

---

## 16. Seed data

What ships in the database before the first user signs in:

| Seed data | Source | Purpose |
|---|---|---|
| One `organizations` row | Hard-coded migration | Varahi Group LLC |
| Four `business_lines` rows | Migration | SAP Consulting, Pravara.ai, Websites, YouTube — configurable, can be edited |
| One `brands` row | Migration | CXAllies |
| Five `roles` rows | Migration | Owner, Admin, Bookkeeper, Sales, Support Agent |
| 26-row `chart_of_accounts` | Migration | Standard small-business CoA + per-line revenue/expense splits |
| Federal + NC `tax_rates` (2026) | Migration | IRS Pub 15-T tables, NC tables. Owner can update yearly. |
| Default `deal_stages` per Business Line | Migration | Lead → Qualified → Proposal → Negotiation → Won/Lost |
| One `users` row (Venkata as Owner) | Migration | Owner account, password set on first run |
| One `parties` row for Venkata, linked to user | Migration | |
| One `parties` row for Poornima | Migration | Will become a User in Phase 2 |

Per the kickoff decision, no migration from the existing Excel workbook. Phase 1 starts with seeded data plus optional synthetic data for dashboard testing.

---

## 17. Open questions for Pass 2

Three items I deferred and need answers on before generating Drizzle code:

1. **Account numbering scheme.** I left `chart_of_accounts.account_number` as `text` to defer this. Common schemes:
   - 4-digit numeric (1000–9999) — QuickBooks standard
   - Type-prefixed (1000s asset, 2000s liability, 4000s revenue, 5000s expense) — most flexible
   - Hierarchical with dots ("4000.consulting", "4000.matrimony") — readable but breaks SQL ORDER BY
   
   Recommend type-prefixed numeric (1000–9999) with the standard ranges. Confirm or override.

2. **Invoice / Deal / Contract numbering scheme.** Current draft uses `INV-{YYYY}-{NNNN}`. Alternatives:
   - `INV-{YYYY}-{NNNN}` — readable, year-resets ambiguous if you split per business line
   - `{BL_SLUG}-INV-{YYYY}-{NNNN}` — per-business-line counters, longer
   - `INV-{NNNNNN}` — global six-digit, simpler
   
   Recommend per-business-line: `CONS-INV-2026-0001`, `MATRI-INV-2026-0001`. Phase 1 has only consulting invoicing; the format ships ready for the rest.

3. **Multi-currency Phase 1 scope.** Schema has `currency_code` columns everywhere, plus `exchange_rates`. Do we ship the `exchange_rates` UI + conversion logic in Phase 1, or stub it (USD-only operations, columns reserved)? Recommend stub — every Phase 1 transaction is USD; exchange rate management is a non-trivial Settings page that doesn't earn its place in 6 weeks.

---

## 18. What's missing? What's wrong? What do we do next?

Three flags before Pass 2:

1. **Module count climbed to 12.** I added `files` as its own module (per ADR-0004) and the cross-module shared tables now belong to "shared" rather than a specific module. The architecture doc still says 11 in some places. I'll fix in the source-doc refresh at the end of planning.

2. **Account numbering, invoice numbering, multi-currency scope** in §17. I gave recommendations for all three. Override now, or I lock the recommendations into Pass 2.

3. **Phase 2 modules (`support`, full `marketing`)** are listed at section level only — table inventories without column detail. Pass 2 will ship Drizzle for Phase 1 modules in full. Phase 2/3/4 modules ship Drizzle skeletons (table definitions, no business logic) so migrations don't break when those modules wake up. Confirm this approach.

Reply with answers to §17 and the three flags above, then "go" and Pass 2 (full Drizzle TypeScript code per module) ships next.


---

# PART B — Drizzle TypeScript Code

> The architectural model in PART A is the rationale and structure. This part is the implementation — production-ready Drizzle TypeScript that drops into the repo as the actual schema files.

# CXAllies — Data Model (Pass 2: Drizzle Code)

> Drizzle ORM TypeScript schema files for **CXAllies — Intelligent AI/ERP Solutions**.
> Pass 2 of 2: production-ready code that drops into the repo at `src/modules/{name}/schema.ts` and `src/db/schema.ts`.
> Pass 1 ([`02-data-model.md`](./02-data-model.md)) covered the architectural model with rationale. This document is the implementation.
> Conventions per [`03-conventions.md`](./03-conventions.md) (next artifact).

---

## 0. How this is organized

This document is **one artifact, multiple files**. Each section maps to a file in the repo:

| Section | Repo path |
|---|---|
| §1 Shared primitives | `src/db/shared.ts` |
| §2 Enums catalog | `src/db/enums.ts` |
| §3 `auth` module | `src/modules/auth/schema.ts` |
| §4 `parties` module | `src/modules/parties/schema.ts` |
| §5 `files` module | `src/modules/files/schema.ts` |
| §6 `finance` module | `src/modules/finance/schema.ts` |
| §7 `billing` module | `src/modules/billing/schema.ts` |
| §8 `crm` module (Phase 1 skeleton) | `src/modules/crm/schema.ts` |
| §9 `hr` module (Phase 1 skeleton) | `src/modules/hr/schema.ts` |
| §10 `reporting` module | `src/modules/reporting/schema.ts` |
| §11 `ai` module | `src/modules/ai/schema.ts` |
| §12 Cross-module shared tables | `src/db/shared-tables.ts` |
| §13 Phase 2-4 skeletons | `src/modules/{support,marketing,payroll}/schema.ts` |
| §14 Index file | `src/db/schema.ts` |

Skeletons are minimal — enough to support migrations and FK reservations without committing to detail that will change before those modules ship.

---

## 1. Shared primitives — `src/db/shared.ts`

Reusable column definitions every module imports. Keeps tables consistent and lets us change conventions in one place.

```typescript
// src/db/shared.ts
import { sql } from 'drizzle-orm';
import { uuid, timestamp, char, bigint } from 'drizzle-orm/pg-core';

/**
 * Standard ID column. UUID primary key, defaulted at the database level.
 */
export const id = () =>
  uuid('id').primaryKey().default(sql`gen_random_uuid()`);

/**
 * Multi-tenant scope column. Required on every primary entity.
 * Singleton today (Varahi Group); future SaaS pivot is purely additive.
 */
export const organizationId = () =>
  uuid('organization_id').notNull();

/**
 * Standard timestamps. created_at + updated_at, both defaulted in DB.
 * updated_at trigger lives in a separate migration; not enforced at ORM level.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
};

/**
 * Soft-delete column. NULL = active.
 */
export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

/**
 * Standard set: timestamps + soft delete. Use for most tables.
 */
export const standardLifecycle = {
  ...timestamps,
  ...softDelete,
};

/**
 * Currency code (ISO 4217). Default USD.
 */
export const currencyCode = () =>
  char('currency_code', { length: 3 }).notNull().default('USD');

/**
 * Money column helper. Stores integer cents.
 * Always paired with currencyCode().
 */
export const moneyCents = (name: string) =>
  bigint(name, { mode: 'number' }).notNull();

export const moneyCentsNullable = (name: string) =>
  bigint(name, { mode: 'number' });
```

---

## 2. Enums catalog — `src/db/enums.ts`

All Postgres enums in one file. Drizzle generates `CREATE TYPE` migrations from these.

```typescript
// src/db/enums.ts
import { pgEnum } from 'drizzle-orm/pg-core';

// === parties module ===
export const partyKindEnum = pgEnum('party_kind', ['person', 'organization']);

export const partyRoleEnum = pgEnum('party_role', [
  'vendor',
  'end_client',
  'customer',
  'lead',
  'partner',
  'employee',
  'contractor',
  'supplier',
]);

export const partyRelationshipKindEnum = pgEnum('party_relationship_kind', [
  'works_at',
  'spouse_of',
  'manages',
  'subsidiary_of',
  'partner_of',
  'other',
]);

export const businessLineKindEnum = pgEnum('business_line_kind', [
  'services',
  'subscription',
  'ad_revenue',
  'product',
  'other',
]);

export const addressKindEnum = pgEnum('address_kind', [
  'billing',
  'shipping',
  'home',
  'office',
  'other',
]);

export const customFieldTypeEnum = pgEnum('custom_field_type', [
  'text',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
]);

// === auth module ===
export const oauthProviderEnum = pgEnum('oauth_provider', [
  'google',
  'microsoft',
]);

// === files module ===
export const fileKindEnum = pgEnum('file_kind', ['r2_owned', 'drive_linked']);

// === finance module ===
export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
  'cogs',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'check',
  'ach',
  'wire',
  'card',
  'cash',
  'other',
]);

export const paymentSourceEnum = pgEnum('payment_source', [
  'business_card',
  'personal_card_business_use',
  'personal_cash',
  'business_check',
  'business_ach',
  'vendor_paid',
]);

export const cardOwnershipEnum = pgEnum('card_ownership', [
  'business_owned',
  'personal_with_business_use',
]);

export const cardTypeEnum = pgEnum('card_type', [
  'visa',
  'mastercard',
  'amex',
  'discover',
  'other',
]);

export const taxKindEnum = pgEnum('tax_kind', [
  'federal_income',
  'state_income',
  'self_employment',
  'fica_ss',
  'fica_medicare',
  'medicare_additional',
]);

export const filingStatusEnum = pgEnum('filing_status', [
  'single',
  'married_jointly',
  'married_separately',
  'head_of_household',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'expected',
  'received',
  'failed',
  'refunded',
]);

export const expenseReportStatusEnum = pgEnum('expense_report_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
]);

// === billing module ===
export const projectStatusEnum = pgEnum('project_status', [
  'planned',
  'active',
  'on_hold',
  'completed',
  'canceled',
]);

export const timeEntryStatusEnum = pgEnum('time_entry_status', [
  'draft',
  'submitted',
  'approved',
  'invoiced',
  'rejected',
]);

export const timesheetStatusEnum = pgEnum('timesheet_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'canceled',
]);

export const invoiceLineKindEnum = pgEnum('invoice_line_kind', [
  'time',
  'expense',
  'fixed',
  'discount',
  'tax',
]);

export const billingPeriodEnum = pgEnum('billing_period', [
  'monthly',
  'quarterly',
  'annual',
  'lifetime',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
  'paused',
]);

export const subscriptionEventKindEnum = pgEnum('subscription_event_kind', [
  'created',
  'trial_started',
  'trial_ended',
  'activated',
  'renewed',
  'upgraded',
  'downgraded',
  'paused',
  'resumed',
  'canceled',
  'expired',
  'reactivated',
  'payment_failed',
  'payment_succeeded',
]);

// === crm module ===
export const dealStageKindEnum = pgEnum('deal_stage_kind', [
  'open',
  'won',
  'lost',
]);

export const contractStatusEnum = pgEnum('contract_status', [
  'draft',
  'sent',
  'signed',
  'active',
  'expired',
  'renewed',
  'terminated',
]);

// === hr module ===
export const employeeClassificationEnum = pgEnum('employee_classification', [
  'w2',
  '1099_contractor',
  'owner_employee',
]);

export const employeeStatusEnum = pgEnum('employee_status', [
  'active',
  'on_leave',
  'terminated',
]);

export const payFrequencyEnum = pgEnum('pay_frequency', [
  'weekly',
  'biweekly',
  'semi_monthly',
  'monthly',
]);

export const payRateKindEnum = pgEnum('pay_rate_kind', ['hourly', 'salary']);

// === reporting module ===
export const tileKindEnum = pgEnum('tile_kind', [
  'kpi',
  'line_chart',
  'bar_chart',
  'table',
  'list',
  'project_health',
]);

// === ai module ===
export const aiRunStatusEnum = pgEnum('ai_run_status', [
  'success',
  'error',
  'rate_limited',
]);

export const aiSuggestionStatusEnum = pgEnum('ai_suggestion_status', [
  'pending',
  'accepted',
  'rejected',
  'expired',
]);

// === shared ===
export const auditActionEnum = pgEnum('audit_action', [
  'insert',
  'update',
  'delete',
  'soft_delete',
  'restore',
]);
```

---

## 3. `auth` module — `src/modules/auth/schema.ts`

```typescript
// src/modules/auth/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  inet,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import {
  id,
  organizationId,
  standardLifecycle,
  timestamps,
} from '@/db/shared';
import { oauthProviderEnum } from '@/db/enums';

/**
 * Application users. A user is an authentication principal — distinct from a Party (contact record).
 * A user MAY be linked to a Party (e.g., Venkata is both User and Party); not required.
 */
export const users = pgTable(
  'users',
  {
    id: id(),
    organizationId: organizationId(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    avatarFileId: uuid('avatar_file_id'), // FK to files.id, declared with sql later (cycle avoidance)
    partyId: uuid('party_id'), // FK to parties.id, declared with sql later
    timezone: text('timezone').notNull().default('America/New_York'),
    locale: text('locale').notNull().default('en-US'),
    has2faEnabled: boolean('has_2fa_enabled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...standardLifecycle,
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
    orgIdx: index('users_org_idx').on(t.organizationId),
  })
);

/**
 * DB-backed sessions. Better Auth manages these.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, {
      onDelete: 'cascade',
    }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    tokenUnique: uniqueIndex('auth_sessions_token_unique').on(t.tokenHash),
    userIdx: index('auth_sessions_user_idx').on(t.userId),
  })
);

/**
 * Encrypted OAuth tokens for Drive (Phase 1) and other providers (future).
 * access/refresh tokens are AES-256-GCM encrypted at the application layer.
 */
export const authOauthTokens = pgTable(
  'auth_oauth_tokens',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, {
      onDelete: 'cascade',
    }),
    provider: oauthProviderEnum('provider').notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    scopes: text('scopes').array().notNull(),
    accountEmail: text('account_email').notNull(),
    ...standardLifecycle,
  },
  (t) => ({
    userProviderIdx: index('auth_oauth_user_provider_idx').on(
      t.userId,
      t.provider
    ),
  })
);

/**
 * Seed table. Five system roles defined in Phase 1.
 * No organization_id — roles are global definitions.
 */
export const roles = pgTable('roles', {
  id: text('id').primaryKey(), // 'owner' | 'admin' | 'bookkeeper' | 'sales' | 'support_agent'
  displayName: text('display_name').notNull(),
  description: text('description').notNull(),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

/**
 * User to role assignments. A user can have multiple roles.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, {
      onDelete: 'cascade',
    }),
    roleId: text('role_id').notNull().references(() => roles.id),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  })
);

/**
 * Per-user pinned quick actions for the nav.
 * Supports the "ease of doing things" principle — power users pin frequent actions.
 */
export const userPinnedActions = pgTable(
  'user_pinned_actions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, {
      onDelete: 'cascade',
    }),
    actionKey: text('action_key').notNull(), // e.g., 'log_expense_for_zoox'
    label: text('label').notNull(),
    iconName: text('icon_name'),
    targetUrl: text('target_url').notNull(),
    contextJson: jsonb('context_json').notNull().default(sql`'{}'::jsonb`),
    displayOrder: text('display_order').notNull().default('0'),
    ...standardLifecycle,
  },
  (t) => ({
    userOrderIdx: index('user_pinned_actions_user_order_idx').on(
      t.userId,
      t.displayOrder
    ),
  })
);

// === Type exports for use elsewhere ===
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type AuthOauthToken = typeof authOauthTokens.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type UserPinnedAction = typeof userPinnedActions.$inferSelect;
```

---

## 4. `parties` module — `src/modules/parties/schema.ts`

```typescript
// src/modules/parties/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  char,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import {
  id,
  organizationId,
  standardLifecycle,
  timestamps,
} from '@/db/shared';
import {
  partyKindEnum,
  partyRoleEnum,
  partyRelationshipKindEnum,
  businessLineKindEnum,
  addressKindEnum,
  customFieldTypeEnum,
} from '@/db/enums';
import { users } from '@/modules/auth/schema';

/**
 * Singleton: the Varahi Group LLC row. Future SaaS pivot adds more rows.
 */
export const organizations = pgTable('organizations', {
  id: id(),
  legalName: text('legal_name').notNull(),
  displayName: text('display_name').notNull(),
  ein: text('ein'),
  stateTaxId: text('state_tax_id'),
  homeState: char('home_state', { length: 2 }).notNull().default('NC'),
  defaultCurrency: char('default_currency', { length: 3 })
    .notNull()
    .default('USD'),
  defaultTimezone: text('default_timezone')
    .notNull()
    .default('America/New_York'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  logoFileId: uuid('logo_file_id'),
  ...standardLifecycle,
});

/**
 * A customer-facing identity (CXAllies, Pravara.ai). Roll-up parent for Business Lines.
 */
export const brands = pgTable(
  'brands',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    domain: text('domain'),
    logoFileId: uuid('logo_file_id'),
    description: text('description'),
    ...standardLifecycle,
  },
  (t) => ({
    orgNameIdx: index('brands_org_name_idx').on(t.organizationId, t.name),
  })
);

/**
 * Configurable revenue stream / cost center. Replaces hardcoded enum.
 * Every transactional entity carries a business_line_id.
 */
export const businessLines = pgTable(
  'business_lines',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    brandId: uuid('brand_id').notNull().references(() => brands.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    kind: businessLineKindEnum('kind').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('business_lines_org_slug_unique').on(
      t.organizationId,
      t.slug
    ),
    brandIdx: index('business_lines_brand_idx').on(t.brandId),
  })
);

/**
 * The universal contact record. Person or organization. Spine of the system.
 */
export const parties = pgTable(
  'parties',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    kind: partyKindEnum('kind').notNull(),
    displayName: text('display_name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    title: text('title'),
    legalName: text('legal_name'),
    dba: text('dba'),
    ein: text('ein'),
    industry: text('industry'),
    employerPartyId: uuid('employer_party_id'), // self-FK, declared via raw sql in migration to avoid cycle
    primaryEmail: text('primary_email'),
    primaryPhone: text('primary_phone'),
    website: text('website'),
    notes: text('notes'),
    customFields: jsonb('custom_fields').notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgKindActiveIdx: index('parties_org_kind_active_idx').on(
      t.organizationId,
      t.kind,
      t.deletedAt
    ),
    emailIdx: index('parties_email_idx').on(t.primaryEmail),
    customFieldsGin: index('parties_custom_fields_gin').using(
      'gin',
      t.customFields
    ),
    // Full-text search index added in a follow-up migration via raw SQL
  })
);

/**
 * A Party can hold many roles simultaneously. Junction table.
 */
export const partyRoles = pgTable(
  'party_roles',
  {
    partyId: uuid('party_id').notNull().references(() => parties.id, {
      onDelete: 'cascade',
    }),
    role: partyRoleEnum('role').notNull(),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.partyId, t.role, t.businessLineId],
    }),
    activeIdx: index('party_roles_active_idx').on(t.partyId, t.isActive),
  })
);

/**
 * N:N relationships between parties (works_at, manages, etc.).
 */
export const partyRelationships = pgTable(
  'party_relationships',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    fromPartyId: uuid('from_party_id').notNull().references(() => parties.id, {
      onDelete: 'cascade',
    }),
    toPartyId: uuid('to_party_id').notNull().references(() => parties.id, {
      onDelete: 'cascade',
    }),
    kind: partyRelationshipKindEnum('kind').notNull(),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    fromIdx: index('party_relationships_from_idx').on(t.fromPartyId),
    toIdx: index('party_relationships_to_idx').on(t.toPartyId),
  })
);

/**
 * Polymorphic addresses table. Referenced by parties, organizations, future shipping.
 * Polymorphism not enforced via FK at DB level (entity_table is text).
 */
export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id').notNull(),
    kind: addressKindEnum('kind').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    line1: text('line_1'),
    line2: text('line_2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    formatted: text('formatted').notNull(),
    ...standardLifecycle,
  },
  (t) => ({
    entityIdx: index('addresses_entity_idx').on(
      t.entityTable,
      t.entityId,
      t.isPrimary
    ),
  })
);

/**
 * Tags. Polymorphic via entity_tags junction.
 */
export const tags = pgTable(
  'tags',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    color: text('color'),
    ...standardLifecycle,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('tags_org_slug_unique').on(
      t.organizationId,
      t.slug
    ),
  })
);

export const entityTags = pgTable(
  'entity_tags',
  {
    tagId: uuid('tag_id').notNull().references(() => tags.id, {
      onDelete: 'cascade',
    }),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id').notNull(),
    taggedAt: timestamp('tagged_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    taggedByUserId: uuid('tagged_by_user_id').references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tagId, t.entityTable, t.entityId] }),
    entityIdx: index('entity_tags_entity_idx').on(t.entityTable, t.entityId),
  })
);

/**
 * Custom field definitions. Drives the custom_fields JSONB on parties, deals, tickets.
 */
export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entityTable: text('entity_table').notNull(),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    fieldKey: text('field_key').notNull(),
    fieldLabel: text('field_label').notNull(),
    fieldType: customFieldTypeEnum('field_type').notNull(),
    options: jsonb('options'),
    isRequired: boolean('is_required').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    keyUnique: uniqueIndex('custom_field_def_key_unique').on(
      t.organizationId,
      t.entityTable,
      t.businessLineId,
      t.fieldKey
    ),
  })
);

// === Types ===
export type Organization = typeof organizations.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type BusinessLine = typeof businessLines.$inferSelect;
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type PartyRole = typeof partyRoles.$inferSelect;
export type Tag = typeof tags.$inferSelect;
```

---

## 5. `files` module — `src/modules/files/schema.ts`

```typescript
// src/modules/files/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  bigint,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { id, organizationId, standardLifecycle } from '@/db/shared';
import { fileKindEnum } from '@/db/enums';
import { users, authOauthTokens } from '@/modules/auth/schema';
import { organizations } from '@/modules/parties/schema';

/**
 * Unified file metadata. Per ADR-0004 — R2 for system files, Drive for linked references.
 * Exactly one of (r2_key, drive_file_id) is non-null per row, enforced by CHECK.
 */
export const files = pgTable(
  'files',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    kind: fileKindEnum('kind').notNull(),
    r2Key: text('r2_key'),
    r2Bucket: text('r2_bucket'),
    driveFileId: text('drive_file_id'),
    driveAccountId: uuid('drive_account_id').references(
      () => authOauthTokens.id
    ),
    driveWebViewLink: text('drive_web_view_link'),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id),
    ...standardLifecycle,
  },
  (t) => ({
    orgCreatedIdx: index('files_org_created_idx').on(
      t.organizationId,
      t.createdAt
    ),
    uploaderIdx: index('files_uploader_idx').on(t.uploadedByUserId),
    kindIdx: index('files_kind_idx').on(t.kind),
    backendCheck: check(
      'files_backend_xor',
      sql`(${t.kind} = 'r2_owned' AND ${t.r2Key} IS NOT NULL AND ${t.driveFileId} IS NULL) OR (${t.kind} = 'drive_linked' AND ${t.driveFileId} IS NOT NULL AND ${t.r2Key} IS NULL)`
    ),
  })
);

export type FileRecord = typeof files.$inferSelect;
export type NewFileRecord = typeof files.$inferInsert;
```

---

## 6. `finance` module — `src/modules/finance/schema.ts`

```typescript
// src/modules/finance/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  date,
  boolean,
  integer,
  char,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import {
  id,
  organizationId,
  standardLifecycle,
  timestamps,
  currencyCode,
  moneyCents,
  moneyCentsNullable,
} from '@/db/shared';
import {
  accountTypeEnum,
  paymentMethodEnum,
  paymentSourceEnum,
  paymentStatusEnum,
  cardOwnershipEnum,
  cardTypeEnum,
  taxKindEnum,
  filingStatusEnum,
  expenseReportStatusEnum,
} from '@/db/enums';
import {
  organizations,
  parties,
  businessLines,
} from '@/modules/parties/schema';
import { users } from '@/modules/auth/schema';
import { files } from '@/modules/files/schema';

/**
 * Chart of Accounts. Type-prefixed numeric scheme:
 *   1000-1999 Assets, 2000-2999 Liabilities, 3000-3999 Equity,
 *   4000-4999 Revenue, 5000-5999 Expenses, 6000-6999 COGS.
 */
export const chartOfAccounts = pgTable(
  'finance_chart_of_accounts',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    accountNumber: text('account_number').notNull(),
    accountName: text('account_name').notNull(),
    accountType: accountTypeEnum('account_type').notNull(),
    accountSubtype: text('account_subtype').notNull(),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    parentAccountId: uuid('parent_account_id'),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description'),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('coa_org_number_unique').on(
      t.organizationId,
      t.accountNumber
    ),
    typeIdx: index('coa_type_idx').on(t.accountType, t.isActive),
  })
);

/**
 * Journal entries. Designed-for-double-entry; recorded in single-entry mode in Phase 1.
 * Append-only — no updated_at, no deleted_at. Reversals create new entries.
 */
export const journalEntries = pgTable(
  'finance_journal_entries',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entryDate: date('entry_date').notNull(),
    entryNumber: text('entry_number').notNull(),
    description: text('description').notNull(),
    sourceTable: text('source_table').notNull(),
    sourceId: uuid('source_id').notNull(),
    isReversal: boolean('is_reversal').notNull().default(false),
    reversedJournalEntryId: uuid('reversed_journal_entry_id'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('je_org_number_unique').on(
      t.organizationId,
      t.entryNumber
    ),
    sourceIdx: index('je_source_idx').on(t.sourceTable, t.sourceId),
    dateIdx: index('je_date_idx').on(t.entryDate),
  })
);

/**
 * Journal lines. Append-only.
 * Each line is debit-or-credit (CHECK enforces exclusivity).
 */
export const journalLines = pgTable(
  'finance_journal_lines',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    journalEntryId: uuid('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    chartOfAccountsId: uuid('chart_of_accounts_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    debitCents: bigint('debit_cents', { mode: 'number' }).notNull().default(0),
    creditCents: bigint('credit_cents', { mode: 'number' })
      .notNull()
      .default(0),
    currencyCode: currencyCode(),
    description: text('description'),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    partyId: uuid('party_id').references(() => parties.id),
    lineNumber: integer('line_number').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    entryIdx: index('jl_entry_idx').on(t.journalEntryId),
    accountIdx: index('jl_account_idx').on(t.chartOfAccountsId),
    partyIdx: index('jl_party_idx').on(t.partyId),
    debitOrCredit: check(
      'jl_debit_xor_credit',
      sql`(${t.debitCents} > 0 AND ${t.creditCents} = 0) OR (${t.debitCents} = 0 AND ${t.creditCents} > 0)`
    ),
  })
);

/**
 * Revenue entries. One row per recognized revenue event.
 */
export const revenueEntries = pgTable(
  'finance_revenue_entries',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entryDate: date('entry_date').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    partyId: uuid('party_id').references(() => parties.id),
    chartOfAccountsId: uuid('chart_of_accounts_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    description: text('description').notNull(),
    amountCents: moneyCents('amount_cents'),
    currencyCode: currencyCode(),
    paymentMethod: paymentMethodEnum('payment_method'),
    paymentStatus: paymentStatusEnum('payment_status').notNull(),
    receivedAt: text('received_at'), // timestamp - declared as text to keep this concise; convert in raw SQL migration
    invoiceId: uuid('invoice_id'), // FK declared via migration (cycle: billing depends on finance)
    subscriptionId: uuid('subscription_id'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    orgDateIdx: index('rev_org_date_idx').on(t.organizationId, t.entryDate),
    blIdx: index('rev_bl_idx').on(t.businessLineId, t.entryDate),
    partyIdx: index('rev_party_idx').on(t.partyId),
    statusIdx: index('rev_status_idx').on(t.paymentStatus),
  })
);

/**
 * Expense entries. The most-touched table in Phase 1.
 * Tracks billable (pass-through) and reimbursable (employee-out-of-pocket) flags independently.
 */
export const expenseEntries = pgTable(
  'finance_expense_entries',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entryDate: date('entry_date').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    chartOfAccountsId: uuid('chart_of_accounts_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    payeePartyId: uuid('payee_party_id').references(() => parties.id),
    description: text('description').notNull(),
    amountCents: moneyCents('amount_cents'),
    currencyCode: currencyCode(),
    paymentSource: paymentSourceEnum('payment_source').notNull(),
    corporateCardId: uuid('corporate_card_id'),
    isBillable: boolean('is_billable').notNull().default(false),
    isReimbursable: boolean('is_reimbursable').notNull().default(false),
    projectId: uuid('project_id'), // FK to billing_projects, declared in migration
    expenseReportId: uuid('expense_report_id'),
    invoiceId: uuid('invoice_id'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id),
    receiptFileId: uuid('receipt_file_id').references(() => files.id),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    notes: text('notes'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgDateIdx: index('exp_org_date_idx').on(t.organizationId, t.entryDate),
    blDateIdx: index('exp_bl_date_idx').on(t.businessLineId, t.entryDate),
    projectDateIdx: index('exp_project_date_idx').on(t.projectId, t.entryDate),
    billableUnbilledIdx: index('exp_billable_unbilled_idx')
      .on(t.isBillable, t.invoiceId)
      .where(sql`${t.isBillable} = true AND ${t.invoiceId} IS NULL`),
    reimbursableUnreportedIdx: index('exp_reimb_unreported_idx')
      .on(t.isReimbursable, t.expenseReportId)
      .where(sql`${t.isReimbursable} = true AND ${t.expenseReportId} IS NULL`),
    submitterIdx: index('exp_submitter_idx').on(t.submittedByUserId),
  })
);

/**
 * Expense reports — group expenses for reimbursement.
 * Per kickoff scope: client visit -> trip expenses -> reimburse employee.
 */
export const expenseReports = pgTable(
  'finance_expense_reports',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    reportNumber: text('report_number').notNull(),
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id),
    subjectPartyId: uuid('subject_party_id').references(() => parties.id),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    projectId: uuid('project_id'),
    purpose: text('purpose').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: expenseReportStatusEnum('status').notNull(),
    totalCents: moneyCents('total_cents').default(0),
    submittedAt: text('submitted_at'),
    approvedAt: text('approved_at'),
    reimbursedAt: text('reimbursed_at'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    reimbursedByUserId: uuid('reimbursed_by_user_id').references(() => users.id),
    reimbursementPaymentId: uuid('reimbursement_payment_id'),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('exp_rpt_org_number_unique').on(
      t.organizationId,
      t.reportNumber
    ),
    submitterStatusIdx: index('exp_rpt_submitter_status_idx').on(
      t.submittedByUserId,
      t.status
    ),
    statusIdx: index('exp_rpt_status_idx').on(t.status),
  })
);

/**
 * Corporate cards. Per kickoff scope.
 * Tracks who holds it and whether it's business-owned or personal-with-business-use.
 */
export const corporateCards = pgTable(
  'finance_corporate_cards',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    nickname: text('nickname').notNull(),
    lastFour: char('last_four', { length: 4 }).notNull(),
    cardType: cardTypeEnum('card_type').notNull(),
    ownership: cardOwnershipEnum('ownership').notNull(),
    holderUserId: uuid('holder_user_id').references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    holderIdx: index('cards_holder_idx').on(t.holderUserId),
    activeIdx: index('cards_active_idx').on(t.isActive),
  })
);

/**
 * Tax rate brackets. Owner-configurable as IRS/NC tables update.
 */
export const taxRates = pgTable(
  'finance_tax_rates',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    taxKind: taxKindEnum('tax_kind').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    bracketLowCents: moneyCentsNullable('bracket_low_cents'),
    bracketHighCents: moneyCentsNullable('bracket_high_cents'),
    filingStatus: filingStatusEnum('filing_status'),
    rateBasisPoints: integer('rate_basis_points').notNull(), // 2200 = 22.00%
    stateCode: char('state_code', { length: 2 }),
    ...standardLifecycle,
  },
  (t) => ({
    kindEffectiveIdx: index('tax_rates_kind_eff_idx').on(
      t.taxKind,
      t.effectiveFrom
    ),
  })
);

/**
 * Quarterly tax estimates. Auto-recomputed on revenue/expense events for the period.
 */
export const taxEstimates = pgTable(
  'finance_tax_estimates',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    taxYear: integer('tax_year').notNull(),
    taxQuarter: integer('tax_quarter').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    grossIncomeCents: moneyCents('gross_income_cents').default(0),
    deductibleExpensesCents: moneyCents('deductible_expenses_cents').default(0),
    taxableIncomeCents: moneyCents('taxable_income_cents').default(0),
    federalEstimateCents: moneyCents('federal_estimate_cents').default(0),
    stateEstimateCents: moneyCents('state_estimate_cents').default(0),
    selfEmploymentEstimateCents: moneyCents(
      'self_employment_estimate_cents'
    ).default(0),
    totalEstimateCents: moneyCents('total_estimate_cents').default(0),
    dueDate: date('due_date').notNull(),
    paidAt: text('paid_at'),
    paidAmountCents: moneyCentsNullable('paid_amount_cents'),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    quarterUnique: uniqueIndex('tax_est_quarter_unique').on(
      t.organizationId,
      t.taxYear,
      t.taxQuarter
    ),
  })
);

// === Types ===
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type RevenueEntry = typeof revenueEntries.$inferSelect;
export type ExpenseEntry = typeof expenseEntries.$inferSelect;
export type NewExpenseEntry = typeof expenseEntries.$inferInsert;
export type ExpenseReport = typeof expenseReports.$inferSelect;
export type CorporateCard = typeof corporateCards.$inferSelect;
export type TaxEstimate = typeof taxEstimates.$inferSelect;
```

---

## 7. `billing` module — `src/modules/billing/schema.ts`

```typescript
// src/modules/billing/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  date,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  id,
  organizationId,
  standardLifecycle,
  timestamps,
  currencyCode,
  moneyCents,
  moneyCentsNullable,
} from '@/db/shared';
import {
  projectStatusEnum,
  timeEntryStatusEnum,
  timesheetStatusEnum,
  invoiceStatusEnum,
  invoiceLineKindEnum,
  paymentMethodEnum,
  billingPeriodEnum,
  subscriptionStatusEnum,
  subscriptionEventKindEnum,
} from '@/db/enums';
import {
  organizations,
  parties,
  businessLines,
} from '@/modules/parties/schema';
import { users } from '@/modules/auth/schema';
import { files } from '@/modules/files/schema';

/**
 * Projects. The execution unit of consulting. Linked to a Contract (CRM) when applicable.
 */
export const projects = pgTable(
  'billing_projects',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    projectNumber: text('project_number').notNull(),
    name: text('name').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    contractId: uuid('contract_id'), // FK to crm_contracts, declared via migration
    endClientPartyId: uuid('end_client_party_id').references(() => parties.id),
    vendorPartyId: uuid('vendor_party_id').references(() => parties.id),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: projectStatusEnum('status').notNull(),
    defaultBillableRateCents: moneyCentsNullable('default_billable_rate_cents'),
    currencyCode: currencyCode(),
    budgetHours: numeric('budget_hours', { precision: 10, scale: 2 }),
    description: text('description'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('proj_org_number_unique').on(
      t.organizationId,
      t.projectNumber
    ),
    blStatusIdx: index('proj_bl_status_idx').on(t.businessLineId, t.status),
    endClientIdx: index('proj_end_client_idx').on(t.endClientPartyId),
    contractIdx: index('proj_contract_idx').on(t.contractId),
  })
);

/**
 * Time entries. Daily granularity.
 */
export const timeEntries = pgTable(
  'billing_time_entries',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    projectId: uuid('project_id').notNull().references(() => projects.id),
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id),
    entryDate: date('entry_date').notNull(),
    hours: numeric('hours', { precision: 5, scale: 2 }).notNull(),
    description: text('description').notNull(),
    billableRateCents: moneyCents('billable_rate_cents'),
    currencyCode: currencyCode(),
    status: timeEntryStatusEnum('status').notNull(),
    timesheetId: uuid('timesheet_id'),
    invoiceLineId: uuid('invoice_line_id'),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    projectDateIdx: index('te_project_date_idx').on(t.projectId, t.entryDate),
    submitterDateIdx: index('te_submitter_date_idx').on(
      t.submittedByUserId,
      t.entryDate
    ),
    statusIdx: index('te_status_idx').on(t.status),
    timesheetIdx: index('te_timesheet_idx').on(t.timesheetId),
  })
);

/**
 * Timesheets. Weekly approval workflow record (separate from time_entries data).
 */
export const timesheets = pgTable(
  'billing_timesheets',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id),
    weekStarting: date('week_starting').notNull(),
    status: timesheetStatusEnum('status').notNull(),
    totalHours: numeric('total_hours', { precision: 7, scale: 2 })
      .notNull()
      .default('0'),
    submittedAt: text('submitted_at'),
    approvedAt: text('approved_at'),
    rejectedAt: text('rejected_at'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    rejectionReason: text('rejection_reason'),
    ...standardLifecycle,
  },
  (t) => ({
    weekUnique: uniqueIndex('ts_week_unique').on(
      t.organizationId,
      t.submittedByUserId,
      t.weekStarting
    ),
    statusIdx: index('ts_status_idx').on(t.status),
  })
);

/**
 * Invoices. Number scheme: per-business-line prefix (e.g., CONS-INV-2026-0001).
 */
export const invoices = pgTable(
  'billing_invoices',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    invoiceNumber: text('invoice_number').notNull(),
    billToPartyId: uuid('bill_to_party_id')
      .notNull()
      .references(() => parties.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    projectId: uuid('project_id').references(() => projects.id),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    currencyCode: currencyCode(),
    subtotalCents: moneyCents('subtotal_cents').default(0),
    taxCents: moneyCents('tax_cents').default(0),
    totalCents: moneyCents('total_cents').default(0),
    paidCents: moneyCents('paid_cents').default(0),
    status: invoiceStatusEnum('status').notNull(),
    pdfFileId: uuid('pdf_file_id').references(() => files.id),
    sentAt: text('sent_at'),
    paidAt: text('paid_at'),
    voidedAt: text('voided_at'),
    terms: text('terms'),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('inv_org_number_unique').on(
      t.organizationId,
      t.invoiceNumber
    ),
    statusDueIdx: index('inv_status_due_idx')
      .on(t.status, t.dueDate)
      .where(sql`${t.status} IN ('sent', 'partially_paid')`),
    billToIdx: index('inv_bill_to_idx').on(t.billToPartyId),
    projectIdx: index('inv_project_idx').on(t.projectId),
    blIdx: index('inv_bl_idx').on(t.businessLineId),
  })
);

/**
 * Invoice lines. Time, expense, fixed, discount, tax kinds.
 */
export const invoiceLines = pgTable(
  'billing_invoice_lines',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    description: text('description').notNull(),
    kind: invoiceLineKindEnum('kind').notNull(),
    projectId: uuid('project_id').references(() => projects.id),
    quantity: numeric('quantity', { precision: 10, scale: 2 })
      .notNull()
      .default('1'),
    unitPriceCents: moneyCents('unit_price_cents'),
    amountCents: moneyCents('amount_cents'),
    currencyCode: currencyCode(),
    taxRateBasisPoints: integer('tax_rate_basis_points'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => ({
    invoiceLineIdx: index('il_invoice_line_idx').on(t.invoiceId, t.lineNumber),
    projectIdx: index('il_project_idx').on(t.projectId),
  })
);

/**
 * Payments received.
 */
export const payments = pgTable(
  'billing_payments',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    paymentNumber: text('payment_number').notNull(),
    fromPartyId: uuid('from_party_id').notNull().references(() => parties.id),
    paymentDate: date('payment_date').notNull(),
    amountCents: moneyCents('amount_cents'),
    currencyCode: currencyCode(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    reference: text('reference'),
    notes: text('notes'),
    revenueEntryId: uuid('revenue_entry_id'),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('pay_org_number_unique').on(
      t.organizationId,
      t.paymentNumber
    ),
    fromPartyIdx: index('pay_from_party_idx').on(t.fromPartyId),
    dateIdx: index('pay_date_idx').on(t.paymentDate),
  })
);

/**
 * Payment to invoice applications. A payment can apply across multiple invoices.
 */
export const paymentApplications = pgTable(
  'billing_payment_applications',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
    appliedCents: moneyCents('applied_cents'),
    currencyCode: currencyCode(),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    paymentIdx: index('pa_payment_idx').on(t.paymentId),
    invoiceIdx: index('pa_invoice_idx').on(t.invoiceId),
  })
);

/**
 * Subscription plans. Catalog of recurring offerings.
 */
export const subscriptionPlans = pgTable(
  'billing_subscription_plans',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    priceCents: moneyCents('price_cents'),
    currencyCode: currencyCode(),
    billingPeriod: billingPeriodEnum('billing_period').notNull(),
    trialDays: integer('trial_days').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    features: jsonb('features').notNull().default(sql`'[]'::jsonb`),
    description: text('description'),
    ...standardLifecycle,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('plan_org_slug_unique').on(
      t.organizationId,
      t.slug
    ),
    activeIdx: index('plan_active_idx').on(t.isActive),
  })
);

/**
 * Subscriptions. Each represents one Party's active subscription to one Plan.
 */
export const subscriptions = pgTable(
  'billing_subscriptions',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    subscriberPartyId: uuid('subscriber_party_id')
      .notNull()
      .references(() => parties.id),
    planId: uuid('plan_id').notNull().references(() => subscriptionPlans.id),
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodStart: date('current_period_start').notNull(),
    currentPeriodEnd: date('current_period_end').notNull(),
    trialEndsAt: date('trial_ends_at'),
    startedAt: text('started_at').notNull(),
    canceledAt: text('canceled_at'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end')
      .notNull()
      .default(false),
    autoRenew: boolean('auto_renew').notNull().default(true),
    externalSubscriptionId: text('external_subscription_id'), // Stripe ID, Phase 3
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    subscriberIdx: index('sub_subscriber_idx').on(t.subscriberPartyId),
    statusEndIdx: index('sub_status_end_idx')
      .on(t.status, t.currentPeriodEnd)
      .where(sql`${t.status} IN ('active', 'past_due')`),
    planIdx: index('sub_plan_idx').on(t.planId),
  })
);

/**
 * Subscription event log. Append-only.
 */
export const subscriptionEvents = pgTable(
  'billing_subscription_events',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    eventKind: subscriptionEventKindEnum('event_kind').notNull(),
    fromPlanId: uuid('from_plan_id').references(() => subscriptionPlans.id),
    toPlanId: uuid('to_plan_id').references(() => subscriptionPlans.id),
    triggeredByUserId: uuid('triggered_by_user_id').references(() => users.id),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    subEventIdx: index('subev_sub_idx').on(t.subscriptionId, t.createdAt),
  })
);

// === Types ===
export type Project = typeof projects.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Timesheet = typeof timesheets.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
```

---

## 8. `crm` module — `src/modules/crm/schema.ts`

Phase 1 ships skeleton: `deals`, `dealStages`, `contracts`, `rateCards`, `rateCardLines`. Full pipeline UI in Phase 2.

```typescript
// src/modules/crm/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  date,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  id,
  organizationId,
  standardLifecycle,
  timestamps,
  currencyCode,
  moneyCents,
  moneyCentsNullable,
} from '@/db/shared';
import {
  dealStageKindEnum,
  contractStatusEnum,
} from '@/db/enums';
import {
  organizations,
  parties,
  businessLines,
} from '@/modules/parties/schema';
import { users } from '@/modules/auth/schema';
import { files } from '@/modules/files/schema';

/**
 * Per-business-line stages. A consulting pipeline differs from a matrimony funnel.
 */
export const dealStages = pgTable(
  'crm_deal_stages',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    displayOrder: integer('display_order').notNull(),
    kind: dealStageKindEnum('kind').notNull(),
    defaultProbability: integer('default_probability').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    blSlugUnique: uniqueIndex('ds_bl_slug_unique').on(
      t.organizationId,
      t.businessLineId,
      t.slug
    ),
  })
);

/**
 * Deals (called "Deal" per kickoff decision).
 */
export const deals = pgTable(
  'crm_deals',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    dealNumber: text('deal_number').notNull(),
    name: text('name').notNull(),
    primaryPartyId: uuid('primary_party_id')
      .notNull()
      .references(() => parties.id),
    vendorPartyId: uuid('vendor_party_id').references(() => parties.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    stageId: uuid('stage_id').notNull().references(() => dealStages.id),
    expectedValueCents: moneyCents('expected_value_cents').default(0),
    currencyCode: currencyCode(),
    probability: integer('probability').notNull(),
    expectedCloseDate: date('expected_close_date'),
    closedAt: text('closed_at'),
    closedWonAt: text('closed_won_at'),
    closedLostAt: text('closed_lost_at'),
    lostReason: text('lost_reason'),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
    source: text('source'),
    description: text('description'),
    customFields: jsonb('custom_fields').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('deal_org_number_unique').on(
      t.organizationId,
      t.dealNumber
    ),
    blStageIdx: index('deal_bl_stage_idx').on(t.businessLineId, t.stageId),
    primaryPartyIdx: index('deal_primary_party_idx').on(t.primaryPartyId),
    ownerStageIdx: index('deal_owner_stage_idx').on(t.ownerUserId, t.stageId),
  })
);

/**
 * Contracts. Govern Projects (in billing module).
 */
export const contracts = pgTable(
  'crm_contracts',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    contractNumber: text('contract_number').notNull(),
    name: text('name').notNull(),
    dealId: uuid('deal_id').references(() => deals.id),
    endClientPartyId: uuid('end_client_party_id')
      .notNull()
      .references(() => parties.id),
    vendorPartyId: uuid('vendor_party_id').references(() => parties.id),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    rateCardId: uuid('rate_card_id'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: contractStatusEnum('status').notNull(),
    signedAt: text('signed_at'),
    terminatedAt: text('terminated_at'),
    autoRenews: boolean('auto_renews').notNull().default(false),
    renewalNoticeDays: integer('renewal_notice_days'),
    signedPdfFileId: uuid('signed_pdf_file_id').references(() => files.id),
    totalValueCents: moneyCentsNullable('total_value_cents'),
    currencyCode: currencyCode(),
    terms: text('terms'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('con_org_number_unique').on(
      t.organizationId,
      t.contractNumber
    ),
    endClientStatusIdx: index('con_end_client_status_idx').on(
      t.endClientPartyId,
      t.status
    ),
    blEndDateIdx: index('con_bl_end_date_idx').on(t.businessLineId, t.endDate),
    statusEndIdx: index('con_status_end_idx')
      .on(t.status, t.endDate)
      .where(sql`${t.status} IN ('active', 'signed')`),
  })
);

/**
 * Rate cards. Versioned. Phase 1 supports basic referencing; advanced versioning Phase 2.
 */
export const rateCards = pgTable(
  'crm_rate_cards',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: text('name').notNull(),
    businessLineId: uuid('business_line_id')
      .notNull()
      .references(() => businessLines.id),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    currencyCode: currencyCode(),
    version: integer('version').notNull().default(1),
    notes: text('notes'),
    ...standardLifecycle,
  },
  (t) => ({
    blEffectiveIdx: index('rc_bl_effective_idx').on(
      t.businessLineId,
      t.effectiveFrom
    ),
  })
);

export const rateCardLines = pgTable(
  'crm_rate_card_lines',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    rateCardId: uuid('rate_card_id')
      .notNull()
      .references(() => rateCards.id, { onDelete: 'cascade' }),
    roleName: text('role_name').notNull(),
    seniority: text('seniority'),
    hourlyRateCents: moneyCents('hourly_rate_cents'),
    dailyRateCents: moneyCentsNullable('daily_rate_cents'),
    notes: text('notes'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => ({
    rateCardIdx: index('rcl_card_idx').on(t.rateCardId),
  })
);

// === Types ===
export type Deal = typeof deals.$inferSelect;
export type DealStage = typeof dealStages.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type RateCard = typeof rateCards.$inferSelect;
```

---

## 9. `hr` module — `src/modules/hr/schema.ts`

Phase 1 ships `hrEmployees` only. PTO, documents, reviews are Phase 4.

```typescript
// src/modules/hr/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  date,
  integer,
  char,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  id,
  organizationId,
  standardLifecycle,
  currencyCode,
  moneyCents,
  moneyCentsNullable,
} from '@/db/shared';
import {
  employeeClassificationEnum,
  employeeStatusEnum,
  payFrequencyEnum,
  payRateKindEnum,
  filingStatusEnum,
} from '@/db/enums';
import {
  organizations,
  parties,
} from '@/modules/parties/schema';
import { users } from '@/modules/auth/schema';

/**
 * Employee record. Linked to a Person-Party. Phase 1: just enough for Payroll to FK.
 */
export const employees = pgTable(
  'hr_employees',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    partyId: uuid('party_id').notNull().references(() => parties.id),
    userId: uuid('user_id').references(() => users.id),
    employeeNumber: text('employee_number').notNull(),
    classification: employeeClassificationEnum('classification').notNull(),
    hireDate: date('hire_date'),
    terminationDate: date('termination_date'),
    status: employeeStatusEnum('status').notNull(),
    payFrequency: payFrequencyEnum('pay_frequency').notNull(),
    defaultPayRateCents: moneyCentsNullable('default_pay_rate_cents'),
    payRateKind: payRateKindEnum('pay_rate_kind').notNull(),
    currencyCode: currencyCode(),
    federalFilingStatus: filingStatusEnum('federal_filing_status'),
    federalAllowances: integer('federal_allowances'),
    stateCode: char('state_code', { length: 2 }).notNull().default('NC'),
    stateAllowances: integer('state_allowances'),
    additionalWithholdingCents: moneyCents(
      'additional_withholding_cents'
    ).default(0),
    bankAccountLastFour: char('bank_account_last_four', { length: 4 }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgNumberUnique: uniqueIndex('emp_org_number_unique').on(
      t.organizationId,
      t.employeeNumber
    ),
    partyIdx: index('emp_party_idx').on(t.partyId),
    statusIdx: index('emp_status_idx').on(t.status),
  })
);

export type Employee = typeof employees.$inferSelect;
```

---

## 10. `reporting` module — `src/modules/reporting/schema.ts`

Per the simplification cut: `reporting_rollups` is deferred to Phase 4. Phase 1 ships dashboard primitives only.

```typescript
// src/modules/reporting/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { id, organizationId, standardLifecycle } from '@/db/shared';
import { tileKindEnum } from '@/db/enums';
import { organizations } from '@/modules/parties/schema';
import { users } from '@/modules/auth/schema';

/**
 * Dashboards. A user has a default dashboard; can create others.
 */
export const dashboards = pgTable(
  'reporting_dashboards',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    isDefault: boolean('is_default').notNull().default(false),
    layout: jsonb('layout').notNull().default(sql`'[]'::jsonb`),
    ...standardLifecycle,
  },
  (t) => ({
    orgSlugUnique: uniqueIndex('dash_org_slug_unique').on(
      t.organizationId,
      t.slug
    ),
    ownerIdx: index('dash_owner_idx').on(t.ownerUserId),
  })
);

/**
 * Tiles within a dashboard.
 */
export const dashboardTiles = pgTable(
  'reporting_dashboard_tiles',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    tileKind: tileKindEnum('tile_kind').notNull(),
    dataSource: text('data_source').notNull(),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    displayOrder: integer('display_order').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    dashOrderIdx: index('tile_dash_order_idx').on(
      t.dashboardId,
      t.displayOrder
    ),
  })
);

export type Dashboard = typeof dashboards.$inferSelect;
export type DashboardTile = typeof dashboardTiles.$inferSelect;
```

---

## 11. `ai` module — `src/modules/ai/schema.ts`

Per ADR-0003. `pgvector` extension required.

```typescript
// src/modules/ai/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core'; // requires pgvector extension
import {
  id,
  organizationId,
  timestamps,
  moneyCents,
} from '@/db/shared';
import { aiRunStatusEnum, aiSuggestionStatusEnum } from '@/db/enums';
import { organizations } from '@/modules/parties/schema';
import { users } from '@/modules/auth/schema';

/**
 * AI runs. Every LLM call. Append-only.
 */
export const aiRuns = pgTable(
  'ai_runs',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    feature: text('feature').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    completion: text('completion'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    costCents: moneyCents('cost_cents').default(0),
    latencyMs: integer('latency_ms'),
    triggeredByUserId: uuid('triggered_by_user_id').references(() => users.id),
    triggeredByEvent: text('triggered_by_event'),
    status: aiRunStatusEnum('status').notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    featureCreatedIdx: index('ai_run_feature_created_idx').on(
      t.feature,
      t.createdAt
    ),
    orgCreatedIdx: index('ai_run_org_created_idx').on(
      t.organizationId,
      t.createdAt
    ),
  })
);

/**
 * AI suggestions. Tied to entities. Lifecycle: pending -> accepted | rejected | expired.
 */
export const aiSuggestions = pgTable(
  'ai_suggestions',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    aiRunId: uuid('ai_run_id').notNull().references(() => aiRuns.id),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id').notNull(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    status: aiSuggestionStatusEnum('status').notNull().default('pending'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => ({
    entityStatusIdx: index('ai_sug_entity_status_idx').on(
      t.entityTable,
      t.entityId,
      t.status
    ),
    orgStatusCreatedIdx: index('ai_sug_org_status_created_idx').on(
      t.organizationId,
      t.status,
      t.createdAt
    ),
  })
);

/**
 * Vector embeddings. Powered by pgvector.
 */
export const aiEmbeddings = pgTable(
  'ai_embeddings',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    model: text('model').notNull(),
    sourceText: text('source_text'),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    entityIdx: index('ai_emb_entity_idx').on(t.entityTable, t.entityId),
    orgModelIdx: index('ai_emb_org_model_idx').on(t.organizationId, t.model),
    // HNSW index added via raw SQL migration:
    //   CREATE INDEX ai_emb_hnsw ON ai_embeddings USING hnsw (embedding vector_cosine_ops);
  })
);

/**
 * Per-module budget caps. UI-hidden behind "Advanced Settings" by default.
 */
export const aiBudgets = pgTable(
  'ai_budgets',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    module: text('module').notNull(),
    dailyCapCents: moneyCents('daily_cap_cents').default(200),
    monthlyCapCents: moneyCents('monthly_cap_cents').default(5000),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => ({
    orgModuleUnique: uniqueIndex('ai_budget_org_module_unique').on(
      t.organizationId,
      t.module
    ),
  })
);

export type AiRun = typeof aiRuns.$inferSelect;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type NewAiSuggestion = typeof aiSuggestions.$inferInsert;
export type AiEmbedding = typeof aiEmbeddings.$inferSelect;
export type AiBudget = typeof aiBudgets.$inferSelect;
```

---

## 12. Cross-module shared tables — `src/db/shared-tables.ts`

`activities` and `audit_log` belong to no module. They live in the shared layer.

```typescript
// src/db/shared-tables.ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  inet,
  date,
  numeric,
  index,
  uniqueIndex,
  char,
} from 'drizzle-orm/pg-core';
import { id, organizationId, timestamps } from '@/db/shared';
import { auditActionEnum } from '@/db/enums';
import { organizations, parties, businessLines } from '@/modules/parties/schema';
import { users } from '@/modules/auth/schema';

/**
 * Unified activity timeline. Per ADR-0001 — exempt from module ownership.
 * The Customer 360 view is SELECT * FROM activities WHERE party_id = ? ORDER BY occurred_at DESC.
 */
export const activities = pgTable(
  'activities',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    partyId: uuid('party_id').references(() => parties.id),
    kind: text('kind').notNull(),
    entityTable: text('entity_table'),
    entityId: uuid('entity_id'),
    businessLineId: uuid('business_line_id').references(() => businessLines.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    summary: text('summary').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    partyOccurredIdx: index('act_party_occurred_idx').on(
      t.partyId,
      t.occurredAt
    ),
    entityOccurredIdx: index('act_entity_occurred_idx').on(
      t.entityTable,
      t.entityId,
      t.occurredAt
    ),
    blOccurredIdx: index('act_bl_occurred_idx').on(
      t.businessLineId,
      t.occurredAt
    ),
    orgOccurredIdx: index('act_org_occurred_idx').on(
      t.organizationId,
      t.occurredAt
    ),
  })
);

/**
 * Append-only audit log. Every mutation writes here.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: auditActionEnum('action').notNull(),
    tableName: text('table_name').notNull(),
    recordId: uuid('record_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    requestId: uuid('request_id'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => ({
    tableRecordIdx: index('audit_table_record_idx').on(
      t.tableName,
      t.recordId,
      t.occurredAt
    ),
    actorIdx: index('audit_actor_idx').on(t.actorUserId, t.occurredAt),
    orgIdx: index('audit_org_idx').on(t.organizationId, t.occurredAt),
  })
);

/**
 * Exchange rates. Phase 1 stores USD-only operations; columns reserved for future.
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    fromCurrency: char('from_currency', { length: 3 }).notNull(),
    toCurrency: char('to_currency', { length: 3 }).notNull(),
    rateDate: date('rate_date').notNull(),
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    source: text('source').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    pairDateUnique: uniqueIndex('xr_pair_date_unique').on(
      t.organizationId,
      t.fromCurrency,
      t.toCurrency,
      t.rateDate
    ),
  })
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
```

---

## 13. Phase 2-4 module skeletons

Minimum schema to support migrations and FK reservations. Full schema covered when those modules ship.

### 13.1 `support` (Phase 2) — `src/modules/support/schema.ts`

```typescript
// src/modules/support/schema.ts
// PHASE 2 SKELETON. Full schema in support module's Phase 2 spec.
// This file exists to reserve table namespaces and prevent migration conflicts.

import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, organizationId, standardLifecycle } from '@/db/shared';
import { organizations } from '@/modules/parties/schema';

export const supportTickets = pgTable('support_tickets', {
  id: id(),
  organizationId: organizationId().references(() => organizations.id),
  ticketNumber: text('ticket_number').notNull(),
  subject: text('subject').notNull(),
  // ... Phase 2 fills this out
  ...standardLifecycle,
});

// Other support tables (messages, canned_responses, kb_articles, kb_categories, sla_policies)
// will be added when Phase 2 begins.
```

### 13.2 `marketing` (Phase 3) — `src/modules/marketing/schema.ts`

```typescript
// src/modules/marketing/schema.ts
// PHASE 3 SKELETON. Tables to be defined when Phase 3 begins.
// Empty file by design — listed in the schema index but exports nothing.

export {};
```

### 13.3 `payroll` (Phase 4) — `src/modules/payroll/schema.ts`

```typescript
// src/modules/payroll/schema.ts
// PHASE 4 SKELETON. Tables to be defined when Phase 4 begins.

export {};
```

---

## 14. Schema index — `src/db/schema.ts`

Re-exports the union of all module schemas for Drizzle's relational queries.

```typescript
// src/db/schema.ts
// Single source of truth for Drizzle's schema-aware features.
// Every table from every module is re-exported here.

export * from './shared-tables';

export * from '@/modules/auth/schema';
export * from '@/modules/parties/schema';
export * from '@/modules/files/schema';
export * from '@/modules/finance/schema';
export * from '@/modules/billing/schema';
export * from '@/modules/crm/schema';
export * from '@/modules/hr/schema';
export * from '@/modules/reporting/schema';
export * from '@/modules/ai/schema';

// Phase 2-4 skeletons (re-exported as they come online):
// export * from '@/modules/support/schema';
// export * from '@/modules/marketing/schema';
// export * from '@/modules/payroll/schema';
```

---

## 15. Required raw SQL migrations

Drizzle-kit generates most migrations automatically. These need manual SQL:

### 15.1 Enable pgvector extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 15.2 HNSW index for embeddings

```sql
CREATE INDEX ai_emb_hnsw ON ai_embeddings
USING hnsw (embedding vector_cosine_ops);
```

### 15.3 Full-text search on parties

```sql
ALTER TABLE parties
ADD COLUMN search_tsv tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(display_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(primary_email, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(notes, '')), 'C')
) STORED;

CREATE INDEX parties_search_gin ON parties USING gin(search_tsv);
```

### 15.4 Trigger for updated_at

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied per-table via Drizzle's migration tooling
-- Example:
CREATE TRIGGER parties_updated_at
BEFORE UPDATE ON parties
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
-- (repeat for every table with updated_at column)
```

### 15.5 Cross-module circular FKs (declared after both tables exist)

```sql
ALTER TABLE billing_projects
ADD CONSTRAINT proj_contract_fk
FOREIGN KEY (contract_id) REFERENCES crm_contracts(id);

ALTER TABLE finance_revenue_entries
ADD CONSTRAINT rev_invoice_fk
FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id);

ALTER TABLE finance_revenue_entries
ADD CONSTRAINT rev_subscription_fk
FOREIGN KEY (subscription_id) REFERENCES billing_subscriptions(id);

ALTER TABLE finance_expense_entries
ADD CONSTRAINT exp_project_fk
FOREIGN KEY (project_id) REFERENCES billing_projects(id);

ALTER TABLE finance_expense_entries
ADD CONSTRAINT exp_invoice_fk
FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id);

ALTER TABLE finance_expense_entries
ADD CONSTRAINT exp_report_fk
FOREIGN KEY (expense_report_id) REFERENCES finance_expense_reports(id);

ALTER TABLE finance_expense_entries
ADD CONSTRAINT exp_card_fk
FOREIGN KEY (corporate_card_id) REFERENCES finance_corporate_cards(id);

ALTER TABLE finance_expense_reports
ADD CONSTRAINT exp_rpt_project_fk
FOREIGN KEY (project_id) REFERENCES billing_projects(id);

ALTER TABLE finance_expense_reports
ADD CONSTRAINT exp_rpt_payment_fk
FOREIGN KEY (reimbursement_payment_id) REFERENCES finance_revenue_entries(id);

ALTER TABLE billing_payments
ADD CONSTRAINT pay_revenue_fk
FOREIGN KEY (revenue_entry_id) REFERENCES finance_revenue_entries(id);

ALTER TABLE billing_time_entries
ADD CONSTRAINT te_timesheet_fk
FOREIGN KEY (timesheet_id) REFERENCES billing_timesheets(id);

ALTER TABLE billing_time_entries
ADD CONSTRAINT te_invoice_line_fk
FOREIGN KEY (invoice_line_id) REFERENCES billing_invoice_lines(id);

ALTER TABLE crm_contracts
ADD CONSTRAINT con_rate_card_fk
FOREIGN KEY (rate_card_id) REFERENCES crm_rate_cards(id);

ALTER TABLE finance_chart_of_accounts
ADD CONSTRAINT coa_parent_fk
FOREIGN KEY (parent_account_id) REFERENCES finance_chart_of_accounts(id);

ALTER TABLE finance_journal_entries
ADD CONSTRAINT je_reversed_fk
FOREIGN KEY (reversed_journal_entry_id) REFERENCES finance_journal_entries(id);

ALTER TABLE parties
ADD CONSTRAINT party_employer_fk
FOREIGN KEY (employer_party_id) REFERENCES parties(id);

ALTER TABLE users
ADD CONSTRAINT user_party_fk
FOREIGN KEY (party_id) REFERENCES parties(id);

ALTER TABLE users
ADD CONSTRAINT user_avatar_fk
FOREIGN KEY (avatar_file_id) REFERENCES files(id);

ALTER TABLE organizations
ADD CONSTRAINT org_logo_fk
FOREIGN KEY (logo_file_id) REFERENCES files(id);

ALTER TABLE brands
ADD CONSTRAINT brand_logo_fk
FOREIGN KEY (logo_file_id) REFERENCES files(id);
```

These are declared in the migration that creates the second table of each pair, after both exist.

---

## 16. Migration order

The order matters for FK declarations:

1. Enable extensions (`uuid-ossp`, `pgvector`)
2. Create all enums
3. Create `organizations` (no dependencies)
4. Create `auth` tables (`users`, `auth_sessions`, `auth_oauth_tokens`, `roles`, `user_roles`, `user_pinned_actions`)
5. Create `files`
6. Create remaining `parties` tables (`brands`, `business_lines`, `parties`, `party_roles`, `party_relationships`, `addresses`, `tags`, `entity_tags`, `custom_field_definitions`)
7. Create `finance` tables
8. Create `crm` tables
9. Create `billing` tables
10. Create `hr` tables
11. Create `reporting` tables
12. Create `ai` tables
13. Create shared tables (`activities`, `audit_log`, `exchange_rates`)
14. Create Phase 2-4 skeletons
15. Add cross-module circular FKs (per §15.5)
16. Add full-text search columns and triggers (per §15.3, §15.4)
17. Add HNSW vector index (per §15.2)
18. Seed data (organizations row, business_lines, brands, roles, chart_of_accounts, deal_stages, tax_rates)

This is roughly 8–10 migration files when generated by `drizzle-kit`.

---

## 17. What was cut from Pass 1

Per the design-center conversation:

| Cut | Why | When it returns |
|---|---|---|
| `memberships` table | Over-engineered for $300K–$5M target. Subscription with `billing_period = 'lifetime'` covers the only real Phase 1 case. | Phase 5 if proven need |
| `reporting_rollups` table | Premature optimization. Direct indexed queries are sub-500ms at our scale. | Phase 4 with custom report builder |
| Per-suggestion AI budget UI | "Advanced Settings" by default. Users get AI help without configuration. | Phase 2 polish if power users want it |

Net: ~10% smaller schema, simpler conceptual surface, faster Phase 1.

---

## 18. What's missing? What's wrong? What do we do next?

Three flags before we move to conventions:

1. **The `reimbursementPaymentId` modeling on `expense_reports`** — I FK'd it to `finance_revenue_entries` (counterintuitive: from Varahi's books, reimbursing an employee is an expense, not revenue). The model treats employee-side as the implicit Party and stores the outflow as the negative of a revenue. Better alternatives: (a) make it a payment record, (b) skip the FK and track in `journal_entries` only. I'd revisit this in implementation; flagging now so it doesn't ossify.

2. **The `vector` import** in §11 (`drizzle-orm/pg-core`) requires Drizzle ≥ 0.30 with pgvector support. Confirm the pinned Drizzle version supports this when we set up the repo, or use `customType` as a fallback.

3. **The cross-module FK list in §15.5 is long (~20 FKs).** Some of these I deferred to migrations because of import cycles in TypeScript (e.g., `billing_projects.contract_id → crm_contracts.id` while `crm_contracts.deal_id → crm_deals.id`). All are correct architecturally; the ergonomic cost is that adding a new FK between modules requires an extra migration step. Documented in conventions.

Reply or "go" and I produce `docs/03-conventions.md` (artifact #8 of 9) next.
