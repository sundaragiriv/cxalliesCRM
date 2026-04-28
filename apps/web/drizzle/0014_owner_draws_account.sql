-- P1-10: Owner Draws system_role tag.
--
-- Tags account 3200 with 'owner_draws' so postTaxPaymentJournal can resolve
-- the debit account via findSystemAccount(tx, orgId, 'owner_draws').
--
-- Idempotent: safe to re-run.
--   - Pass 1 inserts 3200 for any org that lacks it (defensive — should always
--     be present from the multi-line-operator template, but mirror 0013's shape).
--   - Pass 2 tags 3200 with 'owner_draws' if the row exists with NULL role.
--
-- New tenants pick this up via 07-coa-templates.ts (3200 line now carries
-- systemRole: 'owner_draws').

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
  '3200',
  'Owner Draws',
  'equity',
  'equity',
  true,
  'owner_draws'
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM finance_chart_of_accounts c
  WHERE c.organization_id = o.id
    AND c.account_number = '3200'
);
--> statement-breakpoint

UPDATE finance_chart_of_accounts
SET system_role = 'owner_draws'
WHERE account_number = '3200'
  AND system_role IS NULL;
