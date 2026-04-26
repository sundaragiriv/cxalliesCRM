-- Companion to 0006: updated_at triggers for the four tables whose updated_at
-- column was created or first appeared in 0006. The set_updated_at() function
-- was created in 0004; we just attach new triggers.
--
-- The auth_oauth_tokens trigger created in 0004 was dropped automatically by
-- 0006's `DROP TABLE auth_oauth_tokens CASCADE`.

CREATE TRIGGER auth_sessions_updated_at BEFORE UPDATE ON "auth_sessions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_accounts_updated_at BEFORE UPDATE ON "auth_accounts"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_verifications_updated_at BEFORE UPDATE ON "auth_verifications"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_two_factor_updated_at BEFORE UPDATE ON "auth_two_factor"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
