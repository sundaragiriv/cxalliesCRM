CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense', 'cogs');--> statement-breakpoint
CREATE TYPE "public"."address_kind" AS ENUM('billing', 'shipping', 'home', 'office', 'other');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('success', 'error', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."ai_suggestion_status" AS ENUM('pending', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete', 'soft_delete', 'restore');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'quarterly', 'annual', 'lifetime');--> statement-breakpoint
CREATE TYPE "public"."business_line_kind" AS ENUM('services', 'subscription', 'ad_revenue', 'product', 'other');--> statement-breakpoint
CREATE TYPE "public"."card_ownership" AS ENUM('business_owned', 'personal_with_business_use');--> statement-breakpoint
CREATE TYPE "public"."card_type" AS ENUM('visa', 'mastercard', 'amex', 'discover', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'sent', 'signed', 'active', 'expired', 'renewed', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'date', 'boolean', 'select', 'multiselect');--> statement-breakpoint
CREATE TYPE "public"."deal_stage_kind" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."employee_classification" AS ENUM('w2', '1099_contractor', 'owner_employee');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'on_leave', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."expense_report_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'reimbursed');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('r2_owned', 'drive_linked');--> statement-breakpoint
CREATE TYPE "public"."filing_status" AS ENUM('single', 'married_jointly', 'married_separately', 'head_of_household');--> statement-breakpoint
CREATE TYPE "public"."invoice_line_kind" AS ENUM('time', 'expense', 'fixed', 'discount', 'tax');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."oauth_provider" AS ENUM('google', 'microsoft');--> statement-breakpoint
CREATE TYPE "public"."party_kind" AS ENUM('person', 'organization');--> statement-breakpoint
CREATE TYPE "public"."party_relationship_kind" AS ENUM('works_at', 'spouse_of', 'manages', 'subsidiary_of', 'partner_of', 'other');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('vendor', 'end_client', 'customer', 'lead', 'partner', 'employee', 'contractor', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."pay_frequency" AS ENUM('weekly', 'biweekly', 'semi_monthly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."pay_rate_kind" AS ENUM('hourly', 'salary');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('check', 'ach', 'wire', 'card', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('business_card', 'personal_card_business_use', 'personal_cash', 'business_check', 'business_ach', 'vendor_paid');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('expected', 'received', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planned', 'active', 'on_hold', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."subscription_event_kind" AS ENUM('created', 'trial_started', 'trial_ended', 'activated', 'renewed', 'upgraded', 'downgraded', 'paused', 'resumed', 'canceled', 'expired', 'reactivated', 'payment_failed', 'payment_succeeded');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'expired', 'paused');--> statement-breakpoint
CREATE TYPE "public"."tax_kind" AS ENUM('federal_income', 'state_income', 'self_employment', 'fica_ss', 'fica_medicare', 'medicare_additional');--> statement-breakpoint
CREATE TYPE "public"."tile_kind" AS ENUM('kpi', 'line_chart', 'bar_chart', 'table', 'list', 'project_health');--> statement-breakpoint
CREATE TYPE "public"."time_entry_status" AS ENUM('draft', 'submitted', 'approved', 'invoiced', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."timesheet_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');