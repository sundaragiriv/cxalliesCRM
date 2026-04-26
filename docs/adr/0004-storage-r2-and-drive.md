# ADR-0004: Dual-Source File Storage — Cloudflare R2 + Google Drive

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-04-26 |
| **Deciders** | Venkata Sundaragiri (Owner / Lead Engineer) |
| **Consulted** | AI architecture partner (this conversation) |
| **Supersedes** | — |
| **Superseded by** | — |

---

## 1. Context

CXAllies — Intelligent AI/ERP Solutions handles files in three categories:

1. **System-generated** — invoice PDFs, pay stubs, monthly reports, AI-generated summaries, exports
2. **User-uploaded into the app** — expense receipts, ticket attachments, scanned contracts, profile pictures
3. **User-curated documents already in Google Drive** — negotiated contracts, client deliverables, reference material that the owner already manages in Drive folders

The natural temptation is to pick one storage backend and force everything through it. Two single-source options were considered:

- **R2-only** — copy or upload all Drive content into R2, manage everything in one place
- **Drive-only** — store all system-generated PDFs in Drive folders too, lean on what the owner already uses

Both single-source options were rejected. R2-only forces friction onto the owner's existing Drive workflow. Drive-only makes programmatic file generation awkward (Drive's API is not S3-compatible, signed URLs work differently, and Drive quotas are user-tied not bucket-tied).

The decision: dual-source, with explicit rules about which backend handles which use case.

---

## 2. Decision

**Two storage backends, one `files` table.**

- **Cloudflare R2** stores categories 1 and 2 (system-generated and user-uploaded into the app)
- **Google Drive** stores category 3 (user-curated documents linked from outside the app) via OAuth-per-user
- A unified `files` table abstracts the difference. Other tables FK into `files.id` and don't care which backend holds the bytes.
- Drive integration is **read-and-link** in Phase 1. Two-way sync is deferred to Phase 2 if needed; ADR-XXXX will revisit.

---

## 3. Rationale

### 3.1 Why R2 for system-generated and user-uploaded content

R2 is S3-compatible, which means:

- The AWS SDK works unchanged
- Signed URL generation is a standard pattern
- Streaming uploads from browser → R2 directly (skipping the Next.js server) is straightforward
- Migration to S3 itself, or any S3-compatible alternative, is a config change

Cost profile:
- Storage: \$0.015/GB/month (~30% cheaper than S3)
- Egress: \$0 (this is the killer feature — no bandwidth costs)
- Operations: \$0.36 per million Class A operations, \$0.036 per million Class B

For Phase 1 (estimated ~5GB of receipts and PDFs), monthly cost is under \$1. Free tier covers it.

The S3-compatible interface means our code looks like:

```typescript
// src/modules/files/lib/r2.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

export const uploadToR2 = async (key: string, body: Buffer, contentType: string) => {
  await r2.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
};

export const presignDownload = async (key: string, expiresInSeconds = 300) =>
  getSignedUrl(r2, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), { expiresIn: expiresInSeconds });
```

Standard, boring, well-understood. No surprises.

### 3.2 Why Drive for user-curated linked references

The owner already manages contracts, client deliverables, and reference docs in Google Drive folders. Three options for handling this content:

| Option | Cost to owner | Cost to system | Drift risk |
|---|---|---|---|
| **Force-copy into R2 on upload** | Owner uploads twice (once to Drive, once to CXAllies) | Storage doubles | High — Drive copy diverges from R2 copy as edits happen |
| **Sync Drive → R2 automatically** | Transparent | Sync engine, conflict resolution, quotas | Medium — sync delays, conflict edge cases |
| **Link Drive files directly (no copy)** | Owner picks files from a Drive picker; CXAllies stores the file ID and metadata | Minimal — just metadata | None — Drive is the source of truth |

Option 3 is dramatically simpler. The cost is that R2-side AI features (e.g., extract receipt details with OCR) don't apply to Drive-linked files unless we explicitly fetch them at AI-call time. That's an acceptable trade-off because Drive-linked files are typically already-organized human documents, not raw receipts that need processing.

### 3.3 Why a unified `files` table

The natural alternative is two columns wherever a file is referenced:

```sql
-- Bad
expense_entries.r2_key TEXT NULL,
expense_entries.drive_file_id TEXT NULL,
```

This duplicates the abstraction across every table that references files (~15 tables). Worse, it leaks the storage backend choice into business logic — every query needs to know which column to read.

The unified `files` table fixes this:

```sql
files (
  id uuid PK,
  kind enum('r2_owned', 'drive_linked'),
  r2_key text NULL,
  drive_file_id text NULL,
  drive_account_id uuid NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  ...
  CHECK (
    (kind = 'r2_owned' AND r2_key IS NOT NULL AND drive_file_id IS NULL) OR
    (kind = 'drive_linked' AND drive_file_id IS NOT NULL AND r2_key IS NULL)
  )
);

-- All other tables reference files.id
expense_entries.receipt_file_id uuid FK NULL → files.id
crm_contracts.signed_pdf_file_id uuid FK NULL → files.id
support_ticket_attachments.file_id uuid FK NOT NULL → files.id
```

Business code calls `files.api.getDownloadUrl(fileId)` and gets back a usable URL regardless of backend. The backend dispatch lives in the `files` module.

### 3.4 Why OAuth-per-user for Drive (not a service account)

Two ways to integrate Drive:

| Approach | How it works | Pros | Cons |
|---|---|---|---|
| **Service account** | A Google-owned account with a private key; CXAllies impersonates this account to access a shared Drive | One credential, simple | Files become owned by the service account; complex sharing model; doesn't access user's existing Drive |
| **OAuth per user** | Each user grants CXAllies access to *their* Drive; CXAllies stores refresh tokens and acts on behalf of each user | Files stay owned by the user; works with existing Drive content; clean revocation | Refresh token management; per-user setup |

For our use case (the owner has existing Drive folders he wants to link), OAuth-per-user is correct. Service account would force a Drive migration; OAuth lets the owner keep working in Drive as-is.

Refresh tokens are stored encrypted in `auth_oauth_tokens` (per ADR-0001 §5.1, all secrets are encrypted at rest with a per-row key derived from the user's session + a master key in env).

### 3.5 Why read-and-link in Phase 1, defer two-way sync

The simplest useful integration is:

1. Owner clicks "Attach from Drive" on a contract record
2. Google Drive picker opens
3. Owner picks a file
4. CXAllies stores `drive_file_id`, `drive_account_id`, filename, mime type, size
5. UI shows the file with an "Open in Drive" link
6. AI features fetch the file content on-demand if needed

This is one Drive API integration: the picker. Roughly 1 day of work in Phase 1.

Two-way sync (CXAllies edits, Drive reflects them, or vice versa) is materially more complex:

- Conflict resolution
- Webhook subscriptions for Drive change notifications (Drive's push notifications are awkward and expire every 7 days)
- Quota tracking
- Permission propagation

Defer to Phase 2 with a real use case driving it. Most likely use case: AI-generated invoice summary attached as a Drive doc. Until that use case appears, read-and-link is enough.

### 3.6 Why not S3 itself

S3 works fine. R2 wins on three dimensions:

| | S3 | R2 |
|---|---|---|
| Storage cost | \$0.023/GB/month | \$0.015/GB/month |
| Egress cost | \$0.09/GB | \$0.00 |
| Bandwidth caps | None | None |

Egress is the killer. If a user downloads a 10MB invoice 100 times a month, S3 charges \$0.09; R2 charges \$0. At scale (Phase 5+) this compounds. Cloudflare's CDN is also free in front of R2.

The only S3 advantage: tighter integration with AWS ecosystem (Lambda, SES, etc.) — irrelevant to us since we're not on AWS.

### 3.7 Why not Vercel Blob or Supabase Storage

Both exist and would work. Rejected because:

- **Vercel Blob** charges \$0.15/GB/month storage and \$0.36/GB egress. ~10x R2.
- **Supabase Storage** is fine but ties us to Supabase as a stack choice. We chose Railway for Postgres; adding Supabase for storage means two vendors when one (Cloudflare) suffices.

### 3.8 Why a `files` module exists at all

We could put file handling in `lib/files/` (top-level utilities, not a module). The decision to make it a module is because:

- Files have lifecycle (created, accessed, deleted, archived)
- Files emit events (`files.uploaded`, `files.linked`, `files.deleted`) that AI subscribers care about (e.g., extract text from an uploaded receipt)
- Files have permissions and access logging
- Files have their own `api/` (presigned URL generation, metadata queries)

These all warrant module-level treatment. The `files` module is added to the architecture's module list — bringing the count to **12 modules** (was 11).

---

## 4. Schema commitments

### 4.1 The `files` table

```typescript
files
├── id                  uuid PK
├── organization_id     uuid FK → organizations.id
├── kind                enum('r2_owned', 'drive_linked')
├── r2_key              text NULL              -- non-null when kind = 'r2_owned'
├── r2_bucket           text NULL              -- non-null when kind = 'r2_owned'
├── drive_file_id       text NULL              -- non-null when kind = 'drive_linked'
├── drive_account_id    uuid NULL FK → auth_oauth_tokens.id
├── drive_web_view_link text NULL              -- cached at link time
├── filename            text NOT NULL
├── mime_type           text NOT NULL
├── size_bytes          bigint NOT NULL
├── checksum_sha256     text NULL              -- R2 only
├── uploaded_by_user_id uuid FK → users.id
├── created_at          timestamptz NOT NULL
├── updated_at          timestamptz NOT NULL
├── deleted_at          timestamptz NULL       -- soft delete
└── CHECK ((kind = 'r2_owned' AND r2_key IS NOT NULL AND drive_file_id IS NULL) OR
        (kind = 'drive_linked' AND drive_file_id IS NOT NULL AND r2_key IS NULL))
```

Indexes: `(organization_id, created_at)`, `(uploaded_by_user_id)`, `(kind)`.

### 4.2 The `auth_oauth_tokens` table (Phase 1 addition)

```typescript
auth_oauth_tokens
├── id                  uuid PK
├── user_id             uuid FK → users.id
├── provider            enum('google', 'microsoft')   -- microsoft reserved for future
├── access_token        text NOT NULL                  -- encrypted
├── refresh_token       text NOT NULL                  -- encrypted
├── expires_at          timestamptz NOT NULL
├── scopes              text[] NOT NULL                -- array of granted scopes
├── account_email       text NOT NULL                  -- for display
├── created_at          timestamptz
├── updated_at          timestamptz
└── deleted_at          timestamptz NULL
```

Indexes: `(user_id, provider)`. Tokens are encrypted at rest; see ADR-0007 (security model, deferred) for the encryption-at-rest design.

### 4.3 Bucket naming convention

R2 keys follow this pattern:

```
{organization_id}/{module}/{entity}/{file_id}/{filename}
```

Example:
```
00000000-0000-0000-0000-000000000001/finance/expense-entries/abc-def-123/receipt.pdf
```

This makes:
- Multi-tenant migration painless (org ID is already in the key)
- Audit trails by module trivial (`prefix=org-id/finance/`)
- Lifecycle policies per entity-type configurable

One bucket per environment: `cxallies-dev`, `cxallies-prod`. No need for per-module buckets.

---

## 5. Module surface

The `files` module:

```
src/modules/files/
├── api/
│   ├── getFile.ts                 # metadata + signed URL or Drive link
│   ├── listFilesForEntity.ts      # all files attached to an entity
│   └── getDownloadUrl.ts          # backend-aware URL resolution
├── actions/
│   ├── uploadToR2.ts              # creates files row + uploads bytes
│   ├── linkFromDrive.ts           # creates files row from Drive picker output
│   ├── deleteFile.ts              # soft delete + R2 cleanup (or unlink for Drive)
│   └── connectGoogleAccount.ts    # OAuth flow completion
├── events/
│   ├── emitters/                  # files.uploaded, files.linked, files.deleted
│   └── subscribers/
│       └── extractReceiptText.ts  # AI subscriber example (Phase 5)
├── lib/
│   ├── r2.ts                      # S3-compatible client wrapper
│   ├── drive/
│   │   ├── client.ts              # Google Drive API client
│   │   ├── picker.ts              # picker URL + token generation
│   │   └── tokens.ts              # encryption + refresh
│   └── presign.ts                 # signed URL helpers
├── components/
│   ├── FilePicker.tsx             # unified upload-or-link button
│   ├── FilePreview.tsx            # backend-aware preview
│   └── DriveAccountConnect.tsx    # OAuth flow UI
├── schema.ts                      # files, auth_oauth_tokens
└── types.ts
```

Other modules use `<FilePicker entityTable="..." entityId="..." />` to attach files. The picker handles everything — show "Upload" and "Pick from Drive" buttons, route to the right backend, create the `files` row, return the file ID.

---

## 6. Privacy and compliance

### 6.1 What lives where

| Backend | What's there | Sensitivity |
|---|---|---|
| **R2** | Receipts, invoices, pay stubs, AI-generated content, exports | Moderate — financial PII |
| **Drive** | Metadata only (file IDs, names) — bytes stay in user's Drive | Low — we never copy the bytes |

For Drive, CXAllies has access only when the user is online and the access token is fresh. If the user revokes Drive access in their Google account settings, all Drive-linked files become unresolvable in CXAllies (the link breaks gracefully — UI shows "Drive access revoked, reconnect to view").

### 6.2 Data deletion

R2 file deletion: soft-delete `files.deleted_at` initially; a nightly job hard-deletes R2 objects 30 days after soft-delete. This protects against accidental deletions.

Drive file deletion: CXAllies never deletes from Drive. If a user deletes a Drive-linked file in CXAllies, only the link is removed.

### 6.3 GDPR / data export

Per the vision document's GDPR readiness, file data export includes:

- All R2 files the user uploaded — bundled into a ZIP for download
- A manifest of all Drive-linked files — file IDs and names; the actual bytes are already in the user's Drive

### 6.4 Audit trail

Every file operation writes to `audit_log`:
- File uploaded (who, when, size, mime type)
- File downloaded (who, when, file ID)
- File deleted (who, when, file ID)
- Drive account connected (who, when, scopes granted)

Download events are logged to `audit_log` with throttling (one log per user per file per hour) to avoid log spam from repeated views.

---

## 7. Consequences

### 7.1 Positive

- Owner keeps working in Drive for documents that already live there. No forced migration.
- System-generated and uploaded files have a clean, programmatic, low-cost storage layer (R2).
- Unified `files` table means business logic doesn't care which backend holds bytes.
- Migration to multi-tenant later is purely additive — `organization_id` is already in every R2 key.
- Provider lock-in is low: R2 → S3 is a config change; Drive → Box/Dropbox is harder but contained to the `files/lib/drive/` directory.

### 7.2 Negative

- Two integrations to maintain instead of one. Mitigated by the `files` module abstracting both behind one API.
- Drive OAuth flow adds Phase 1 surface area (~1 day). Acceptable.
- Drive's API is rate-limited (1000 requests/100 seconds per user). For our scale (occasional file picks, not bulk operations) this is irrelevant. Phase 5+ AI features that scan Drive content at scale will need to respect rate limits.
- Two backends mean two failure modes. Mitigation: the UI gracefully degrades when Drive is unreachable (shows the file metadata + a "Reconnect Drive" prompt).

### 7.3 Neutral

- Total file storage cost through Phase 1: under \$5/month (mostly R2 free tier).
- One additional module (`files`) brings the total to 12.

---

## 8. Alternatives considered

### 8.1 R2-only with Drive copy-on-link (rejected)

When a user picks a file from Drive, copy bytes to R2. Rejected because:
- Drift between Drive and R2 copies as Drive edits happen
- Doubles storage cost
- Forces every Drive-linked file to be downloaded once, even if no one ever views it in CXAllies

### 8.2 Drive-only (rejected)

Store everything in Drive folders. Rejected because:
- Drive's API is not S3-compatible — the SDK is bespoke
- Programmatic file generation (PDF invoices) requires owner's Drive quota
- Sharing model is awkward — every system-generated file would be owned by the user, complicating cross-user access if Phase 2 adds Poornima
- Signed URLs work differently (Drive uses link sharing, not time-limited URLs)
- Cost at scale is higher than R2 once Drive personal quotas are exceeded

### 8.3 S3 instead of R2 (rejected)

Discussed in §3.6. R2 wins on egress.

### 8.4 Supabase Storage or Vercel Blob (rejected)

Discussed in §3.7. Vendor sprawl and cost.

### 8.5 Local filesystem in production (rejected)

Vercel functions are stateless. Local filesystem doesn't survive restarts. Not viable.

### 8.6 Database-stored file bytes (rejected)

Storing files as `bytea` in Postgres. Rejected because:
- Postgres backups become enormous
- Connection pool memory pressure on file reads
- Indexing and query performance suffers
- Not why Postgres exists

---

## 9. Operational details

### 9.1 R2 setup

- Two buckets: `cxallies-dev`, `cxallies-prod`
- IAM tokens scoped to a single bucket each
- Lifecycle rule: hard-delete objects 30 days after `files.deleted_at` is set (enforced by a pg-boss daily job, not R2 lifecycle rules — gives us flexibility to undelete)
- CORS configured for browser direct upload from `cxallies.com` and Vercel preview domains

### 9.2 Google Cloud setup

- One Google Cloud project: `cxallies-prod`
- OAuth client credentials for "Web application" type
- Required scopes: `drive.file` (most restrictive — only files explicitly opened/created via the picker)
- Authorized redirect URIs: production + Vercel preview pattern
- Verification status: Phase 1 ships in test mode (max 100 users, fine for our scale); production verification deferred to SaaS pivot

### 9.3 Local development

- R2 mocked with MinIO in Docker (S3-compatible, runs locally)
- Drive picker uses a sandbox Google account
- Encryption keys derived from a known dev master key

### 9.4 Disaster recovery

- R2: Cloudflare's durability is 99.999999999% (11 nines). No additional backup needed for Phase 1. Phase 4+ may add cross-region replication if regulatory needs change.
- Drive: not our problem — Google's responsibility. We store metadata only.
- Database file metadata: covered by Railway's daily Postgres backups.

---

## 10. References

- Cloudflare R2 documentation — https://developers.cloudflare.com/r2/
- Google Drive API v3 — https://developers.google.com/drive/api/v3/about-sdk
- Google Drive Picker API — https://developers.google.com/drive/picker/guides/overview
- AWS SDK v3 (works unchanged with R2) — https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html
- Architecture document `01-architecture.md` §3.4
- ADR-0001 §5 (Implementation discipline) — for module structure rules

---

## 11. What's missing? What's wrong? What do we do next?

Three flags:

1. **Drive OAuth verification.** Test mode caps you at 100 users, which is fine for Phase 1–4. SaaS pivot will need production verification (a Google security review, ~2 weeks). Note for the future-considerations list.

2. **R2 bucket naming.** I went with `cxallies-dev` and `cxallies-prod`. If you want `varahi-cxallies-prod` to keep the parent-company name visible, change now — bucket renames after launch are painful.

3. **Encryption-at-rest design for OAuth tokens** is referenced as "ADR-0007" but not yet written. I'm not blocking on it because Phase 1 can ship with simple AES-256-GCM using a single master key in Vercel env. The full encryption ADR can be written when we add a second user (Phase 2), at which point per-user key derivation matters more.

Reply or "go" and I produce the data model (artifact #6 of 9, `docs/02-data-model.md`) next. That's the largest single artifact in the planning sequence — I'll likely produce it in two passes (structure + tables in pass 1, indexes + relationships + Drizzle code in pass 2) unless you prefer one big push.
