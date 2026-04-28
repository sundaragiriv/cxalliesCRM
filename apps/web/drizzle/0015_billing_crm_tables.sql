CREATE TABLE "billing_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"kind" "invoice_line_kind" NOT NULL,
	"project_id" uuid,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"tax_rate_basis_points" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"bill_to_party_id" uuid NOT NULL,
	"business_line_id" uuid NOT NULL,
	"project_id" uuid,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"period_start" date,
	"period_end" date,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"paid_cents" bigint DEFAULT 0 NOT NULL,
	"status" "invoice_status" NOT NULL,
	"pdf_file_id" uuid,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"terms" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"member_party_id" uuid NOT NULL,
	"business_line_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"subscription_id" uuid,
	"granted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_payment_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"applied_cents" bigint NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_number" text NOT NULL,
	"from_party_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"reference" text,
	"notes" text,
	"revenue_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_number" text NOT NULL,
	"name" text NOT NULL,
	"business_line_id" uuid NOT NULL,
	"contract_id" uuid,
	"end_client_party_id" uuid,
	"vendor_party_id" uuid,
	"start_date" date,
	"end_date" date,
	"status" "project_status" NOT NULL,
	"default_billable_rate_cents" bigint,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"budget_hours" numeric(10, 2),
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event_kind" "subscription_event_kind" NOT NULL,
	"from_plan_id" uuid,
	"to_plan_id" uuid,
	"triggered_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"business_line_id" uuid NOT NULL,
	"price_cents" bigint NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"billing_period" "billing_period" NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscriber_party_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_start" date NOT NULL,
	"current_period_end" date NOT NULL,
	"trial_ends_at" date,
	"started_at" timestamp with time zone NOT NULL,
	"canceled_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"external_subscription_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"description" text NOT NULL,
	"billable_rate_cents" bigint NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"status" time_entry_status NOT NULL,
	"timesheet_id" uuid,
	"invoice_line_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_timesheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"week_starting" date NOT NULL,
	"status" timesheet_status NOT NULL,
	"total_hours" numeric(7, 2) DEFAULT '0' NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_number" text NOT NULL,
	"name" text NOT NULL,
	"deal_id" uuid,
	"end_client_party_id" uuid NOT NULL,
	"vendor_party_id" uuid,
	"business_line_id" uuid NOT NULL,
	"rate_card_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "contract_status" NOT NULL,
	"signed_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"auto_renews" boolean DEFAULT false NOT NULL,
	"renewal_notice_days" integer,
	"signed_pdf_file_id" uuid,
	"total_value_cents" bigint,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"terms" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_deal_stage_template_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"kind" "deal_stage_kind" NOT NULL,
	"default_probability" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_deal_stage_templates" (
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
CREATE TABLE "crm_deal_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_line_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"display_order" integer NOT NULL,
	"kind" "deal_stage_kind" NOT NULL,
	"default_probability" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"deal_number" text NOT NULL,
	"name" text NOT NULL,
	"primary_party_id" uuid NOT NULL,
	"vendor_party_id" uuid,
	"business_line_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"expected_value_cents" bigint DEFAULT 0 NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"probability" integer NOT NULL,
	"expected_close_date" date,
	"closed_at" timestamp with time zone,
	"closed_won_at" timestamp with time zone,
	"closed_lost_at" timestamp with time zone,
	"lost_reason" text,
	"owner_user_id" uuid NOT NULL,
	"source" text,
	"description" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_rate_card_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rate_card_id" uuid NOT NULL,
	"role_name" text NOT NULL,
	"seniority" text,
	"hourly_rate_cents" bigint NOT NULL,
	"daily_rate_cents" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"business_line_id" uuid NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_invoice_id_billing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."billing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_project_id_billing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."billing_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_bill_to_party_id_parties_id_fk" FOREIGN KEY ("bill_to_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_project_id_billing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."billing_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_memberships" ADD CONSTRAINT "billing_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_memberships" ADD CONSTRAINT "billing_memberships_member_party_id_parties_id_fk" FOREIGN KEY ("member_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_memberships" ADD CONSTRAINT "billing_memberships_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_memberships" ADD CONSTRAINT "billing_memberships_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_applications" ADD CONSTRAINT "billing_payment_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_applications" ADD CONSTRAINT "billing_payment_applications_payment_id_billing_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."billing_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_applications" ADD CONSTRAINT "billing_payment_applications_invoice_id_billing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."billing_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_from_party_id_parties_id_fk" FOREIGN KEY ("from_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_projects" ADD CONSTRAINT "billing_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_projects" ADD CONSTRAINT "billing_projects_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_projects" ADD CONSTRAINT "billing_projects_end_client_party_id_parties_id_fk" FOREIGN KEY ("end_client_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_projects" ADD CONSTRAINT "billing_projects_vendor_party_id_parties_id_fk" FOREIGN KEY ("vendor_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription_events" ADD CONSTRAINT "billing_subscription_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription_events" ADD CONSTRAINT "billing_subscription_events_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription_events" ADD CONSTRAINT "billing_subscription_events_from_plan_id_billing_subscription_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "public"."billing_subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription_events" ADD CONSTRAINT "billing_subscription_events_to_plan_id_billing_subscription_plans_id_fk" FOREIGN KEY ("to_plan_id") REFERENCES "public"."billing_subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription_events" ADD CONSTRAINT "billing_subscription_events_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription_plans" ADD CONSTRAINT "billing_subscription_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription_plans" ADD CONSTRAINT "billing_subscription_plans_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_subscriber_party_id_parties_id_fk" FOREIGN KEY ("subscriber_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_plan_id_billing_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_time_entries" ADD CONSTRAINT "billing_time_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_time_entries" ADD CONSTRAINT "billing_time_entries_project_id_billing_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."billing_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_time_entries" ADD CONSTRAINT "billing_time_entries_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_time_entries" ADD CONSTRAINT "billing_time_entries_timesheet_id_billing_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."billing_timesheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_time_entries" ADD CONSTRAINT "billing_time_entries_invoice_line_id_billing_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."billing_invoice_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_timesheets" ADD CONSTRAINT "billing_timesheets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_timesheets" ADD CONSTRAINT "billing_timesheets_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_timesheets" ADD CONSTRAINT "billing_timesheets_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_end_client_party_id_parties_id_fk" FOREIGN KEY ("end_client_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_vendor_party_id_parties_id_fk" FOREIGN KEY ("vendor_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_rate_card_id_crm_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."crm_rate_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contracts" ADD CONSTRAINT "crm_contracts_signed_pdf_file_id_files_id_fk" FOREIGN KEY ("signed_pdf_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_template_lines" ADD CONSTRAINT "crm_deal_stage_template_lines_template_id_crm_deal_stage_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."crm_deal_stage_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stages" ADD CONSTRAINT "crm_deal_stages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stages" ADD CONSTRAINT "crm_deal_stages_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_primary_party_id_parties_id_fk" FOREIGN KEY ("primary_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_vendor_party_id_parties_id_fk" FOREIGN KEY ("vendor_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_id_crm_deal_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_deal_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_rate_card_lines" ADD CONSTRAINT "crm_rate_card_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_rate_card_lines" ADD CONSTRAINT "crm_rate_card_lines_rate_card_id_crm_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."crm_rate_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_rate_cards" ADD CONSTRAINT "crm_rate_cards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_rate_cards" ADD CONSTRAINT "crm_rate_cards_business_line_id_business_lines_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inv_lines_invoice_line_unique" ON "billing_invoice_lines" USING btree ("invoice_id","line_number");--> statement-breakpoint
CREATE INDEX "inv_lines_project_idx" ON "billing_invoice_lines" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_unique" ON "billing_invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_billto_status_idx" ON "billing_invoices" USING btree ("bill_to_party_id","status");--> statement-breakpoint
CREATE INDEX "invoices_bl_status_idx" ON "billing_invoices" USING btree ("business_line_id","status");--> statement-breakpoint
CREATE INDEX "invoices_due_idx" ON "billing_invoices" USING btree ("due_date","status");--> statement-breakpoint
CREATE INDEX "mem_member_idx" ON "billing_memberships" USING btree ("member_party_id");--> statement-breakpoint
CREATE INDEX "mem_bl_tier_idx" ON "billing_memberships" USING btree ("business_line_id","tier");--> statement-breakpoint
CREATE INDEX "pay_app_payment_idx" ON "billing_payment_applications" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "pay_app_invoice_idx" ON "billing_payment_applications" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_org_number_unique" ON "billing_payments" USING btree ("organization_id","payment_number");--> statement-breakpoint
CREATE INDEX "payments_from_party_idx" ON "billing_payments" USING btree ("from_party_id","payment_date");--> statement-breakpoint
CREATE INDEX "payments_date_idx" ON "billing_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_number_unique" ON "billing_projects" USING btree ("organization_id","project_number");--> statement-breakpoint
CREATE INDEX "projects_bl_status_idx" ON "billing_projects" USING btree ("business_line_id","status");--> statement-breakpoint
CREATE INDEX "projects_end_client_idx" ON "billing_projects" USING btree ("end_client_party_id","status");--> statement-breakpoint
CREATE INDEX "projects_contract_idx" ON "billing_projects" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "sub_events_subscription_idx" ON "billing_subscription_events" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_plans_org_slug_unique" ON "billing_subscription_plans" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "sub_plans_bl_idx" ON "billing_subscription_plans" USING btree ("business_line_id","is_active");--> statement-breakpoint
CREATE INDEX "sub_subscriber_idx" ON "billing_subscriptions" USING btree ("subscriber_party_id");--> statement-breakpoint
CREATE INDEX "sub_renewal_idx" ON "billing_subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE INDEX "time_project_date_idx" ON "billing_time_entries" USING btree ("project_id","entry_date");--> statement-breakpoint
CREATE INDEX "time_submitter_date_idx" ON "billing_time_entries" USING btree ("submitted_by_user_id","entry_date");--> statement-breakpoint
CREATE INDEX "time_status_idx" ON "billing_time_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "time_timesheet_idx" ON "billing_time_entries" USING btree ("timesheet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheets_week_unique" ON "billing_timesheets" USING btree ("organization_id","submitted_by_user_id","week_starting");--> statement-breakpoint
CREATE INDEX "timesheets_status_idx" ON "billing_timesheets" USING btree ("status","week_starting");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_org_number_unique" ON "crm_contracts" USING btree ("organization_id","contract_number");--> statement-breakpoint
CREATE INDEX "contracts_end_client_status_idx" ON "crm_contracts" USING btree ("end_client_party_id","status");--> statement-breakpoint
CREATE INDEX "contracts_bl_end_idx" ON "crm_contracts" USING btree ("business_line_id","end_date");--> statement-breakpoint
CREATE INDEX "contracts_status_end_idx" ON "crm_contracts" USING btree ("status","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_tpl_lines_unique" ON "crm_deal_stage_template_lines" USING btree ("template_id","slug");--> statement-breakpoint
CREATE INDEX "deal_stage_tpl_lines_order_idx" ON "crm_deal_stage_template_lines" USING btree ("template_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stage_templates_slug_unique" ON "crm_deal_stage_templates" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_stages_bl_slug_unique" ON "crm_deal_stages" USING btree ("organization_id","business_line_id","slug");--> statement-breakpoint
CREATE INDEX "deal_stages_bl_order_idx" ON "crm_deal_stages" USING btree ("business_line_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_org_number_unique" ON "crm_deals" USING btree ("organization_id","deal_number");--> statement-breakpoint
CREATE INDEX "deals_bl_stage_idx" ON "crm_deals" USING btree ("business_line_id","stage_id","deleted_at");--> statement-breakpoint
CREATE INDEX "deals_primary_party_idx" ON "crm_deals" USING btree ("primary_party_id");--> statement-breakpoint
CREATE INDEX "deals_owner_stage_idx" ON "crm_deals" USING btree ("owner_user_id","stage_id");--> statement-breakpoint
CREATE INDEX "rate_card_lines_card_idx" ON "crm_rate_card_lines" USING btree ("rate_card_id");--> statement-breakpoint
CREATE INDEX "rate_cards_bl_effective_idx" ON "crm_rate_cards" USING btree ("business_line_id","effective_from");