# Migrations runbook

Operational notes for adding, applying, and debugging Drizzle migrations in CXAllies.

## Adding a new migration

Two paths depending on whether the migration is schema-driven or data-only.

### Schema-driven (table change, column add, index, etc.)

1. Edit the relevant `src/modules/*/schema.ts` file.
2. Run `pnpm db:generate` from `apps/web/`. drizzle-kit emits a new `drizzle/NNNN_*.sql` file plus a snapshot in `drizzle/meta/NNNN_snapshot.json` and adds an entry to `drizzle/meta/_journal.json`.
3. Inspect the generated SQL — drizzle-kit gets simple cases right but complex transitions (renames, partial indexes, defaults on new NOT NULL columns) often need hand edits.
4. `pnpm db:migrate` to apply.

### Data-only (backfill, seed-tagging, system-role tagging — like 0013/0014)

drizzle-kit only generates SQL for schema deltas, so data-only migrations are hand-written:

1. Create `drizzle/NNNN_descriptive_name.sql` with the data SQL. Use `--> statement-breakpoint` between statements; multiple statements per file are fine.
2. **Copy the previous migration's snapshot**: `cp drizzle/meta/PREV_snapshot.json drizzle/meta/NNNN_snapshot.json`. Drizzle-kit consults the latest snapshot when computing the next schema diff; if you skip this, the next `db:generate` will produce a confusing diff that no longer matches your DB state.
3. Add an entry to `drizzle/meta/_journal.json`:
   ```json
   {
     "idx": NNNN,
     "version": "7",
     "when": <unix-millis larger than every prior `when`>,
     "tag": "NNNN_descriptive_name",
     "breakpoints": true
   }
   ```
4. **The `when` value MUST be monotonically increasing across the entire journal.** See the trap below.
5. Make the SQL idempotent — `INSERT ... WHERE NOT EXISTS`, `UPDATE ... WHERE x IS NULL`. Production hot-fixes get re-run; idempotency saves you.
6. `pnpm db:migrate` to apply.

## The `_journal.json` monotonic-`when` trap

Symptom: `pnpm db:migrate` says "Done" but your migration didn't run. The `__drizzle_migrations` table in the `drizzle` schema either has no row for it or shows a row that the migrator records-then-skips.

Root cause: drizzle-orm's `pg-core/dialect.cjs` migrate function compares `lastDbMigration.created_at < migration.folderMillis` to decide whether to apply. `lastDbMigration` is the row in `__drizzle_migrations` with the *largest* `created_at` (selected via `ORDER BY created_at DESC LIMIT 1`). `folderMillis` is the `when` from `_journal.json`. If your new entry's `when` is **smaller than the max `when` already recorded** (which can happen when an earlier entry has a deceptively-large timestamp), the migrator silently skips it.

Concrete example: Phase 1 has `0008_rename_has_2fa_to_two_factor` with `when: 1777862400000` (a future-dated value chosen for ordering rather than wall-clock accuracy). When P1-09 added `0013_employee_payable_account` with `when: 1777383270000`, that's **less** than 1777862400000 — so even though id 13 came after id 12 numerically, drizzle wouldn't apply it.

### How to detect

Run this query against the dev DB:

```sql
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
```

If the `created_at` values aren't monotonically increasing as `id` increases, you have inconsistent timestamps. Cross-reference with `_journal.json` — they should match 1:1.

### How to fix

1. Pick a `when` value strictly larger than the max already in `_journal.json`. A safe approach: `Date.now()` at migration-creation time, or `(prev_max_when + 86_400_000)` for "one day later in monotonic time".
2. Update the `when` in `_journal.json` for the new entry.
3. `pnpm db:migrate` should now apply it. drizzle uses the migration's hash to decide whether it's been applied, so changing only `when` doesn't cause double-application; if the hash matches an existing `__drizzle_migrations.hash`, the row is skipped.

### How to fix when stuck mid-state (migration body errored partway)

If a migration body half-applied (e.g., one `CREATE INDEX` succeeded but the next failed) and the migrator recorded the row anyway:

1. Diagnose the actual DB state via `psql`. Compare against expected post-migration state.
2. Either (a) hand-write the corrective SQL and run it directly via `psql`, or (b) drop the migration's row from `drizzle.__drizzle_migrations` and re-run `pnpm db:migrate` after fixing the SQL file.

### Why this exists at all

Drizzle's monotonic-`when` model lets you reorder migrations during development without renumbering files (you can swap two pending migrations by editing their `when` values). The cost is that future migrations must respect any earlier "future-dated" timestamps. For a multi-developer project this would be worth fixing upstream; for Phase 1 single-author it's simpler to live with the convention "always pick `when` > max(when) in journal".

## Inspecting state

```bash
# What migrations exist on disk
ls apps/web/drizzle/*.sql

# What migrations the journal claims should be applied
cat apps/web/drizzle/meta/_journal.json | jq '.entries[] | "\(.idx) \(.tag) when=\(.when)"'

# What the DB says is actually applied
docker exec cxallies-db psql -U cxallies -d cxallies -c \
  "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"

# Open Drizzle Studio for live schema inspection
pnpm db:studio
```

## Rollback

There is no `pnpm db:rollback`. Drizzle-kit doesn't ship one by design: rollbacks across schema + data are inherently per-case. Options:

- **Local dev**: drop the DB and re-run from scratch (`docker compose down -v && docker compose up -d && pnpm db:migrate && pnpm db:seed`). Faster than fighting a corrupted migration state.
- **Production**: hand-write the inverse SQL as a *new* migration. Never delete or modify a migration that's been applied to a production DB; always move forward.

## Conventions

- Migration filename: `NNNN_lowercase_snake_case.sql`. Number gapless from 0000.
- One commit per migration, paired with the schema change that drove it (or, for data-only, the feature ticket that motivated it).
- Idempotent SQL only. Re-running a migration must be safe.
- No data destruction without explicit user confirmation in the PR description.
- For new system roles, follow the 0013/0014 shape: `INSERT WHERE NOT EXISTS` + `UPDATE WHERE NULL` paired with a CoA template-line tag in `07-coa-templates.ts`.
