-- Per data-model §15.4. The set_updated_at() function is org-wide; one trigger
-- per table that carries an updated_at column. Append-only tables (audit_log,
-- activities, exchange_rates, auth_sessions) and pure junction tables
-- (user_roles, party_roles, entity_tags) are intentionally excluded.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- auth module
CREATE TRIGGER users_updated_at BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_oauth_tokens_updated_at BEFORE UPDATE ON "auth_oauth_tokens"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_pinned_actions_updated_at BEFORE UPDATE ON "user_pinned_actions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- parties module
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER brands_updated_at BEFORE UPDATE ON "brands"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER business_lines_updated_at BEFORE UPDATE ON "business_lines"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER parties_updated_at BEFORE UPDATE ON "parties"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER party_relationships_updated_at BEFORE UPDATE ON "party_relationships"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON "addresses"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tags_updated_at BEFORE UPDATE ON "tags"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER custom_field_definitions_updated_at BEFORE UPDATE ON "custom_field_definitions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- files module
CREATE TRIGGER files_updated_at BEFORE UPDATE ON "files"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
