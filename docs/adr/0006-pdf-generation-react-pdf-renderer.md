# ADR-0006: PDF Generation via @react-pdf/renderer

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-05-02 |
| **Deciders** | Venkata Sundaragiri (Owner / Lead Engineer) |
| **Consulted** | AI architecture partner (this conversation) |
| **Supersedes** | — |
| **Superseded by** | — |

---

## 1. Context

CXAllies generates PDFs for invoices, pay stubs, expense reports, and
custom reports. The original `CLAUDE.md` tech-stack table listed:

> | PDF | react-pdf | Invoices, pay stubs, reports |

That entry conflated two npm packages with similar names but opposite
purposes:

- **`react-pdf`** (https://www.npmjs.com/package/react-pdf) — a
  PDF.js-based **viewer** for displaying PDFs inside React apps.
- **`@react-pdf/renderer`** (https://www.npmjs.com/package/@react-pdf/renderer) —
  a server-side **renderer** that produces PDF bytes from a React
  component tree.

Phase 1 needs the renderer (P1-14 generates invoice PDFs at send-time).
The viewer is not needed — modern browsers render PDFs natively when
served via `Content-Type: application/pdf`, and `<a href={url} target="_blank">`
to a signed R2 URL gives a usable in-browser experience without
shipping a JS-based viewer.

`react-pdf` (the viewer) was installed in [apps/web/package.json](apps/web/package.json)
on the back of the table entry. It has not been imported anywhere.

This ADR corrects the choice and removes the misnamed dependency.

---

## 2. Decision

1. **Server-side PDF generation uses `@react-pdf/renderer`.** PDF
   templates live in `src/modules/{module}/lib/{thing}-pdf/template.tsx`
   as React components composed of `<Page>`, `<View>`, `<Text>`, etc.
   from `@react-pdf/renderer`.
2. **No in-app PDF viewer in Phase 1.** PDF access is via signed R2 URL
   opened in a new tab; the browser renders the PDF natively.
3. **`react-pdf` (the PDF.js viewer) is removed** from dependencies.
4. **PDFs are stored as `r2_owned` files** (per ADR-0004) and linked via
   the existing `files` table. Each generated PDF gets a versioned R2
   key so older revisions are preserved for audit (e.g., the
   original-as-sent invoice PDF survives a re-send after a brand
   refresh).

---

## 3. Rationale

### 3.1 Why `@react-pdf/renderer` over alternatives

| Library | Approach | Why not |
|---|---|---|
| **`@react-pdf/renderer`** ✅ | React components → PDF bytes (server-side) | Authoring layouts in TSX matches the team's primary skill stack. |
| **`puppeteer` / `playwright` HTML-to-PDF** | Render an HTML page in a headless browser, print to PDF | Heaviest possible runtime; ships a Chromium binary; slow cold starts on serverless; pixel-fidelity issues across Chromium versions. |
| **`pdfkit`** | Imperative drawing API | Layout becomes manual coordinate math; no React reuse; styling diverges from the rest of the app. |
| **`pdf-lib`** | PDF manipulation primitives | Lower level than `pdfkit`; suitable for splicing existing PDFs, not authoring new ones. |
| **External service (DocRaptor, PDFShift, etc.)** | HTTP API generates PDF | Vendor dependency for a thing we can do in-process; egress + latency cost; PII transits a third party. |

`@react-pdf/renderer` is the only option that:

- Lets us reuse Tailwind/shadcn design tokens (via the brand CSS-var
  values, which we read at render time and inline as `@react-pdf/renderer`
  style props).
- Runs in-process on Vercel without shipping Chromium.
- Authors templates in TSX so a designer can iterate without learning a
  drawing API.

### 3.2 Why no in-app viewer

The original `CLAUDE.md` entry implied we'd embed a PDF viewer
component somewhere. We don't need one in Phase 1:

- **For invoice send confirmation:** the user clicks "Send invoice", we
  display a toast on success. They don't need to see the PDF inline.
- **For "Download PDF" / "View PDF":** an `<a href={signedUrl} target="_blank">`
  opens the PDF in the browser's native viewer (Chrome PDF Viewer,
  Safari Quick Look, Firefox PDF.js). All three are polished, accessible,
  and free.
- **For email recipients:** their email client / OS handles the
  attachment.

The cost of shipping `react-pdf` (the viewer) is bundle weight (~1MB
including its PDF.js worker), an extra rendering pipeline to maintain,
and the likelihood that we never get its accessibility right. The
browser's native viewer is better than anything we'd ship in Phase 1.

If a future use case demands an inline viewer (e.g., a redline /
annotation flow), this ADR is reopened.

### 3.3 Why versioned R2 keys for generated PDFs

R2 storage is effectively free at our scale (~\$0.015/GB/month, no
egress cost — see ADR-0004 §3.1). The cost of preserving every
generation is negligible; the value is significant:

- **Audit trail.** When an invoice is re-sent after a brand color
  change (P1-25) or a terms-of-service update, the original-as-sent
  PDF must be reproducible. Without versioning, the re-send
  overwrites the original at the same R2 key.
- **Dispute resolution.** "What did the customer actually receive?" is
  unanswerable without the byte-exact PDF that was attached to the
  email at the time.
- **Idempotency.** Versioned keys mean "regenerate" is purely additive —
  a failed generation can be retried without thinking about partial
  state.

Versioning is encoded in the R2 key path:

```
{org_id}/billing/invoices/{invoice_id}/v{N}/invoice-{number}.pdf
```

The current version is tracked in a new `invoices.pdf_version` int
column (default 1, increments on each successful generation). The
latest `files.id` is stored in `invoices.pdf_file_id`; older versions
remain referenced by their `files` rows (which are not deleted).

---

## 4. Consequences

### 4.1 Positive

- One PDF dependency, correctly named, doing the thing it advertises.
- Native browser viewer = better accessibility than anything we'd build.
- TSX templates compose cleanly with the existing brand-CSS-var system —
  brand colors flow into PDFs via the same source of truth as the app UI.
- Versioned R2 keys give us auditability and idempotent regeneration
  for free.

### 4.2 Negative

- `@react-pdf/renderer` has its own subset of CSS (flexbox, limited
  text styling, no grid). Authors must learn this subset. Mitigation:
  one shared `apps/web/src/lib/pdf/` directory holds reusable
  primitives (header, footer, line-item table) that other modules
  compose into their templates.
- No support for arbitrary HTML (no `<table>`, no `<img>` from data
  URIs without configuration, no inline SVG without preprocessing).
  Mitigation: limit PDF templates to simple, rectangular layouts —
  which is what invoices, pay stubs, and reports actually need.
- Server-side rendering pulls in ~600KB of dependencies (pdfkit, fontkit,
  etc.). Acceptable; runs in the Node.js runtime on Vercel, not the
  edge runtime.

### 4.3 Neutral

- The `react-pdf` (viewer) entry in `package.json` is removed. No code
  imports it; the dependency is dead weight today.
- `CLAUDE.md`'s tech-stack table is updated to read `@react-pdf/renderer`.

---

## 5. Alternatives considered (and rejected)

### 5.1 Keep `react-pdf` for a future viewer use case (rejected)

Premature; speculative; adds bundle weight today for a need we may
never have.

### 5.2 HTML-to-PDF via headless browser (rejected)

Discussed in §3.1. Operational weight is disproportionate to what we
need.

### 5.3 External PDF API (DocRaptor / PDFShift / etc.) (rejected)

PII (party names, invoice amounts, payment terms) would transit a
third party. Cost grows with volume. Our requirements are well within
what `@react-pdf/renderer` handles.

---

## 6. Operational details

### 6.1 Fonts

Phase 1 uses the bundled Helvetica family that ships with
`@react-pdf/renderer` (no font files to manage, no licensing concerns).
Phase 5 may register a custom brand font per ADR-XXXX if/when the brand
system grows beyond color tokens.

### 6.2 R2 key pattern

```
{org_id}/billing/invoices/{invoice_id}/v{version}/invoice-{number}.pdf
```

Examples:

```
00000000-…/billing/invoices/abc-…/v1/invoice-INV-2026-0001.pdf
00000000-…/billing/invoices/abc-…/v2/invoice-INV-2026-0001.pdf  ← after re-send
```

`buildR2Key` in [files/lib/r2.ts](apps/web/src/modules/files/lib/r2.ts)
already encodes the `{org}/{module}/{entity}/...` prefix. P1-14 adds an
optional `version` segment to the helper.

### 6.3 Signed URL TTL for invoice emails

Phase 1 ships **~7-day signed URLs** in invoice emails. AWS Signature
Version 4 caps presigned URL expiry at exactly 604,800 seconds (7 days);
any longer throws at signing time. Discovered during P1-14 verify run —
the original 30-day plan is physically impossible with the S3 SigV4
signer, and MinIO (the dev R2 substitute) enforces the same cap.

The PDF is also delivered as a file attachment, so a stale link
degrades to "open the attachment" rather than a hard failure. The
in-email body copy says "stays live for one week."

Tracked as a follow-up in `docs/PROGRESS.md` §7 — Phase 2 replaces this
with an auth-checked route handler (`/api/invoices/:id/pdf`) that signs
a fresh URL on access. With the route handler, there's no TTL ceiling.

### 6.4 Dev / prod parity

`@react-pdf/renderer` produces deterministic byte output for the same
input (modulo the embedded `CreationDate` metadata). No special dev /
prod difference.

---

## 7. References

- `@react-pdf/renderer` — https://react-pdf.org/
- ADR-0004 — Cloudflare R2 storage
- `docs/03-conventions.md` §3.13 — value-at-time-of-event snapshots
  (PDF generation snapshots invoice + brand state at send time)
- P1-14 ticket in `docs/phase-1-tickets.md`

---

## 8. What's missing? What's wrong? What do we do next?

1. **Custom brand font.** Phase 1 uses Helvetica. If the CXAllies brand
   system grows to include a custom font, we register it via
   `Font.register({ family, src })` and serve it from R2. Defer until
   the brand system asks.
2. **PDF/A archival format.** `@react-pdf/renderer` does not produce
   PDF/A-compliant files out of the box. If a regulatory requirement
   appears (unlikely for invoices, possible for payroll archival),
   reopen this ADR.
3. **Email attachment size limits.** Postmark allows 10MB attachments.
   Invoice PDFs are typically <100KB. Not a concern for invoices; may
   matter for monthly report exports in Phase 4.
