-- Intra-finance FKs that couldn't be expressed as Drizzle .references() calls
-- without forward-reference issues (target table declared after the source) or
-- self-references that Drizzle handles awkwardly.
--
-- Cross-module FKs to billing tables (revenue_entries.invoice_id,
-- revenue_entries.subscription_id, expense_entries.project_id,
-- expense_entries.invoice_id, expense_reports.project_id) are deferred to P1-08
-- because billing tables don't exist yet.

ALTER TABLE "finance_chart_of_accounts"
  ADD CONSTRAINT "coa_parent_fk"
  FOREIGN KEY ("parent_account_id") REFERENCES "finance_chart_of_accounts"("id");

ALTER TABLE "finance_journal_entries"
  ADD CONSTRAINT "je_reversed_fk"
  FOREIGN KEY ("reversed_journal_entry_id") REFERENCES "finance_journal_entries"("id");

ALTER TABLE "finance_expense_entries"
  ADD CONSTRAINT "exp_card_fk"
  FOREIGN KEY ("corporate_card_id") REFERENCES "finance_corporate_cards"("id");

ALTER TABLE "finance_expense_entries"
  ADD CONSTRAINT "exp_report_fk"
  FOREIGN KEY ("expense_report_id") REFERENCES "finance_expense_reports"("id");

ALTER TABLE "finance_expense_reports"
  ADD CONSTRAINT "exp_rpt_payment_fk"
  FOREIGN KEY ("reimbursement_payment_id") REFERENCES "finance_revenue_entries"("id");
