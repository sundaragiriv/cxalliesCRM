-- Extensions enabled on first container start. pgvector is required for AI embeddings
-- (per data-model §1 and ADR-0003). gen_random_uuid() is built into Postgres 13+, no
-- pgcrypto needed.
CREATE EXTENSION IF NOT EXISTS vector;
