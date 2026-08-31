# N1 Validation Results

Date: 2026-08-31

## Automated

- API full suite: 102 files passed; 1,438 tests passed; 21 skipped.
- Portal full suite: 72 files passed; 1,404 tests passed.
- API TypeScript check: passed.
- Portal TypeScript check: passed.
- git diff --check: passed.
- Focused security tests cover unknown-key rejection, AES-GCM envelope storage, secret omission, blank-password preservation, plaintext/corrupt fail-closed behavior, typed outcomes, and dispatcher retry behavior.
- Table-driven notification producer test covers X3 events 1–16 with paired email/push rows and shared idempotency keys.

## Runtime

- API workflow restarted cleanly and server listened on port 8080.
- Notification dispatcher started with intervalMs=30000.
- Portal Vite workflow restarted cleanly.
