import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  inet,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  integer,
} from 'drizzle-orm/pg-core'
import { id, organizationId, standardLifecycle, timestamps } from '@/db/shared'
import { oauthProviderEnum } from '@/db/enums'

/**
 * Application users. A user is an authentication principal — distinct from a Party (contact record).
 * A user MAY be linked to a Party (e.g., Venkata is both User and Party); not required.
 *
 * The party_id and avatar_file_id FK constraints are declared in a follow-up SQL
 * migration to avoid an import cycle between auth, parties, and files.
 */
export const users = pgTable(
  'users',
  {
    id: id(),
    organizationId: organizationId(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    avatarFileId: uuid('avatar_file_id'),
    partyId: uuid('party_id'),
    timezone: text('timezone').notNull().default('America/New_York'),
    locale: text('locale').notNull().default('en-US'),
    has2faEnabled: boolean('has_2fa_enabled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...standardLifecycle,
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
    orgIdx: index('users_org_idx').on(t.organizationId),
  }),
)

/**
 * DB-backed sessions. Better Auth manages these in P1-04.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamps.createdAt,
  },
  (t) => ({
    tokenUnique: uniqueIndex('auth_sessions_token_unique').on(t.tokenHash),
    userIdx: index('auth_sessions_user_idx').on(t.userId),
  }),
)

/**
 * Encrypted OAuth tokens for Drive (Phase 1) and other providers (future).
 * access/refresh tokens are AES-256-GCM encrypted at the application layer.
 */
export const authOauthTokens = pgTable(
  'auth_oauth_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: oauthProviderEnum('provider').notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    scopes: text('scopes').array().notNull(),
    accountEmail: text('account_email').notNull(),
    ...standardLifecycle,
  },
  (t) => ({
    userProviderIdx: index('auth_oauth_user_provider_idx').on(t.userId, t.provider),
  }),
)

/**
 * Seed table. Five system roles defined in Phase 1.
 * No organization_id — roles are global definitions.
 */
export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  description: text('description').notNull(),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
})

/**
 * User to role assignments. A user can have multiple roles.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  }),
)

/**
 * Per-user pinned quick actions for the nav.
 * Supports the "ease of doing things" principle — power users pin frequent actions.
 */
export const userPinnedActions = pgTable(
  'user_pinned_actions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actionKey: text('action_key').notNull(),
    label: text('label').notNull(),
    iconName: text('icon_name'),
    targetUrl: text('target_url').notNull(),
    contextJson: jsonb('context_json').notNull().default(sql`'{}'::jsonb`),
    displayOrder: integer('display_order').notNull().default(0),
    ...standardLifecycle,
  },
  (t) => ({
    userOrderIdx: index('user_pinned_actions_user_order_idx').on(
      t.userId,
      t.displayOrder,
    ),
  }),
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type AuthSession = typeof authSessions.$inferSelect
export type AuthOauthToken = typeof authOauthTokens.$inferSelect
export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
export type UserRole = typeof userRoles.$inferSelect
export type UserPinnedAction = typeof userPinnedActions.$inferSelect
