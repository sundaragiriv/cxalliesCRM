// Drizzle Kit reads this file. Module schemas land per-ticket starting in P1-03.
// For P1-02 we only export the enums catalog so `pnpm db:generate` produces the
// CREATE TYPE migration without any tables.

export * from './enums'
