ALTER TABLE "finance_chart_of_accounts" ADD COLUMN "system_role" text;--> statement-breakpoint
ALTER TABLE "finance_chart_of_accounts_template_lines" ADD COLUMN "system_role" text;--> statement-breakpoint
CREATE UNIQUE INDEX "coa_org_system_role_unique" ON "finance_chart_of_accounts" USING btree ("organization_id","system_role") WHERE "finance_chart_of_accounts"."system_role" IS NOT NULL;