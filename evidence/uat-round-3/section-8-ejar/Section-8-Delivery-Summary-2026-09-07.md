# Round 3 Section 8 — Ejar delivery

**Date:** 2026-09-07

## Pre-fix behavior

The real tenant verification flow still rendered a required Ejar upload,
blocked submission without an object key, and sent document metadata to an API
that also required the private object path.

## Delivered behavior

- The portal no longer collects or uploads an Ejar contract file.
- Ejar contract number remains mandatory.
- Lease start and end dates remain mandatory.
- The tenant submission contains no Ejar object key, filename, or content hash.
- The API accepts number/date evidence without a document and explicitly
  rejects legacy Ejar document metadata on new submissions.
- English and Arabic number-only wording is present.
- The real Development-browser submission reached durable
  **Awaiting Owner Approval** state.

## Existing stored Ejar documents

Removing new uploads does **not** automatically delete existing files or erase
their database references.

Existing private documents retain the prior lifecycle:

- approval, rejection, or cancellation attempts strict object deletion;
- successful deletion clears the stored key and records deletion time;
- failed deletion creates/retries the existing cleanup record;
- protected legacy retrieval remains available to its existing authorized
  owner/admin paths until cleanup occurs.

Undecided or orphaned legacy documents are not silently purged by this change.
No existing Development data or stored object was deleted during this work.

## Evidence

- `Section-8-Post-Fix-Number-Only-Tenancy-Submission-2026-09-07.png`
- The combined browser transcript is published with the Section 7 evidence.

Focused API regressions cover document-free submission, rejection of new legacy
metadata, and unchanged legacy document cleanup.
