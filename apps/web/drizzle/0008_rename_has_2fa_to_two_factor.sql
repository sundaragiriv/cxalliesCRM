-- Better Auth's twoFactor plugin requires the user column be literally named
-- `twoFactorEnabled` (Drizzle adapter checks property name); renaming our
-- `has_2fa_enabled` (Drizzle property `has2faEnabled`) to `two_factor_enabled`
-- (Drizzle property `twoFactorEnabled`) to satisfy the plugin.

ALTER TABLE "users" RENAME COLUMN "has_2fa_enabled" TO "two_factor_enabled";
