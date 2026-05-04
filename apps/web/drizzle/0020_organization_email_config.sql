ALTER TABLE "organizations" ADD COLUMN "email_sender_domain" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_sender_address" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_sender_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "postmark_message_stream" text DEFAULT 'outbound' NOT NULL;