-- updated_at triggers for finance tables that carry updated_at.
-- set_updated_at() function was created in 0004.
-- journal_lines is append-only (no updated_at) and is intentionally excluded.

CREATE TRIGGER finance_chart_of_accounts_updated_at
  BEFORE UPDATE ON "finance_chart_of_accounts"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_journal_entries_updated_at
  BEFORE UPDATE ON "finance_journal_entries"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_revenue_entries_updated_at
  BEFORE UPDATE ON "finance_revenue_entries"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_expense_entries_updated_at
  BEFORE UPDATE ON "finance_expense_entries"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_expense_reports_updated_at
  BEFORE UPDATE ON "finance_expense_reports"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_corporate_cards_updated_at
  BEFORE UPDATE ON "finance_corporate_cards"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_tax_estimates_updated_at
  BEFORE UPDATE ON "finance_tax_estimates"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_tax_rates_updated_at
  BEFORE UPDATE ON "finance_tax_rates"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_currencies_updated_at
  BEFORE UPDATE ON "finance_currencies"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_timezones_updated_at
  BEFORE UPDATE ON "finance_timezones"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_chart_of_accounts_templates_updated_at
  BEFORE UPDATE ON "finance_chart_of_accounts_templates"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER finance_chart_of_accounts_template_lines_updated_at
  BEFORE UPDATE ON "finance_chart_of_accounts_template_lines"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
