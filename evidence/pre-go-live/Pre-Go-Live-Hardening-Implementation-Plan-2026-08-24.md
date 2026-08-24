# Pre-Go-Live Hardening — Implementation Plan

**Prepared:** 2026-08-24  
**Status:** Proposed — no implementation has started.  
**Scope:** H1–H9 from `Pre-Go-Live-Hardening-Plan_1787603854523.md`, incorporating decisions 88–93 from `UAT-Change-Requirements-2026-08-18-2_1787603854500.md`.  
**Boundaries:** No deployment, no production access, no live payment credentials, and no personal-data compliance, consent, privacy-notice, or retention work outside the explicitly approved H7/H8 scope. The consolidated manual UAT proceeds independently.

## Findings That Shape This Plan

### 1. H1 — Callback signature verification is implemented in the current handler, but its route-level proof and rejection logging are incomplete

The public callback reads the untouched JSON body captured by Express (`artifacts/api-server/src/app.ts:39-43`), obtains `x-payment-signature`, and calls `verifyPaymentWebhookSignature(rawBody, signature)` **before** it extracts a charge ID or calls `confirmPaymentFromVerifiedCallback` (`artifacts/api-server/src/routes/payments.ts:125-137`).

`verifyPaymentWebhookSignature` requires `PAYMENT_WEBHOOK_SECRET`, calculates an HMAC-SHA-256 over the raw body, strips an optional `sha256=` prefix, and compares using `timingSafeEqual` (`artifacts/api-server/src/payments/PaymentCore.ts:98-108`). An unsigned or invalid signature therefore reaches neither the payment-purpose handler nor settlement.

However:

- The callback catches a `PaymentCallbackError` and returns `400` without writing a security log for unsigned/invalid callbacks (`payments.ts:140-145`).
- No current API test references `/payments/webhook`, `PAYMENT_WEBHOOK_SECRET`, or `verifyPaymentWebhookSignature`. Existing payment matrix tests exercise verified-provider result mismatches below the callback boundary; they do not prove raw unsigned or tampered HTTP callbacks are rejected before a purpose handler runs.
- The deterministic provider is correctly guarded in source: it can be selected only when `PAYMENT_PROVIDER=moyasar`, `PAYMENT_TEST_PROVIDER=deterministic`, and `NODE_ENV !== production` (`payments.ts:73-78`; `PaymentService.ts:22-40`). This needs an explicit production-configuration regression test.

**Conclusion:** H1’s core check exists today, but it is not yet sufficiently evidenced or observable for go-live. The H1 work is hardening and proof, not a wholesale replacement of the payment flow.

### 2. H2 — `/ai/chat` currently reads caller-specific application data and sends it to OpenAI

The chat route is authenticated, then resolves the caller from `users` by Clerk ID (`artifacts/api-server/src/routes/ai.ts:273-276`, `179-188`). It currently reads all of the following:

| Source | Current use | Reaches the model? |
| --- | --- | --- |
| `ai_knowledge_chunks` | Keyword retrieval of up to five chunks (`ai.ts:144-176`, `301-303`) | Yes — quoted in the system prompt |
| `users` | Caller name, role, verification state, unit number | Yes — name/role/status are included in `residentSummary` |
| `bookings` | Caller’s bookings; confirmed entries include facility, times, status, payment state | Yes |
| `permits` | Caller’s permits, requested dates, review notes, conditions | Yes |
| `move_forms` | Caller’s move forms, unit number, date, status, review note | Yes |
| `guests` | Caller’s active guest count | Yes |
| `vehicles` | Caller’s vehicle count | Yes |
| `facilities` | All facility records, used to resolve facility names | Yes, indirectly |
| `units` | Caller unit building, floor, type, size, occupancy | Yes |
| Request body | Current message, up to ten supplied history turns, requested language | Yes |
| Server-generated data | Current date and static portal guide | Yes |

The portal-data reads occur at `ai.ts:305-318`; the identifying/personalized prompt is built at `ai.ts:343-409` and `433-452`; the direct OpenAI request uses the OpenAI SDK with model `gpt-4o` at `ai.ts:460-470`.

The route does **not** query the document-library `documents` or `document_folders` tables today. It does query knowledge chunks. The `ai_knowledge_documents` table is used for admin knowledge management, not chat retrieval (`ai.ts:198-270`).

This is the feature’s first access review finding: personal portal context—including resident-identifiable name, unit information, bookings, permit review notes, and move-form data—is currently sent to **OpenAI**. The authenticated caller’s Clerk ID is also used for the present in-memory 20 requests/minute limit (`ai.ts:26-76`, `285-291`).

**Conclusion:** H2 is not compliant with decision 89 today. The chat path must be reduced to a narrowly-scoped knowledge-retrieval function; its authentication and rate-limit key do not require loading a `users` row.

### 3. H2b — The development UAT AI knowledge repository is empty

A read-only development-database query of `ai_knowledge_documents` left-joined to `ai_knowledge_chunks` on 2026-08-24 returned **zero rows**. Therefore there are no current knowledge documents to list or classify:

| Knowledge document | Chunks | Judgment |
| --- | ---: | --- |
| _None_ | 0 | No currently ingested document can be exposed through chat. |

This is not evidence that future uploads are safe. The schema has no visibility/audience field on either AI knowledge table (`lib/db/src/schema/aiKnowledge.ts:3-23`), while the document library has a visibility floor. Under the intended all-signed-in-user assistant model, every future knowledge upload is effectively quotable to any signed-in resident. The upload screen must make that governance boundary explicit.

## Proposed Sequential Delivery

Three focused units are proposed. They follow the requested risk boundaries, avoid mixing migration rehearsal work with feature hardening, and preserve a stop point after each evidence package.

| Order | Delivery unit | Hardening items | Why this boundary |
| --- | --- | --- | --- |
| 1 | **Security and access boundary** | H1, H2, H3 | Closes the two potential unauthorized-access paths first and moves announcements behind sign-in. |
| 2 | **Schema integrity and replay rehearsal** | H4, H5, H6 | Reconciles source/database drift, removes the obsolete enum, and proves the repository can construct the UAT schema from empty. H5 is the hard gate. |
| 3 | **Lifecycle and operational safety** | H7, H8, H9 | Uses the stabilized schema to add shared cleanup, bounded retention, durable rate limits, and the explicit single-instance operational constraint. |

## Delivery 1 — H1 to H3: Security and Access Boundary

### H1 — Payment callback hardening and proof

1. Retain raw-body HMAC verification as the callback entry gate; do not permit browser redirect, body fields, or client assertion to settle a payment.
2. Add structured security logging for rejected callback signatures without logging raw payloads, secrets, or full signatures. Log only safe metadata such as reason category, source IP, and an event/charge identifier when present.
3. Add route-level tests that prove:
   - unsigned callback returns refusal, produces the rejection log, and does not invoke provider verification or any purpose handler;
   - a one-byte raw-body mutation after signing returns refusal, produces the rejection log, and does not invoke provider verification or any purpose handler;
   - a valid signed callback reaches the existing verified-provider settlement path;
   - deterministic provider/checkout selection remains unavailable when `NODE_ENV=production`, even if the deterministic environment flag is set.
4. Confirm the exact Moyasar webhook header/algorithm contract against the provider adapter/configuration without using live credentials. If current names/protocol do not match the adapter’s documented contract, correct the implementation and tests before accepting H1.

**Evidence:** focused API test output; route-level refusal assertions; safe log assertion; source excerpt documenting the raw-body capture and provider-mode guard.

### H2 — Knowledge-only assistant

1. Separate chat retrieval/prompt construction from AI knowledge administration.
2. Restrict `POST /ai/chat` to:
   - Clerk authentication;
   - the request message, bounded client history, and language;
   - `ai_knowledge_chunks` retrieval only.

   It must not import or query `users`, `units`, `bookings`, `permits`, `move_forms`, `guests`, `vehicles`, `facilities`, `payment_attempts`, or document-library tables. Physical storage of knowledge rows in the application PostgreSQL database is not an exception: only the two named knowledge tables may be accessed by chat.
3. Remove caller name, role, verification state, unit, booking, payment, permit, move, guest, vehicle, and facility context from the model prompt. Keep a generic portal-navigation guide only if it contains no resident-specific data.
4. Preserve the existing per-user chat limit in this delivery so the endpoint is never unlimited. Delivery 3 will replace it with H9’s shared durable limiter.
5. Add the exact administrator-facing upload warning in English and Arabic:

   > Documents uploaded here can be quoted to any signed-in resident. Do not upload owner-only or confidential material.

6. State model egress in the admin interface/evidence: the server calls OpenAI `gpt-4o`; it sends the selected knowledge chunks, user message, bounded chat history, language instructions, and generic prompt. Application-record context is no longer sent. A resident can still voluntarily enter personal material in their own message, which is outside automatic portal-context injection.
7. Add tests proving:
   - a distinctive knowledge-chunk marker is retrievable;
   - a document-library marker is not retrievable;
   - seeded resident/unit/booking/payment/permit data does not appear in the outgoing model prompt or streamed response;
   - non-admins cannot administer the knowledge repository;
   - chat remains rate-limited.

**Evidence:** focused API tests with captured model inputs; a documented egress table; UI screenshot/source test for the upload warning.

### H3 — Authenticated announcement visibility

1. Add an announcement visibility field with exactly `all_portal_users` and `verified_owners_only`.
2. Migrate every existing announcement to `all_portal_users`. Existing `is_public` will become **inert in this pass**: it will not participate in any retrieval or homepage decision. It is retained temporarily for non-destructive compatibility and can be removed only in a separately reviewed cleanup migration.
3. Require authentication for list and identifier retrieval; remove any public homepage/API listing behavior.
4. Allow `verified_owner` and `admin` to read owners-only announcements. Deny tenants, household members, unverified users, and unauthenticated callers on both list and direct-ID paths.
5. Update web/mobile request handling and admin creation/edit controls to choose/show visibility.
6. Add migration, API, client, and direct-object retrieval tests: unauthenticated refusal; tenant omission and direct-ID refusal; verified-owner/admin success; existing rows defaulted to all users.

**Delivery 1 gate:** all H1 unsigned/tampered tests pass; captured H2 prompts contain knowledge-only context; public announcement reads are absent. No deployment.

## Delivery 2 — H4 to H6: Schema Integrity and Full Replay Rehearsal

### H4 — Make the Drizzle schema declare database protections

1. Inventory every foreign key, `ON DELETE` policy, check constraint, partial unique index, trigger, and function introduced by `0033_stage6a_release_engine.sql` and `0036_stage6a_common_unit_integrity.sql`.
2. Add every expressible foreign key, index, and check to the relevant Drizzle schema definition with the same `ON DELETE` policy.
3. Document raw-SQL-only constructs where Drizzle cannot express them safely, including the HOA COMMON protection function/trigger and any unsupported partial or predicate construct. A raw-SQL-only item must have a catalog assertion so it cannot silently disappear.
4. Run `drizzle-kit generate` after the reconciliation and publish the generated SQL diff. It must contain no destructive `DROP`/constraint-removal statement. A destructive diff is a stop condition, not something to edit away.
5. Add catalog-level tests/evidence that enumerate expected FK policies, checks, partial indexes, and the trigger.

### H6 — Remove the obsolete `renovation_scope` type

1. Query the development UAT catalog before changing it to prove whether any column, default, function, or dependency still references `renovation_scope`.
2. If no dependency remains, add a forward migration dropping the orphaned enum.
3. If a dependency is found, stop and publish its exact dependency graph; do not remove or recreate a type speculatively.
4. Correct the regenerated blueprint and schema evidence so it no longer presents obsolete categories as current.
5. Add replay/catalog assertions that the obsolete enum is absent while the approved text-based permit categories remain intact.

### H5 — Full repository replay and migration ledger: the hard go-live rehearsal

This is a build-from-nothing proof, not a migration inventory.

1. Produce a checked-in ordered migration ledger containing every repository migration, SHA-256, ordering rationale, dependencies, and the treatment of:
   - numbered migrations `0001`–`0037`;
   - the unnumbered `2026-08-18-household-invitations.sql`;
   - the historical `0020` collision, including why the authoritative replay order is unambiguous.
2. Define an applied-state procedure that compares the checked-in ledger to the database migration state before promotion. This gives production promotion a reproducible, auditable procedure without touching production in this hardening pass.
3. Capture a fresh `pg_dump --schema-only` from the current development UAT database immediately before rehearsal. The old 2026-08-19 dump is reference material, not the rehearsal baseline.
4. Create a disposable, genuinely empty PostgreSQL database. Apply the ledger in exact order using the documented procedure; do not use an already-migrated test database.
5. Capture `pg_dump --schema-only` from the replayed database, normalize only non-semantic dump noise, and publish the complete unified diff against the fresh UAT baseline.
6. Require an empty semantic schema diff. Any difference is classified as:
   - a migration missing from the repository;
   - a source/schema declaration drift;
   - intentional raw SQL that needs to be ledgered and replayed;
   - or another explicit, corrected cause.

   It is not acceptable to waive a non-empty diff without a corresponding source/migration correction and a repeated empty replay.
7. Add a repeatable validation command suitable for CI/local rehearsal, with evidence showing the clean replay, ordered ledger, baseline dump hash, replay dump hash, and diff result.

**Delivery 2 gate:** H4 generated diff has no destructive statements; H6 catalog proof is complete; the H5 empty-database replay matches a fresh UAT schema dump semantically. No production migration or deployment occurs.

## Delivery 3 — H7 to H9: Lifecycle and Operational Safety

### H7 — Resident photo cleanup on terminal release

1. Reuse and generalize the existing B4 durable object-cleanup retry pattern rather than creating a parallel retry mechanism. The design will make the same cleanup queue/worker serve title-deed cleanup and resident-photo cleanup, with a target/type discriminator and idempotency key.
2. During the shared release transaction, find the released subject and archived household members with `residents.id_photo_key`, enqueue one durable cleanup job per object, and null the key in the same transaction.
3. The worker deletes via the existing object-storage abstraction. A missing object is an idempotent success; storage failure leaves the completed release intact and advances the same retry record with bounded backoff.
4. Add tests for successful deletion/key nulling, storage failure with one queued retry, retry completion, duplicate/rerun idempotency, and archived household-member inclusion.

### H8 — Bounded guest and gate history retention

1. Add a configurable `hoa_settings` retention value with a 90-day default.
2. Add an idempotent scheduled purge, running under the existing single-instance scheduling model, for records older than the configured cutoff in dependency-safe order:
   - `guest_pass_verification_logs`;
   - `guest_entry_exit_logs`;
   - `guest_passes`;
   - `guests`.
3. Report structured per-table and total deletion counts on every run, including a zero-delete run.
4. Explicitly exclude `waha_guest_day_passes` and `payment_attempts` in code comments and tests. They are payment-bearing financial/reconciliation records and are never part of H8’s purge.
5. Add tests for older-than-window deletion, inside-window retention, idempotent rerun, reported counts, and payment-bearing record survival.

### H9 — Durable rate limits and documented single-instance constraint

1. Replace isolated in-memory limits with one shared durable rate-limit abstraction backed by PostgreSQL, using atomic windows/counters and bounded cleanup. This avoids restart reset and prevents bypass if a second web process is accidentally started.
2. Apply appropriately scoped limits:
   - payment webhook: IP-based public-endpoint limit;
   - payment create/retry: authenticated user limit;
   - `/users/me/sync`: caller/IP protection for first-sign-in pressure;
   - `/ai/chat`: authenticated user limit;
   - document download: authenticated user limit.

   Limits and keys will be named configuration constants and covered by boundary tests rather than embedded as unexplained literals.
3. Add tests for normal allowance, `429` at the threshold, independent caller/IP scopes, window expiry, and persistence across module/restart simulation.
4. Update the regenerated blueprint prominently: production is a **single server instance**. Startup invokes six independent schedulers (`artifacts/api-server/src/index.ts:31-36`); scaling beyond one instance would run each scheduler on every instance, including the tenancy lifecycle that can delete accounts. A scheduler lock/leader-election design is mandatory before horizontal scaling.

**Delivery 3 gate:** photos are retry-cleaned without rolling back release; H8 never touches financial pass/payment records; rate limits survive restart simulation; the single-instance constraint is recorded in the blueprint. No deployment.

## Cross-Delivery Evidence and Stop Conditions

Each delivery publishes individual evidence files under `evidence/pre-go-live/`, with SHA-256, relay commit/blob IDs, and `assertRelayPublication` validation. Evidence will include test-suite deltas; any decrease is explained by file and assertion.

| Stop condition | Response |
| --- | --- |
| Callback signature protocol differs from the configured Moyasar contract | Stop H1 settlement changes; correct the contract/test design before continuing. |
| H2 test shows any application record reaches the chat model prompt | Do not accept Delivery 1. |
| Drizzle generate proposes destructive SQL | Do not apply it; reconcile source/database declarations first. |
| `renovation_scope` has a live dependency | Do not drop it; publish dependency evidence and revise the migration plan. |
| Empty replay schema diff is non-empty | Do not proceed to production readiness; identify and correct every difference, then replay again. |
| Object cleanup/purge could delete a payment-bearing record | Stop Delivery 3 and correct scope/order before testing. |

## Acceptance Sequence After Implementation

1. Review and accept Delivery 1 security/access evidence.
2. Review and accept Delivery 2 replay evidence. H5 is the repository-to-database go-live gate.
3. Review and accept Delivery 3 lifecycle/operational evidence.
4. Continue the independent manual UAT.
5. Only after all hardening evidence and manual UAT management sign-off may production promotion be considered.
