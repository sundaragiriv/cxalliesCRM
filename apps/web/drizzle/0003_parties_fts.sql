-- Full-text search column on parties per data-model §15.3.
-- search_tsv is a generated column; Postgres maintains it on every write.
-- display_name weighted A, primary_email B, notes C.

ALTER TABLE "parties"
  ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("display_name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("primary_email", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("notes", '')), 'C')
  ) STORED;

CREATE INDEX "parties_search_gin" ON "parties" USING gin("search_tsv");
