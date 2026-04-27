-- P1-09: Employee Reimbursements Payable account.
--
-- Adds account 2300 (system_role='employee_payable') so the expense-report
-- approval and reimbursement journal helpers can resolve the debit/credit
-- account via findSystemAccount(tx, orgId, 'employee_payable').
--
-- Idempotent: safe to re-run.
--   - Pass 1 inserts 2300 for any org that lacks it.
--   - Pass 2 tags 2300 with 'employee_payable' if the row exists with NULL role
--     (handles case where a tenant pre-created a 2300 account by hand).
--
-- New tenants pick up the same account via the multi-line-operator template
-- (07-coa-templates.ts now carries the 2300 line with systemRole tagged).

INSERT INTO finance_chart_of_accounts (
  organization_id,
  account_number,
  account_name,
  account_type,
  account_subtype,
  is_active,
  system_role
)
SELECT
  o.id,
  '2300',
  'Employee Reimbursements Payable',
  'liability',
  'current_liability',
  true,
  'employee_payable'
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM finance_chart_of_accounts c
  WHERE c.organization_id = o.id
    AND c.account_number = '2300'
);
--> statement-breakpoint

UPDATE finance_chart_of_accounts
SET system_role = 'employee_payable'
WHERE account_number = '2300'
  AND system_role IS NULL;
