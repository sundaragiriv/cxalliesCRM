-- users.organization_id was missing its FK to organizations.id. The schema
-- declared organizationId() but the import-cycle workaround that defers FKs
-- to a follow-up migration should have included this one. Defaults to
-- ON DELETE RESTRICT — tenant offboarding will be an explicit script in the
-- multi-tenant future, not a cascade.

ALTER TABLE "users"
  ADD CONSTRAINT "users_organization_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
