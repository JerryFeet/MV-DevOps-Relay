# Portal Domain Migration Plan

Date: 2026-09-02
Status: PLAN ONLY — NOT IMPLEMENTED
Target portal origin: https://app.madainvillagehoa.com
Public-site origin: bare madainvillagehoa.com remains untouched

## Decision

Mount the portal at the custom-domain root:

- Resident entry: https://app.madainvillagehoa.com/
- Sign-in: https://app.madainvillagehoa.com/sign-in
- Sign-up/invitations: https://app.madainvillagehoa.com/sign-up?invite=...
- Resident dashboard: https://app.madainvillagehoa.com/portal
- API: https://app.madainvillagehoa.com/api
- Future Moyasar webhook: https://app.madainvillagehoa.com/api/payments/webhook

Do not keep /hoa-portal/ as the canonical mount. The subdomain already separates the portal from the public site, so the extra path adds no useful boundary.

## Why this is a controlled high-risk change

The portal was previously restructured and reverted. This attempt is deliberate and must be treated as a launch-contract migration, not a cosmetic URL edit. The current code separates the browser route mount from Vite/API paths and still contains an explicit /hoa-portal fallback. A partial change can produce valid HTML with broken assets, API calls, Clerk redirects, or invitation links.

Primary risks:

1. Invitations continue pointing at the old Replit host or old /hoa-portal path.
2. SPA rewrites capture /api and return index.html instead of API responses.
3. Clerk initializes from an unrecognised host or returns to the old path.
4. Vite BASE_PATH is changed incorrectly, prefixing assets or /api with /hoa-portal.
5. Existing distributed links stop working without a redirect.
6. Payment/pass callback URLs continue using REPLIT_DOMAINS.
7. Mobile production builds continue targeting REPLIT_DEV_DOMAIN or replit.com.

Rollback must be a checkpoint rollback of the routing/domain batch, restoring the old mount and production PORTAL_BASE_URL together. Do not manually roll back only one side.

## Phase 0 — mandatory production configuration gate

This happens before any source change.

1. In Replit Publishing settings, add the production environment variable:

   PORTAL_BASE_URL=https://app.madainvillagehoa.com

   Use the origin only: HTTPS, no trailing slash, no /hoa-portal. This is not a secret.

2. Confirm the production environment contains that exact value before implementation begins. The implementation must stop if it is absent or different.
3. Do not restart or republish the current deployment merely to activate it. It should become effective with the domain-migration Publish. Until then, the existing live process keeps its current environment.
4. Freeze household invitation creation during the final cutover window. This avoids generating links while DNS or the new deployment is in transition.

Why this is first: artifacts/api-server/src/routes/residents.ts fails closed when PORTAL_BASE_URL is unset and uses it for both the single-use link and Clerk invitation redirectUrl. The expected new link is:

https://app.madainvillagehoa.com/sign-up?invite=<encoded-token>

The checked-in .replit setting and invitation tests currently reference https://community-hub-portal.replit.app/hoa-portal and must be changed in the implementation batch.

## Phase 1 — Replit custom domain and DNS preparation

Complete this before the code cutover Publish so DNS and TLS are ready.

1. Open the existing published app in Replit.
2. Open Publishing → Domains → connect an existing domain.
3. Enter app.madainvillagehoa.com. Do not enter madainvillagehoa.com and do not change the apex or www records used by the public site.
4. Replit will provide the exact A and TXT records for this subdomain.
5. At the DNS provider for madainvillagehoa.com, add those exact records for host app.
6. Keep the TXT record permanently; Replit requires it for ownership and SSL renewal.
7. Wait for Replit to report the domain connected and TLS active. DNS propagation may take up to 48 hours.
8. Before cutover, verify HTTPS reaches the existing deployment. It may still use the old path at this point; that is acceptable preparation, not acceptance.

Do not create a CNAME or modify the bare-domain public-site records unless Replit explicitly supplies that record for the app subdomain. Use the records Replit displays.

## Phase 2 — implementation batch

### 2.1 Root portal mount

1. Change the shared public portal base contract from /hoa-portal to root. Remove the pathname-detection fallback that remounts the router under /hoa-portal.
2. Keep Vite BASE_PATH as /. Do not set it to /hoa-portal. Assets and same-origin API calls must remain root based.
3. Update the portal artifact registration/preview path through the artifact tooling so the portal is canonical at /. Keep the API artifact at /api.
4. Preserve SPA rewrites for browser routes while proving /api/* still reaches the API service.
5. Update route-contract tests and Playwright expectations to the root entry, /sign-in, /sign-up, and /portal.
6. Remove stale comments/docs that claim the public portal is mounted at /hoa-portal.

Expected source surfaces include lib/portal-paths/src/index.ts, artifacts/hoa-portal/src/lib/portal-paths.ts, route-contract tests, invitation tests, artifact registration, and checked-in environment documentation.

### 2.2 Canonical public-origin helper

Use one validated canonical public origin derived from PORTAL_BASE_URL rather than independently rebuilding production URLs from REPLIT_DOMAINS. Requirements:

- HTTPS in production.
- No query, fragment, credentials, or non-root pathname.
- Trailing slash normalized away.
- Fail closed where an externally delivered URL is required.
- Development-only localhost fallback remains explicit and cannot run in production.

Apply it to:

- household invitation links and Clerk invitation redirectUrl;
- payment return/callback URLs in PaymentCore and payment routes;
- Waha Pass and Waha Guest Day Pass public callback/return URLs;
- absolute links emitted in email templates, including announcement links.

Moyasar is not configured, so no provider webhook needs updating. When Moyasar is configured for the first time, enter exactly:

https://app.madainvillagehoa.com/api/payments/webhook

### 2.3 Old URL redirect

The old resident URL must redirect, not die.

Canonical redirect mappings:

- https://community-hub-portal.replit.app/hoa-portal/ → https://app.madainvillagehoa.com/
- .../hoa-portal/sign-in → .../sign-in
- .../hoa-portal/sign-up?invite=... → .../sign-up?invite=...
- .../hoa-portal/portal/... → .../portal/...
- https://app.madainvillagehoa.com/hoa-portal/... → the equivalent root path

Preserve query strings and fragments. Strip exactly one /hoa-portal prefix. Never redirect /api/*, /api/__clerk/*, health checks, or non-GET requests.

Preferred implementation is an HTTP 308 at the deployment/router layer. If Replit artifact routing cannot express host-aware redirects, use a minimal pre-Clerk browser canonicalization executed before Clerk initialization. In that fallback, acceptance must explicitly record that it is a browser redirect rather than an HTTP 308, and JavaScript-disabled clients will not redirect. Do not claim a 308 unless the network response proves it.

Keep the default Replit hostname attached so distributed old links continue reaching the redirect.

### 2.4 Clerk configuration

This app uses Replit-managed Clerk. Official Replit guidance says custom-domain origins, redirect URLs, proxy configuration, and Development/Production environment switching are managed automatically when the custom domain is attached.

Exact Clerk dashboard changes required: none.

Do not manually add allowed origins or redirect URLs and do not replace the managed Clerk keys. The production middleware already derives /api/__clerk from x-forwarded-host/Host, so it should use app.madainvillagehoa.com automatically.

The product owner action is therefore verification, not configuration:

1. Attach the domain in Replit.
2. Publish using Replit-managed production Clerk keys.
3. Verify /api/__clerk requests use app.madainvillagehoa.com.
4. Verify signed-out entry, sign-in, sign-up, sign-out, and return-to-dashboard on the custom domain.

If any host is rejected, stop and diagnose the managed Replit Clerk integration; do not guess dashboard allowlist entries. Current Clerk dashboard access for this workspace reports that personal Replit Pro would be required, but no dashboard host change is expected for this migration.

### 2.5 OpenAPI, CORS, email, and mobile/deep links

OpenAPI:
- lib/api-spec/openapi.yaml already uses relative server URL /api. Keep it relative.
- Regenerate/check generated clients only if route metadata changes; no absolute hostname should be introduced.

CORS:
- Current API CORS is origin:true with credentials and contains no old hostname. It will not block the new domain.
- Do not combine CORS hardening with this migration. Native clients and Replit previews need separate origin/no-Origin analysis; changing it here increases cutover risk.
- Verify the custom-domain same-origin API flow and record that no host-specific CORS value remains.

Email templates:
- Replace relative browser links such as /portal/announcements with absolute URLs built from the canonical public origin.
- Search rendered notification payloads and templates for replit.app, REPLIT_DOMAINS-derived browser URLs, and /hoa-portal.

Mobile configuration:
- Production EXPO_PUBLIC_DOMAIN must be app.madainvillagehoa.com.
- Change production build precedence so REPLIT_INTERNAL_APP_DOMAIN or REPLIT_DEV_DOMAIN cannot override the explicit production API domain. Development may continue using Replit dev hosts.
- Replace the expo-router origin https://replit.com/ with https://app.madainvillagehoa.com for production configuration.
- Keep native Clerk callback scheme hoa-mobile:// and package identifiers unchanged. The web-domain migration does not add universal links. iOS associatedDomains and Android intent filters remain separate future work.
- Verify authenticated document downloads and all mobile API helpers use the same final API origin.

## Phase 3 — implementation verification before Publish

Run one coherent verification pass:

1. Portal and API type checks.
2. Full portal and API unit suites.
3. Route-contract tests for root mount and old-path canonicalization.
4. Household invitation tests proving exact custom-domain root URL and fail-closed behavior when PORTAL_BASE_URL is absent.
5. Payment/Waha callback URL tests proving app.madainvillagehoa.com and no REPLIT_DOMAINS production fallback.
6. OpenAPI test proving server URL remains /api.
7. Static host scan across active source/config/build output. Allow only intentional legacy redirect fixtures and development-only Replit variables.
8. Production build inspection proving asset URLs use / and API URLs use /api.
9. Confirm no migration/schema/database operation is required.

A root-mount candidate is not accepted merely because the homepage renders. It must prove deep-route refreshes, API routing, Clerk proxy routing, and old-path redirects.

## Phase 4 — cutover order

1. Product owner confirms production PORTAL_BASE_URL is exactly https://app.madainvillagehoa.com.
2. Product owner confirms Replit custom domain is connected and TLS active.
3. Agent completes the implementation batch and all pre-Publish checks.
4. Review a checkpoint/diff containing the entire routing-domain batch.
5. Publish the updated deployment once.
6. Do not generate household invitations during the short verification window.
7. Run the live verification matrix below.
8. If all checks pass, release the invitation freeze and use the custom domain publicly.
9. Configure Moyasar later with the final webhook URL only; there is no old webhook to update.

If a launch-critical check fails, roll back the whole checkpoint and restore the previous deployment and PORTAL_BASE_URL together. DNS may remain attached while rollback is investigated, but it must not be announced as the resident entry URL.

## Phase 5 — live verification matrix

### Signed-out entry
- Open https://app.madainvillagehoa.com/ in a fresh browser context.
- Confirm the portal landing page renders and no /hoa-portal path appears.
- Refresh /sign-in and a protected /portal deep route directly.
- Confirm protected routes lead to sign-in without a blank screen or loop.

### Clerk sign-in
- Sign in with an existing Production test user.
- Confirm Clerk frontend requests use https://app.madainvillagehoa.com/api/__clerk.
- Confirm successful return to https://app.madainvillagehoa.com/portal.
- Sign out and sign in again.
- Confirm no unrecognised-domain, redirect mismatch, cookie, or CORS errors.

### Invitation generation and follow-through
- Create one disposable household invitation through the real admin flow.
- Inspect the generated/copied URL and Clerk invitation redirectUrl. Both must start https://app.madainvillagehoa.com/sign-up?invite=.
- Open the link in a fresh signed-out context.
- Complete or safely stop before consuming the token according to the fixture plan.
- Confirm validation requests go to https://app.madainvillagehoa.com/api and the browser never visits the Replit host.
- Confirm PORTAL_BASE_URL unset/mismatch tests continue to fail closed.

### Legacy redirects
- Test old homepage, sign-in, sign-up with query token, and a /portal deep route.
- Confirm final custom-domain paths, query/fragment preservation, no loop, and no Clerk initialization on the old host before redirect.
- Record HTTP status when available. If fallback browser canonicalization is used, label it accurately.

### No stale host emissions
Capture network traffic and scan source/build/runtime output for:

- community-hub-portal.replit.app
- /hoa-portal
- REPLIT_DOMAINS used to build production external URLs
- REPLIT_DEV_DOMAIN or REPLIT_INTERNAL_APP_DOMAIN in production mobile output
- https://replit.com/ as Expo Router origin

Allowed exceptions must be limited to legacy redirect tests/config and development-only tooling. No invitation, email, payment/pass callback, OpenAPI response, mobile production request, Clerk request, or browser navigation may emit the old Replit host.

### Public site isolation
- Confirm https://madainvillagehoa.com and any existing www host are unchanged.
- Confirm only app.madainvillagehoa.com is attached to this Replit deployment.

## Acceptance criteria

The migration is accepted only when:

1. Root mount works at https://app.madainvillagehoa.com/.
2. PORTAL_BASE_URL is confirmed exact before Publish and invitations use it.
3. Replit-managed Clerk signs in successfully on the custom host with no manual dashboard changes.
4. /api and /api/__clerk route correctly and are not swallowed by the SPA.
5. Old resident browser URLs redirect to the correct root equivalents.
6. Email, payment/pass callbacks, OpenAPI, and mobile production configuration contain no stale production host.
7. Bare madainvillagehoa.com remains untouched.
8. Evidence is published as individual GitHub files with byte-verified hashes.

## Explicitly out of scope

- Configuring Moyasar itself or updating an existing webhook; none exists.
- Changing the bare-domain public site.
- Adding native universal links/app links.
- General CORS hardening.
- Schema, database, or migration changes.
- Native mobile sign-in acceptance, which remains product-owner real-device UAT.
