-- Cross-module FKs that couldn't be expressed as Drizzle .references() calls
-- without creating import cycles between auth, parties, and files schemas.
-- Subset relevant to P1-03 modules only; finance/billing/crm FKs from
-- data-model §15.5 are deferred to their respective tickets.

ALTER TABLE "parties"
  ADD CONSTRAINT "party_employer_fk"
  FOREIGN KEY ("employer_party_id") REFERENCES "parties"("id");

ALTER TABLE "users"
  ADD CONSTRAINT "user_party_fk"
  FOREIGN KEY ("party_id") REFERENCES "parties"("id");

ALTER TABLE "users"
  ADD CONSTRAINT "user_avatar_fk"
  FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id");

ALTER TABLE "organizations"
  ADD CONSTRAINT "org_logo_fk"
  FOREIGN KEY ("logo_file_id") REFERENCES "files"("id");

ALTER TABLE "brands"
  ADD CONSTRAINT "brand_logo_fk"
  FOREIGN KEY ("logo_file_id") REFERENCES "files"("id");
