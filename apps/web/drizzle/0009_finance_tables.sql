CREATE TABLE "finance_chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"account_subtype" text NOT NULL,
	"business_line_id" uuid,
	"parent_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_chart_of_accounts_template_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"account_subtype" text NOT NULL,
	"parent_account_number" text,
	"description" text,
	"suggested_business_line_match" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_chart_of_accounts_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_persona" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_corporate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"last_four" char(4) NOT NULL,
	"card_type" "card_type" NOT NULL,
	"ownership" "card_ownership" NOT NULL,
	"holder_user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimal_digits" integer DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_expense_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"business_line_id" uuid NOT NULL,
	"chart_of_accounts_id" uuid NOT NULL,
	"payee_party_id" uuid,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"payment_source" "payment_source" NOT NULL,
	"corporate_card_id" uuid,
	"is_billable" boolean DEFAULT false NOT NULL,
	"is_reimbursable" boolean DEFAULT false NOT NULL,
	"project_id" uuid,
	"expense_report_id" uuid,
	"invoice_id" uuid,
	"submitted_by_user_id" uuid,
	"receipt_file_id" uuid,
	"journal_entry_id" uuid,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_expense_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"report_number" text NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"subject_party_id" uuid,
	"business_line_id" uuid,
	"project_id" uuid,
	"purpose" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "expense_report_status" NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"reimbursed_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"reimbursed_by_user_id" uuid,
	"reimbursement_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"entry_number" text NOT NULL,
	"description" text NOT NULL,
	"source_table" text NOT NULL,
	"source_id" uuid NOT NULL,
	"is_reversal" boolean DEFAULT false NOT NULL,
	"reversed_journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"chart_of_accounts_id" uuid NOT NULL,
	"debit_cents" bigint DEFAULT 0 NOT NULL,
	"credit_cents" bigint DEFAULT 0 NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"description" text,
	"business_line_id" uuid,
	"party_id" uuid,
	"line_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jl_debit_xor_credit" CHECK (("finance_journal_lines"."debit_cents" > 0 AND "finance_journal_lines"."credit_cents" = 0) OR ("finance_journal_lines"."debit_cents" = 0 AND "finance_journal_lines"."credit_cents" > 0))
);
--> statement-breakpoint
CREATE TABLE "finance_revenue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"business_line_id" uuid NOT NULL,
	"party_id" uuid,
	"chart_of_accounts_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"payment_method" "payment_method",
	"payment_status" "payment_status" NOT NULL,
	"received_at" timestamp with time zone,
	"invoice_id" uuid,
	"subscription_id" uuid,
	"journal_entry_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_tax_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tax_year" integer NOT NULL,
	"tax_quarter" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"gross_income_cents" bigint DEFAULT 0 NOT NULL,
	"deductible_expenses_cents" bigint DEFAULT 0 NOT NULL,
	"taxable_income_cents" bigint DEFAULT 0 NOT NULL,
	"federal_estimate_cents" bigint DEFAULT 0 NOT NULL,
	"state_estimate_cents" bigint DEFAULT 0 NOT NULL,
	"self_employment_estimate_cents" bigint DEFAULT 0 NOT NULL,
	"total_estimate_cents" bigint DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_amount_cents" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"tax_kind" "tax_kind" NOT NULL,
	"effective_year" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"bracket_low_cents" bigint,
	"bracket_high_cents" bigint,
	"filing_status" "filing_status",
	"rate_basis_points" integer NOT NULL,
	"state_code" char(2),
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_timezones" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"utc_offset_text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_filing_status" "filing_status";--> statement-breakpoint
ALTER TABLE "finance_chart_of_accounts" ADD CONSTRAINT "finance_chart_of_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_chart_of_accounts" ADD CONSTRAINT "finance_chart_of_accounts_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_chart_of_accounts_template_lines" ADD CONSTRAINT "finance_chart_of_accounts_template_lines_template_id_finance_chart_of_accounts_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."finance_chart_of_accounts_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_corporate_cards" ADD CONSTRAINT "finance_corporate_cards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_corporate_cards" ADD CONSTRAINT "finance_corporate_cards_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_entries" ADD CONSTRAINT "finance_expense_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_entries" ADD CONSTRAINT "finance_expense_entries_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_entries" ADD CONSTRAINT "finance_expense_entries_chart_of_accounts_id_finance_chart_of_accounts_id_fk" FOREIGN KEY ("chart_of_accounts_id") REFERENCES "public"."finance_chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_entries" ADD CONSTRAINT "finance_expense_entries_payee_party_id_parties_id_fk" FOREIGN KEY ("payee_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_entries" ADD CONSTRAINT "finance_expense_entries_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_entries" ADD CONSTRAINT "finance_expense_entries_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_entries" ADD CONSTRAINT "finance_expense_entries_journal_entry_id_finance_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."finance_journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_reports" ADD CONSTRAINT "finance_expense_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_reports" ADD CONSTRAINT "finance_expense_reports_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_reports" ADD CONSTRAINT "finance_expense_reports_subject_party_id_parties_id_fk" FOREIGN KEY ("subject_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_reports" ADD CONSTRAINT "finance_expense_reports_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_reports" ADD CONSTRAINT "finance_expense_reports_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_expense_reports" ADD CONSTRAINT "finance_expense_reports_reimbursed_by_user_id_users_id_fk" FOREIGN KEY ("reimbursed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_journal_entries" ADD CONSTRAINT "finance_journal_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_journal_entry_id_finance_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."finance_journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_chart_of_accounts_id_finance_chart_of_accounts_id_fk" FOREIGN KEY ("chart_of_accounts_id") REFERENCES "public"."finance_chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_revenue_entries" ADD CONSTRAINT "finance_revenue_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_revenue_entries" ADD CONSTRAINT "finance_revenue_entries_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_revenue_entries" ADD CONSTRAINT "finance_revenue_entries_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_revenue_entries" ADD CONSTRAINT "finance_revenue_entries_chart_of_accounts_id_finance_chart_of_accounts_id_fk" FOREIGN KEY ("chart_of_accounts_id") REFERENCES "public"."finance_chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_revenue_entries" ADD CONSTRAINT "finance_revenue_entries_journal_entry_id_finance_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."finance_journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_tax_estimates" ADD CONSTRAINT "finance_tax_estimates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coa_org_number_unique" ON "finance_chart_of_accounts" USING btree ("organization_id","account_number");--> statement-breakpoint
CREATE INDEX "coa_type_idx" ON "finance_chart_of_accounts" USING btree ("account_type","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "coa_template_lines_template_account_unique" ON "finance_chart_of_accounts_template_lines" USING btree ("template_id","account_number");--> statement-breakpoint
CREATE INDEX "coa_template_lines_template_order_idx" ON "finance_chart_of_accounts_template_lines" USING btree ("template_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "coa_templates_slug_unique" ON "finance_chart_of_accounts_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cards_holder_idx" ON "finance_corporate_cards" USING btree ("holder_user_id");--> statement-breakpoint
CREATE INDEX "cards_active_idx" ON "finance_corporate_cards" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "exp_org_date_idx" ON "finance_expense_entries" USING btree ("organization_id","entry_date");--> statement-breakpoint
CREATE INDEX "exp_bl_date_idx" ON "finance_expense_entries" USING btree ("business_line_id","entry_date");--> statement-breakpoint
CREATE INDEX "exp_project_date_idx" ON "finance_expense_entries" USING btree ("project_id","entry_date");--> statement-breakpoint
CREATE INDEX "exp_billable_unbilled_idx" ON "finance_expense_entries" USING btree ("is_billable","invoice_id") WHERE "finance_expense_entries"."is_billable" = true AND "finance_expense_entries"."invoice_id" IS NULL;--> statement-breakpoint
CREATE INDEX "exp_reimb_unreported_idx" ON "finance_expense_entries" USING btree ("is_reimbursable","expense_report_id") WHERE "finance_expense_entries"."is_reimbursable" = true AND "finance_expense_entries"."expense_report_id" IS NULL;--> statement-breakpoint
CREATE INDEX "exp_submitter_idx" ON "finance_expense_entries" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exp_rpt_org_number_unique" ON "finance_expense_reports" USING btree ("organization_id","report_number");--> statement-breakpoint
CREATE INDEX "exp_rpt_submitter_status_idx" ON "finance_expense_reports" USING btree ("submitted_by_user_id","status");--> statement-breakpoint
CREATE INDEX "exp_rpt_status_idx" ON "finance_expense_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "je_org_number_unique" ON "finance_journal_entries" USING btree ("organization_id","entry_number");--> statement-breakpoint
CREATE INDEX "je_source_idx" ON "finance_journal_entries" USING btree ("source_table","source_id");--> statement-breakpoint
CREATE INDEX "je_date_idx" ON "finance_journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "jl_entry_idx" ON "finance_journal_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "jl_account_idx" ON "finance_journal_lines" USING btree ("chart_of_accounts_id");--> statement-breakpoint
CREATE INDEX "jl_party_idx" ON "finance_journal_lines" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "rev_org_date_idx" ON "finance_revenue_entries" USING btree ("organization_id","entry_date");--> statement-breakpoint
CREATE INDEX "rev_bl_idx" ON "finance_revenue_entries" USING btree ("business_line_id","entry_date");--> statement-breakpoint
CREATE INDEX "rev_party_idx" ON "finance_revenue_entries" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "rev_status_idx" ON "finance_revenue_entries" USING btree ("payment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_est_quarter_unique" ON "finance_tax_estimates" USING btree ("organization_id","tax_year","tax_quarter");--> statement-breakpoint
CREATE INDEX "tax_rates_kind_eff_idx" ON "finance_tax_rates" USING btree ("tax_kind","effective_from");--> statement-breakpoint
CREATE INDEX "tax_rates_year_jurisdiction_idx" ON "finance_tax_rates" USING btree ("effective_year","jurisdiction");