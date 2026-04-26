# CXAllies — Glossary

> Locked vocabulary for CXAllies — Intelligent System. Every other planning artifact, schema column, ADR, and ticket uses these terms with these meanings.
> When a term has a precise database representation, that table or column is named.
> Last updated: planning Step 3, artifact 1 of 9.

---

## How to read this glossary

- **Bold term** = the canonical word. Use it everywhere.
- *Italic synonyms* = words you may hear in the wild that mean the same thing. Do **not** use them in code, schemas, UI labels, or docs.
- `code_name` = the actual table or column name in Postgres.
- "See also" = related entries.

---

## Section 1 — Organization & Identity

### Varahi Group
The legal entity. Single LLC owned by Venkata and Poornima Sundaragiri, Cary, NC. Files US federal + NC state taxes. Owns all brands and business lines. Not a tenant — there is exactly one Varahi Group in the system. Stored in `organization` table as the singleton row (single-tenant assumption; multi-tenant is a future ADR).

### CXAllies — Intelligent System
The product being built. *Synonyms (do not use):* Pravara ERP, the ERP, the platform, the system. In UI strings and docs use "CXAllies" or "CXAllies — Intelligent System."

### Brand
A customer-facing identity owned by Varahi Group. CXAllies is one brand. Pravara.ai is another. A brand has its own logo, domain, and may map to a Business Line, but is conceptually separate (a brand can have zero or many business lines under it). Stored in `brands`.

### Business Line
A revenue stream and cost center within Varahi Group. Configurable, not enumerated in code. Examples today: SAP/AI Consulting, Pravara.ai Matrimony, Websites Portfolio, YouTube Channel. **Every transactional entity (revenue, expense, invoice, ticket, deal, campaign) carries a `business_line_id`.** Stored in `business_lines`. *Forbidden synonyms in code:* "vertical," "division," "channel" (channel means something else — see below).

---

## Section 2 — People & Companies

### Party
The universal contact record. One row in `parties` for every human or organization the system knows about, regardless of role. *Forbidden synonyms:* contact, person, lead, customer, vendor — those are **roles** a party plays, not separate tables. A party may be a `person` or an `organization` (kind column).

### Party Role
A typed relationship a party has with Varahi Group. A single party can hold multiple roles simultaneously (a Vendor today can become an End Client tomorrow). Stored in `party_roles` as one row per (party, role) pair. Roles available:

| Role | Meaning |
|---|---|
| **Vendor** | A party Varahi subcontracts *through*. Pays Varahi. Example: Apex Systems, Magnit. |
| **End Client** | The actual company Varahi's consulting work serves. May not pay Varahi directly. Example: Zoox, Yaskawa. |
| **Customer** | A party who buys from Varahi directly. Example: a Pravara.ai subscriber, a CXAllies SaaS customer (future). |
| **Lead** | A party who has expressed interest but has not yet bought. Promotes to Customer or End Client when a Deal closes. |
| **Partner** | A referral source, affiliate, or alliance partner. |
| **Employee** | Venkata and Poornima today. W-2 employees of Varahi Group. |
| **Contractor** | A 1099 party Varahi pays. |
| **Supplier** | A party Varahi buys from (hosting, software, office supplies). Distinct from Vendor — Vendor is a billing intermediary, Supplier is a cost. |

### Person
A party of kind = `person`. Has first name, last name, optional title, optional employer (FK to an organization party). Stored on `parties.kind = 'person'`.

### Organization
A party of kind = `organization`. Has legal name, optional EIN, optional industry. May have many person-parties associated with it via `party_relationships`. Stored on `parties.kind = 'organization'`. *Forbidden synonyms:* company, account, firm. In UI we may say "Company" because users expect it; in schema and code we say `organization`.

### Account
**Reserved for accounting only** — see Chart of Accounts. Never used for "company" in CXAllies. CRM tools that say "Account" are wrong for our domain. A finance Account is a CoA line; a sales "account" is an Organization-party.

---

## Section 3 — Finance & Accounting

### Chart of Accounts (CoA)
The list of all accounting buckets used to categorize money movement. Stored in `chart_of_accounts`. Each row has account number, name, type (Revenue, Expense, Asset, Liability, Equity), business_line_id (nullable — some accounts are organization-wide), and is_active flag. Designed for double-entry from day one even though Phase 1 records single entries.

### Journal Entry
A single accounting fact. In double-entry mode, a journal entry has two or more `journal_lines`, each with a `chart_of_accounts_id`, a debit_cents value, and a credit_cents value. The sum of debits equals the sum of credits. In Phase 1 the system writes journal entries automatically from revenue and expense events. Stored in `journal_entries` + `journal_lines`.

### Revenue
Money coming in. Stored in `revenue_entries`. Each row has date, business_line_id, party_id (who paid), chart_of_accounts_id, amount_cents, currency_code, optional invoice_id, payment_status, and a corresponding `journal_entry_id`.

### Expense
Money going out. Stored in `expense_entries`. Each row has date, business_line_id, chart_of_accounts_id, party_id (payee — usually a Supplier), amount_cents, currency_code, payment_method, billable flag, reimbursed flag, optional `receipt_file_id`, and `journal_entry_id`.

### Billable
A flag on an expense indicating Varahi will pass it through to an End Client on the next Invoice. *Synonym to avoid:* reimbursable. **Billable** = "the client will pay us back via invoice." **Reimbursable** = "an employee paid out of pocket and Varahi will pay them back." A single expense row can be both.

### Invoice
A bill issued by Varahi to a Vendor or End Client. Generated from approved Timesheets and billable Expenses. Stored in `invoices` with `invoice_lines`. Has a status: Draft → Sent → Partially Paid → Paid → Overdue → Void. Numbering scheme TBD in data-model artifact.

### Payment
A receipt of money against an Invoice or a standalone revenue entry. Stored in `payments`. Multiple payments may apply to one invoice (partial payments).

### Tax Estimate
A computed quarterly tax obligation. Federal income, NC state income, self-employment. Stored in `tax_estimates`, one row per quarter. Rates configurable in `tax_rates`. Recomputed on every revenue or expense event affecting the quarter.

### 1099 Threshold
The IRS rule that any Contractor paid >\$600 in a calendar year requires a 1099-NEC. The system tracks Contractor-role parties' YTD payments and surfaces a 1099 list at year-end.

---

## Section 4 — Time & Billing

### Time Entry
A single record of work performed. Daily granularity. Stored in `time_entries`. Has date, party_id (the End Client or Vendor for the work), project_id, hours, billable_rate_cents, business_line_id (almost always Consulting), and a status: draft, submitted, approved, invoiced.

### Timesheet
A weekly aggregation of time entries. **Not a separate table.** Computed view over `time_entries` filtered by week. The weekly approval status is stored on `timesheets` (one row per (party, week_starting) with status: draft, submitted, approved, rejected).

### Project
A unit of consulting work tied to one End Client and optionally one Vendor. Stored in `projects`. Has name, start_date, end_date, default billable_rate_cents, and budget_hours.

### Invoiceable
A time entry or expense in state `approved` that has not yet been attached to an Invoice. The "Generate Invoice" workflow pulls invoiceable rows for a (party, period) and creates invoice_lines from them.

---

## Section 5 — CRM

### Deal
A potential or in-progress sale. Stored in `deals`. Has primary_party_id (the buyer), business_line_id, stage, expected_value_cents, expected_close_date, owner_user_id, and a JSONB `custom_fields` blob (consulting deals need different fields than matrimony users). *Forbidden synonyms:* opportunity, pipeline-item.

### Pipeline
The set of stages a Deal moves through. Configurable per Business Line. Stored in `deal_stages` with (business_line_id, stage_order, name). A consulting pipeline might be: Lead → Qualified → Proposal → Negotiation → Won/Lost. A matrimony pipeline is irrelevant — those go through subscription, not deals.

### Activity
**The most important entity in the system.** Any event tied to a Party. Polymorphic — an activity can reference any other entity (invoice, deal, ticket, payment, expense, email, note, call). Stored in `activities` with columns: party_id, kind (enum), entity_table, entity_id, occurred_at, summary, metadata JSONB, user_id (who logged it). The Customer 360 timeline is `SELECT * FROM activities WHERE party_id = ? ORDER BY occurred_at DESC`.

### Note
A free-text observation logged against a Party or any entity. Stored as an Activity with kind=`note`.

### Tag
A flexible label applied to a Party, Deal, or other entity. Stored in `tags` + `entity_tags`. *Forbidden synonyms:* label, category. **Category** is reserved for Chart-of-Accounts terminology.

---

## Section 6 — Support / Service

### Ticket
An inbound request for help. Stored in `tickets`. Has number, subject, status (Open, Pending, Solved, Closed), priority, channel (email, web form, internal), assigned_user_id, requester_party_id, business_line_id, and an SLA target. *Forbidden synonyms:* case, issue (issue is reserved for GitHub-style internal work tracking, not used in CXAllies).

### Conversation
The thread of messages on a Ticket. Stored in `ticket_messages`, ordered by `occurred_at`.

### Channel
The medium through which a Ticket arrived. Email, web form, internal note, future: social DM. **Not** a synonym for Business Line.

### Canned Response
A reusable reply template. Stored in `canned_responses`. Has placeholders for party name, ticket subject, etc.

### Knowledge Base (KB)
A library of articles. Internal KB (private to staff) and Public KB (customer-facing) live in the same `kb_articles` table with a `visibility` enum.

### SLA
Service Level Agreement. A target response or resolution time per ticket priority. Stored in `sla_policies`.

---

## Section 7 — Marketing & Communications

### Campaign
A coordinated outbound effort. Stored in `campaigns`. Has name, business_line_id, channel (email, social, paid), status (Draft, Scheduled, Running, Completed), start_at, end_at.

### Sequence
A multi-step automated message series triggered by an event. Stored in `sequences` + `sequence_steps`. A Lead enters a Sequence; the system schedules each Step at a delay; Activities log each send.

### Segment
A saved query that defines a set of Parties matching criteria. Stored in `segments` with a JSONB `definition`. Used to target Campaigns and Sequences.

### Lead Form
An embeddable HTML form on cxallies.com or Pravara.ai. Stored in `lead_forms`. Submissions create or update a Party with role=Lead and log an Activity.

### UTM
The five url parameters (utm_source, utm_medium, utm_campaign, utm_term, utm_content) captured on Lead Form submissions and stored on the resulting Activity for attribution.

### Promotion
A discount code or offer. Stored in `promotions`. Has code, discount type (percent, fixed_cents), expiration, max_redemptions, business_line_id.

---

## Section 8 — Shipping & Fulfillment

### Order
A request to fulfill physical goods. Stored in `orders`. Has order_number, customer party_id, status, total_cents.

### Shipment
The physical delivery against an Order. Stored in `shipments`. Has carrier, tracking_number, ship_date, delivered_at.

### Address
A postal address. Stored in `addresses` and referenced from parties, shipments, orders.

---

## Section 9 — Payroll

### Pay Period
A fixed window for which payroll is calculated. Stored in `pay_periods`. Has start_date, end_date, pay_date, status (Draft, Approved, Paid).

### Pay Run
The execution of payroll for a Pay Period. One Pay Run produces one Pay Stub per active Employee. Stored in `pay_runs` + `pay_stubs`.

### Pay Stub
The per-employee output of a Pay Run. Stored in `pay_stubs`. Has gross_cents, federal_withholding_cents, state_withholding_cents, fica_cents, medicare_cents, additional_medicare_cents, net_cents, plus a JSONB `breakdown` for audit.

### Owner Draw
A withdrawal of profit by Venkata or Poornima as owners (separate from payroll wages). Stored in `owner_draws`. Even though both spouses are W-2 employees, owner draws are a separate flow from wages.

### Self-Employment Tax
Computed in `tax_estimates`, not on pay stubs. Applies to net earnings from self-employment (rare for W-2 owner-employees but kept for completeness — e.g., 1099 side income).

---

## Section 10 — Reporting

### Dashboard
A configured layout of Tiles. Stored in `dashboards` + `dashboard_tiles`. Each user has a default dashboard; users can create others.

### Tile
A single visualization on a Dashboard. Stored in `dashboard_tiles`. Has tile_kind (KPI, line_chart, bar_chart, table), data_source (a saved query reference), config JSONB.

### KPI
A single numeric metric with optional trend (e.g., MRR, AR aging, ticket SLA breach rate). Computed via a registered query. Tile kind = `kpi`.

### Cohort
A group of Parties bucketed by a shared start event (signup month, first invoice month). Used for retention reports.

---

## Section 11 — Cross-Cutting

### Soft Delete
Every primary entity has a `deleted_at TIMESTAMPTZ NULL` column. Setting it is the only delete operation in CRUD. List queries filter `WHERE deleted_at IS NULL` by default. Hard deletes are reserved for compliance-driven purges (DSAR) and are administrative scripts only.

### Audit Trail
Every mutation writes a row to `audit_log` with user_id, occurred_at, table_name, record_id, action (insert/update/delete), and a JSONB `before_after` diff. Audit log is append-only — no soft delete, no update.

### AI Suggestion
A recommendation produced by the AI module for any entity. Stored in `ai_suggestions`. Has entity_table, entity_id, kind (categorize_expense, draft_reply, classify_lead, summarize_ticket, etc.), payload JSONB, status (pending, accepted, rejected, expired), produced_by_run_id.

### AI Run
A single LLM invocation. Stored in `ai_runs`. Has model, prompt_tokens, completion_tokens, cost_cents, latency_ms, triggered_by_user_id, triggered_by_event. Every AI Suggestion links to the AI Run that produced it. This makes cost attribution and audit trivial.

### User
A person who logs into CXAllies. Distinct from Party — a User is an authentication principal; a Party is a contact record. A User may also be a Party (Venkata is both), linked via `users.party_id`. Stored in `users`. Roles managed via `user_roles` per Section 12.

### Currency Code
ISO 4217 three-letter code. Stored as `currency_code CHAR(3)` on every monetary table. Default 'USD'. An `exchange_rates` table holds (date, from_code, to_code, rate). Multi-currency display is Phase 3+; columns ship now.

---

## Section 12 — Authorization

### Role
A named permission bundle assigned to a User. Five roles defined for Phase 1, even though only Venkata uses the system at launch:

| Role | Meaning |
|---|---|
| **Owner** | Full access to everything. Venkata. Cannot be deleted. |
| **Admin** | Full access except billing/settings/destructive ops. |
| **Bookkeeper** | Finance + Billing read/write; CRM/Support read-only; no Settings. |
| **Sales** | CRM + Marketing read/write; Finance read-only on own deals. |
| **Support Agent** | Support + KB read/write; CRM read-only; no Finance. |

Stored in `roles` (seed table) + `user_roles` (FK pair). Permissions checked at the tRPC procedure layer via middleware. Phase 2 adds custom permissions overrides; Phase 1 hardcodes the five role policies.

---

## Section 13 — Forbidden Words (use these instead)

| Don't use | Use this | Why |
|---|---|---|
| Customer (in a non-CRM context) | Party | Customer is a role, not a record. |
| Account (for a company) | Organization | Account = Chart of Accounts entry. |
| Company | Organization | Same — pick one word, stick to it. |
| Client | End Client (for consulting), or Customer (for direct buyers) | "Client" is ambiguous. |
| Opportunity | Deal | One word, less syllables. |
| Case / Issue | Ticket | "Issue" is for GitHub-style internal work. |
| Vertical / Division | Business Line | Locked. |
| Reimbursable (when meaning Billable) | Billable | They are different. See Section 3. |
| Pravara ERP | CXAllies — Intelligent System | The product was renamed. |
| User (when meaning Party) | Party | User = login principal. Party = contact record. |
| Tenant | Varahi Group / Organization (singleton) | We are single-tenant. |

---

## What's missing? What's wrong? What do we do next?

Three places I had to guess and you should sanity-check:

1. **Brand vs Business Line distinction.** I made Brand a parent of Business Line ("CXAllies brand may contain CXAllies-the-product business line and CXAllies-consulting business line in future"). If you'd rather collapse Brand into Business Line for simplicity in Phase 1, say so and I'll remove the `brands` table from the data model.
2. **Supplier vs Vendor distinction.** I split them: Vendor = billing intermediary (Apex pays you), Supplier = cost (AWS, Postmark bill you). If your mental model treats both as "Vendor," I'll collapse the role to one and use a flag.
3. **Owner Draw mechanics.** Both you and Poornima are W-2 employees, but owners can also take draws as profit distributions. I kept both flows. If the LLC files as an S-Corp election (which would be normal for owner-employee setups), some of this changes — confirm whether you file Schedule C or 1120-S so I don't mis-model the equity side.

Reply with corrections or "go" and I produce artifact #2 (`docs/01-architecture.md`) next.
