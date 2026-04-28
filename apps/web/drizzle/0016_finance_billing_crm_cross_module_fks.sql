-- P1-11: Cross-module FK constraints — finance ↔ billing ↔ crm.
--
-- Per ADR-0001 §3.2: cross-module FKs are declared as plain uuid columns in
-- module schema files (to avoid TS module-load-time circular imports between
-- module schema files) and added via hand-written migrations after the
-- target tables exist.
--
-- The originally-planned 0016 (intra-module forward refs) turned out
-- unnecessary — drizzle-kit handled all the intra-billing and intra-crm
-- circular references natively via .references() lazy callbacks in 0015.
-- This file folds in what would have been 0017.
--
-- Idempotency: ALTER TABLE ADD CONSTRAINT fails on re-run because the named
-- constraint already exists. Migrations are not re-run by drizzle's migrator
-- (hash-based dedup), so this is fine. If you need to re-apply for any
-- reason, drop the constraints first.

--
-- 1. The 5 deferred finance → billing FKs from P1-06 (see comments in
--    0010_finance_intra_module_fks.sql).
--

ALTER TABLE "finance_revenue_entries"
  ADD CONSTRAINT "rev_invoice_fk"
  FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id");
--> statement-breakpoint

ALTER TABLE "finance_revenue_entries"
  ADD CONSTRAINT "rev_subscription_fk"
  FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id");
--> statement-breakpoint

ALTER TABLE "finance_expense_entries"
  ADD CONSTRAINT "exp_project_fk"
  FOREIGN KEY ("project_id") REFERENCES "billing_projects"("id");
--> statement-breakpoint

ALTER TABLE "finance_expense_entries"
  ADD CONSTRAINT "exp_invoice_fk"
  FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id");
--> statement-breakpoint

ALTER TABLE "finance_expense_reports"
  ADD CONSTRAINT "exp_rpt_project_fk"
  FOREIGN KEY ("project_id") REFERENCES "billing_projects"("id");
--> statement-breakpoint

--
-- 2. billing → crm (project's governing contract).
--

ALTER TABLE "billing_projects"
  ADD CONSTRAINT "projects_contract_fk"
  FOREIGN KEY ("contract_id") REFERENCES "crm_contracts"("id");
--> statement-breakpoint

--
-- 3. billing → finance (payments → revenue_entries link).
--    Per data-model §5.6: the data-model author flagged this modeling as
--    suspect — payment-as-revenue conflates payor/payee accounting roles.
--    Phase 1 keeps the column nullable; Phase 2+ may redesign as a
--    payment_revenue_link join table.
--

ALTER TABLE "billing_payments"
  ADD CONSTRAINT "payments_revenue_entry_fk"
  FOREIGN KEY ("revenue_entry_id") REFERENCES "finance_revenue_entries"("id");
