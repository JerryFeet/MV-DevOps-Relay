# Madain Village Community Management Platform — System Blueprint

**Generated:** 2026-08-24  
**Authority:** Current repository source, not a revision of the 2026-08-18 blueprint.  
**Scope:** Development architecture and schema intent. This document does not claim that development migrations have been applied to production, and it does not authorize deployment.

## 1. System at a Glance

Madain Village is a bilingual English/Arabic community-management platform. It is a pnpm workspace with three runtime artifacts:

| Artifact | Technology | Responsibility |
| --- | --- | --- |
| `artifacts/api-server` | Express 5, TypeScript | REST API, authorization, lifecycle logic, PostgreSQL access, schedulers, payments, notifications, storage policy |
| `artifacts/hoa-portal` | React, Vite, Wouter | Web portal for residents, administrators, and gate staff |
| `artifacts/hoa-mobile` | Expo, React Native, Expo Router | Mobile resident portal and authenticated document access |

Shared packages include the Drizzle/PostgreSQL schema (`lib/db`), OpenAPI-generated client/schema packages, and supporting workspace libraries. Clerk authenticates users; the API maps the Clerk identity to a platform `users` row through `POST /api/users/me/sync`.

The API is mounted under `/api`. Clerk middleware is global, but authentication is deliberately required per protected route. Public endpoints omit `requireApiAuth`; authorization and ownership/verification checks are made in route handlers.

## 2. Identity, Roles, and Authorization

### 2.1 Current role model

The only database roles are:

| Role | Current authority |
| --- | --- |
| `admin` | Full administration, the sole approval role, release execution, user/system configuration |
| `owner` | Verified resident with unit-owner actions, tenant decisions, resident services, and ownership-change initiation for their own unit |
| `tenant` | Resident services when verified; cannot initiate ownership transfer or decide a tenant verification |
| `guard` | Gate and restricted staff actions; not an approver and not a resident-service user |

There is no `approver` database role and no `supervisor` role. Shared API groups are `STAFF_ROLES = [admin, guard]`, `APPROVER_ROLES = [admin]`, and `GATE_ROLES = [admin, guard]` (`artifacts/api-server/src/lib/roles.ts`).

### 2.2 User and verification state

`user_status`: `active`, `pending`, `suspended`.

`user_verification_status`: `unverified`, `pending_manual`, `pending_owner_approval`, `verified_owner`, `verified_tenant`, `linkage_ended`, `pre_approved`, `verified_household_member`.

Verification is independent of role. A user’s role and verified linkage jointly determine access. The client has a single-flight per-Clerk-ID profile synchronization path and a visible bootstrap gate so a signed-in resident does not receive a blank portal while first-sign-in provisioning is pending or retrying.

### 2.3 Unit verification

An owner can be auto-matched to the unit registry or submit a manual title-deed path. A tenant submits a tenancy request with Ejar information; only the verified unit owner can approve or reject that request. An administrator cannot make the tenant decision. Verification operations enforce document/PII ownership checks and preserve a separate audit/cleanup-retry record for uploads.

## 3. Data Model

All tables below are exported by `lib/db/src/schema/index.ts`; each has a serial `id` primary key. The column lists are current Drizzle property names.

### 3.1 Identity, units, and verification

| Table | Current columns |
| --- | --- |
| `users` | `id`, `clerkId`, `email`, `firstName`, `middleName`, `lastName`, `phone`, `phoneNormalized`, `unitNumber`, `unitId`, `nationalId`, `role`, `status`, `verificationStatus`, `createdAt`, `updatedAt` |
| `units` | `id`, `building`, `unitNumber`, `normalisedUnitNumber`, `isSystem`, `floor`, `unitType`, `sizeSqm`, `titleReference`, `verifiedOwnerId`, `verifiedTenantId`, `preApprovedClaimId`, `occupantType`, `emergencyContact`, `emergencyPhone`, `preferredContact`, `mailingAddress`, `notes`, `ownerNationalId`, `parkingLots`, `createdAt`, `updatedAt` |
| `unit_registry` | `id`, `building`, `unitNumber`, `ownerNationalId`, `ownerName`, `unitType`, `sizeSqm`, `titleReference`, `isMatched`, `matchedUserId`, `importBatch`, `createdAt` |
| `unit_verifications` | `id`, `type`, `userId`, `unitId`, `nationalId`, `documentNote`, `ejarReference`, `ejarDocumentKey`, `leaseStartDate`, `leaseEndDate`, `status`, `reviewedById`, `reviewNote`, `expiresAt`, `firstName`, `middleName`, `lastName`, `mobile`, `ownerNationalId`, `parkingLots`, `titleDeedKey`, title-deed metadata and decision fields, Ejar metadata, cancellation/routing fields, `createdAt`, `updatedAt` |
| `unit_verification_owner_id_attempts` | `id`, `userId`, `unitId`, `verificationId`, `ownerNationalId`, `createdAt` |
| `unit_verification_document_cleanup_retries` | `id`, `verificationId`, `documentType`, `storageKey`, `attempts`, `nextAttemptAt`, `lastError`, `cleanedAt`, `createdAt`, `updatedAt` |
| `parking_lots` | `id`, `unitId`, `building`, `lotNumber`, `parkingType`, `active`, `source`, `sourceReference`, `createdAt`, `updatedAt` |
| `data_migration_corrections` | `id`, `entityType`, `sourceReference`, `issueCode`, `rawPayload`, `details`, `status`, `resolvedAt`, `resolvedById`, `createdAt`, `updatedAt` |

### 3.2 Residents, tenancy, and terminal release

| Table | Current columns |
| --- | --- |
| `residents` | `id`, `type`, name/contact/identity fields, `unitNumber`, `unitId`, `relationship`, `idPhotoKey`, `hasPortalAccess`, `linkedUserId`, `registeredById`, `status`, timestamps |
| `household_invitations` | `id`, `unitId`, `unitNumber`, `invitedEmail`, `token`, `createdByUserId`, `residentId`, `status`, `usedAt`, `expiresAt`, `createdAt` |
| `tenancy_lifecycles` | `id`, `unitId`, `tenantUserId`, `verificationId`, lease dates, `status`, release reason/evidence/request fields, suspension/expiry/release timestamps, `releaseOperationId`, `auditTrail`, timestamps |
| `tenancy_renewals` | `id`, `lifecycleId`, `unitId`, `tenantUserId`, proposed lease dates, Ejar reference/key, decision/cancellation fields, timestamps |
| `move_forms` | `id`, `userId`, `type`, `scheduledDate`, `unitNumber`, `notes`, `status`, `reviewedById`, `reviewNote`, `revocationProcessedAt`, timestamps |
| `release_operations` | `id`, `unitId`, `userId`, `kind`, `outcome`, `idempotencyKey`, `createdAt` |
| `external_identity_deletion_jobs` | `id`, `operationId`, `externalUserId`, `status`, `attemptCount`, `nextAttemptAt`, `lastError`, timestamps |
| `ownership_change_events` | `id`, `unitId`, `unitNumber`, `initiationType`, outgoing-owner snapshot fields, incoming-owner identity/proof fields, review/rejection fields, `newOwnerUserId`, timestamps |

### 3.3 Facilities, booking, permits, and payments

| Table | Current columns |
| --- | --- |
| `facilities` | `id`, `name`, `description`, `pricePerHour`, `maxCapacity`, `imageUrl`, `isActive`, weekday/weekend hours, slot interval, min/max duration, cleaning buffer, approval/movie/capacity/pricing configuration, timestamps |
| `bookings` | `id`, `facilityId`, `userId`, `unitId`, `startTime`, `endTime`, `status`, `totalAmount`, payment fields, hold expiry, facility/movie snapshots, `notes`, timestamps |
| `permits` | `id`, user/unit identifiers, `type`, description/dates/status/review fields, fee/deposit/payment fields, moving-company/elevator fields, renovation fields, vehicle fields, timestamps |
| `payment_attempts` | `id`, `purpose`, `subjectType`, `subjectId`, `userId`, `unitId`, `provider`, provider charge/callback identifiers, amount/currency/status, confirmation/terminal fields, timestamps |

### 3.4 Documents, communications, and knowledge

| Table | Current columns |
| --- | --- |
| `document_folders` | `id`, `name`, `nameAr`, `defaultVisibility`, `defaultDownloadMode`, `sortOrder`, `isActive`, `isTriage`, timestamps |
| `documents` | `id`, title/description/category/file metadata, `isPublic`, `uploadedById`, `folderId`, `visibility`, `downloadMode`, archive/replacement fields, timestamps |
| `announcements` | `id`, English/Arabic title/body variants, public/pinned/status flags, author/publication/expiry/deletion fields, timestamps |
| `announcement_edit_history` | `id`, `announcementId`, `editedBy`, `editedAt`, `changeSummary`, `wasFlaggedMaterial` |
| `communications` | `id`, `userId`, `type`, `subject`, `body`, `status`, `adminNote`, timestamps |
| `ai_knowledge_documents` | `id`, `filename`, `mimeType`, `uploadedById`, `createdAt` |
| `ai_knowledge_chunks` | `id`, `documentId`, `filename`, `chunkIndex`, `content`, `embedding`, `createdAt` |
| `hoa_settings` | `id`, `key`, `value`, timestamps |

### 3.5 Guests, vehicles, passes, and notifications

| Table | Current columns |
| --- | --- |
| `guests` | `id`, `residentId`, identity/vehicle/visit fields, `status`, timestamps |
| `guest_passes` | `id`, `passUuid`, `verificationToken`, guest/resident references, guest and visit snapshots, `status`, approval/revocation fields |
| `guest_pass_verification_logs` | `id`, `passId`, `verificationTime`, `result`, `securityGuardId`, `notes` |
| `guest_entry_exit_logs` | `id`, `passId`, `eventType`, `eventTime`, `securityGuardId`, `notes` |
| `vehicles` | `id`, user/unit references, vehicle/registration/parking fields, review status/reason fields, timestamps |
| `waha_pass_applications` | `id`, `unitId`, `applicantUserId`, `secondResidentId`, `occupancyTrack`, `status`, review fields, timestamps |
| `waha_pass_credentials` | `id`, `applicationId`, `credentialIndex`, `passNumber`, `verificationToken`, holder fields, lifecycle/replacement/payment fields |
| `waha_pass_events` | `id`, `applicationId`, `credentialId`, `eventType`, `actorUserId`, `notes`, `createdAt` |
| `waha_guest_day_passes` | `id`, unit/date/guest-count/payment fields, purchaser/issue/token/revocation fields, `createdAt` |
| `notification_preferences` | `id`, `userId`, `announcements`, `bookings`, `guestPasses`, timestamps |
| `notification_events` | `id`, event/idempotency/recipient/channel/locale/payload/preference/status/retry/delivery fields, timestamps |
| `push_tokens` | `id`, `userId`, `token`, `deviceId`, timestamps |

### 3.6 Current enums

- `user_role`: `owner`, `tenant`, `admin`, `guard`
- `user_status`: `active`, `pending`, `suspended`
- `user_verification_status`: `unverified`, `pending_manual`, `pending_owner_approval`, `verified_owner`, `verified_tenant`, `linkage_ended`, `pre_approved`, `verified_household_member`
- `booking_status`: `pending`, `pending_payment`, `confirmed`, `cancelled`, `completed`
- `booking_payment_status`: `unpaid`, `paid`, `refunded`, `waived`, `not_required`, `failed`, `expired`
- `move_type`: `move_in`, `move_out`; `move_form_status`: `pending`, `approved`, `rejected`, `completed`
- `permit_status`: `draft`, `submitted`, `under_review`, `approved`, `approved_with_conditions`, `rejected`, `in_progress`, `completed`, `deposit_refunded`, `deposit_forfeited`
- `permit_type`: `move_in`, `move_out`, `renovation`, `additional_vehicle`
- `permit_payment_status`: `unpaid`, `paid`, `refund_pending`, `refunded`, `forfeited`
- `renovation_scope`: `cosmetic`, `structural`, `plumbing_electrical`, `exterior_affecting`, `kitchen_bathroom`
- `resident_type`: `owner`, `tenant`, `family`; `resident_status`: `active`, `inactive`, `moved_out`
- `vehicle_status`: `active`, `inactive`, `pending_approval`; `parking_type`: `underground`, `surface`
- `occupant_type`: `owner_occupied`, `tenant_occupied`, `vacant`
- `guest_status`: `pending`, `approved`, `denied`, `checked_in`, `checked_out`; `guest_pass_status`: `approved`, `expired`, `revoked`
- `verification_type`: `owner_manual`, `tenant_request`; `verification_status`: `pending`, `approved`, `rejected`, `expired`, `cancelled`
- `data_correction_status`: `open`, `resolved`, `ignored`; `household_invitation_status`: `pending`, `accepted`, `revoked`
- `payment_attempt_status`: `pending`, `confirmed`, `failed`, `cancelled`, `expired`, `rejected`
- `ownership_change_initiation_type`: `path_a`, `path_b`; `ownership_change_status`: `pending`, `approved`, `rejected`, `completed`
- `waha_pass_application_status`: `pending_review`, `active`, `revoked`, `rejected`
- `waha_pass_occupancy_track`: `owner`, `tenant`
- `waha_pass_credential_status`: `active`, `suspended`, `revoked`, `lost`, `stolen`, `damaged`
- `waha_pass_event_type`: `applied`, `approved`, `rejected`, `revoked`, `lost_reported`, `replacement_paid`, `replacement_issued`, `resident_archived`

Key integrity controls include unique Clerk IDs, normalized unit numbers, folder names, guest/Waha pass tokens, invitation tokens and a partial pending-per-unit invitation uniqueness rule, payment provider identifiers, verification partial uniqueness, release idempotency indexes, and facility operating/duration checks. The schema has one explicit Drizzle foreign key (`documents.folder_id → document_folders.id`); relationship columns elsewhere are integer IDs with application-level integrity enforcement.

## 4. Release Engine and Tenancy Lifecycle

`releaseSubject` is the common terminal release engine for tenant and owner subjects triggered by a move-out form, tenancy expiry, or ownership change. It locks the subject/unit/trigger, rejects system units and invalid/mismatched active linkages, uses an idempotency key, and can return a deterministic dry-run plan before destructive execution.

### Required postconditions

The engine verifies:

1. terminal unit linkage and occupant state;
2. subject user deletion with booking user references detached;
3. Waha applications and credentials revoked, with audit events appended;
4. residents marked `moved_out`;
5. future non-cancelled bookings cancelled while historical booking/unit attribution remains;
6. immutable release operation and external Clerk-deletion job records created;
7. the initiating move-out, ownership event, or tenancy lifecycle marked terminal.

Execution also revokes future day passes, anonymizes dependent PII, clears user foreign-key references, removes push tokens/preferences, and writes the mandatory move-out access-deactivated notification before deleting the account.

### Tenancy expiry and renewal

- Renewal opens 60 days before lease end and requires new chronological lease dates plus an Ejar reference.
- The unit owner, never the tenant or administrator, decides a pending renewal.
- Approval restores active status, dates, user access, and tenant Waha credentials.
- Lease expiry is evaluated on Saudi local date. It suspends the tenant and tenant Waha access on day zero; it does not delete immediately.
- A pending renewal keeps the lifecycle suspended until the owner decision. Without a pending renewal, an expiry/deletion notice is mandatory and the configured deletion delay defaults to 30 days, with reminders at 14/7/1 days.
- Admin release is limited to a release-requested or expired case and delegates to the same release engine.

## 5. HOA COMMON and Booking Admission

`HOA COMMON` is a system (`isSystem`) unit used only for internal booking attribution. It is excluded from ordinary unit lists and registry operations, cannot be resident-claimed, cannot be released, and must be present for an administrator booking; the API fails explicitly if it is missing.

Residents require an active linked unit and active Waha credential to create a booking. Administrators are exempt from the Waha requirement and use the exact system unit. Booking admission enforces facility activity, advance window (14 days by default; administrator exempt), operating hours/slot grid, duration, cleaning buffers, household daily limits, and facility pricing. A per-facility advisory transaction lock prevents buffered-overlap races. Paid resident bookings reserve a `pending_payment` hold (15 minutes by default); free or administrator bookings confirm directly and administrator payment is waived.

## 6. Payments

The payment provider contract is:

```text
createCharge(amount, currency, description, callback, metadata, customer)
verifyCharge(chargeId) → paid | failed | pending
```

The purpose registry contains `facility_booking`, `guest_day_pass`, and `waha_replacement`, with extensible handlers/pricing resolvers. Facility price is supplied by admission logic; day passes require 1–10 guests and use the configured price; replacement uses its configured price. Invalid/missing configuration fails closed.

Moyasar is the production provider and is selected only with its configured key. The deterministic provider is limited to non-production test mode. Unsupported or unconfigured provider selection produces a `PaymentConfigurationError`, not a simulated charge. Provider callbacks enter one registered purpose handler; no live payment credential or provider action is represented by this blueprint.

## 7. Documents and Object Storage

Document folders set a database-enforced minimum visibility:

```text
all_portal_users < verified_owners < admin_only
```

Resident-personal content is uploader/admin only. Inactive, triage, empty, owner-only, or admin-only folders are hidden as appropriate. A document can be tightened above the folder floor; loosening a folder never silently lowers its document overrides. Tightening cascades documents upward in the same transaction. Archived documents are omitted.

All document create/upload/edit/replace/delete actions are administrator-only. Downloads repeat the visibility check, use private `/objects/...` storage, are view-only with `no-store`, and legacy external URLs return `410`.

Authenticated uploads use presigned URLs, MIME/size validation, canonical private namespaces, and short-lived URLs. Public assets are served separately under `/api/storage/public-objects/*filePath`.

## 8. Notifications and Schedulers

Notification intent is persisted idempotently before dispatch. Each X3 event has Arabic-default and explicit-English copy, email and push delivery, locale selection, retry state, and preference handling. Mandatory events bypass preferences.

| X3 event | Meaning |
| --- | --- |
| 1 `UNIT_VERIFICATION_DECISION` | Unit verification decision |
| 2 `PERMIT_DECISION` | Permit decision/status |
| 3 `BOOKING_STATUS_CHANGE` | Booking confirmation/cancellation |
| 4 `VEHICLE_DECISION` | Additional vehicle decision |
| 5 `WAHA_PASS_DECISION` | Waha decision/revocation |
| 6 `GUEST_DAY_PASS_ISSUED` | Day pass issued after payment |
| 7 `COMMUNICATIONS_REPLY` | HOA communication reply |
| 8 `ANNOUNCEMENT_PUBLISHED` | Publication/re-publication |
| 9 `TENANCY_REQUEST_SUBMITTED` | Mandatory tenant request submission |
| 10 `TENANCY_REQUEST_APPROVED` | Owner approves tenant linkage |
| 11 `TENANCY_REQUEST_DECISION` | Tenant linkage rejection/cancellation |
| 12 `MANDATORY_TENANCY_NOTICE` | Non-suppressible expiry/deletion warning |
| 13 `TENANCY_RELEASE_REQUESTED` | Tenant requests release |
| 14 `TENANCY_RENEWAL` | Renewal reminder/submission/decision |
| 15 `MOVE_OUT_ACCESS_DEACTIVATED` | Access deactivation on move-out |
| 16 `TENANCY_ACCESS_SUSPENDED` | Lease-expiry suspension |

Server startup starts the move-out, ownership-change, booking-payment-hold, notification-dispatch, external-identity-deletion, and tenancy-lifecycle schedulers. Payment holds run immediately then every 60 seconds; notification dispatch runs immediately then every 30 seconds; external identity deletion runs every 60 seconds; tenancy lifecycle runs immediately then daily; move-out runs at next UTC midnight then daily.

## 9. API Route Map and Effective Guards

All paths are prefixed `/api`. `P` means public; `A` means authenticated; role, verified-state, ownership, and unit scope are handler-enforced after authentication.

| Domain | Routes | Effective guard |
| --- | --- | --- |
| Health/gate verification | `GET /healthz`, `GET /verify`; `GET /verify/waha` | P; A + gate role |
| Users/gate | `/users/me` GET/PUT, `/users/me/name` PATCH, `/users/me/sync` POST; `/users`, `/users/:id` GET/PATCH; `/gate/residents`, `/gate/move-out-status` GET | A; admin for management; gate role for gate reads |
| Admin | `/admin/summary`, `/admin/historical-records`, `/admin/units/full`, `/admin/units/:unitId/registry-check` GET | A + admin |
| Announcements | `/announcements` and `/:id` GET; templates GET; create/AI/PATCH/DELETE mutations | Public reads; admin mutation/template access |
| Facilities | `/facilities`, `/:id`, `/:id/availability` GET; audit GET; create/PATCH/DELETE | Public reads; admin audit/mutations |
| Bookings | `/bookings`, `/bookings/config`, `/:id` GET; create/PATCH/cancel/confirm | A; owner scope, verified-state, role and state/time guards |
| Move forms/permits | CRUD/status routes under `/move-forms`, `/permits` | A; owner/tenant scope; admin is sole approver |
| Documents | `/storage/upload`, `/document-folders`, `/documents`, replacement/download/archive routes | A; visibility floor; administrator mutation |
| Residents/invitations | resident CRUD, photo, invite, self routes; `/invitations/validate` | A and owner/admin/self scope; invite validation P |
| Units/verification/parking | unit CRUD, owner/tenant verification, decision, documents, operations, parking, correction routes | A; unit ownership/administrator/gate operations as applicable |
| Guests/gate passes | guest CRUD, guest pass reads/revoke, `/security/gate/*` | A; owner/admin scope; gate actions require gate role |
| Waha/day passes | eligibility, apply/mine/assign/lost/replacement, admin decision/revoke, day-pass routes | A; verified resident ownership; admin sole approver; gate policy for verification |
| Communications/settings | communications mine/list/update; public settings GET; settings mutation/test email | A caller/admin scope; settings GET P |
| AI | status, knowledge CRUD, chat | A; knowledge admin-only; chat caller-context controlled |
| Payments | deterministic checkout GET/POST and webhook; create/verify/history/retry/attempts | Public checkout/webhook; A ownership-scoped payment operations |
| Push/preferences/storage | push-token POST/DELETE, preferences GET/PATCH, presigned URL POST, public objects GET | A except public-object reads |
| Ownership changes | proof upload, mine, create, claim, list, review | A; verified non-staff owner actions; admin list/review |
| Tenancy/release | mine/release request/renewals, owner decision, admin cases/plan/execute, deletion-job retry | A; tenant/owner self scope; administrator release and job operations |

## 10. Portal and Mobile Surface

The web portal provides public landing/auth/payment routes, signed-in resident routes for announcements, facilities, permits, documents, residents, guests, vehicles, verification, communications, AI, payments, maintenance, Waha, and ownership change; administrator-only management/historical routes; and a gate route for `admin` and `guard`. The role gate waits in a neutral state before rendering restricted content. Legacy move-form navigation redirects to permits.

The Expo application provides sign-in/sign-up, dashboard, announcements, bookings, chat, communications, documents, guests, permits, profile, vehicles, Waha Pass, and unit verification routes. Mobile document download uses the authenticated document-download contract rather than an unauthenticated external URL.

## 11. Operational Boundaries

- Development migrations are represented by schema and repository migration files through `0037_stage6b_tenancy_lifecycle.sql`; the repository has no checked-in live migration ledger.
- Deployment remains prohibited pending the consolidated manual UAT and management sign-off.
- The direct App Storage enumeration and manual UAT checklist are separate evidence records in `evidence/go-live/`.

## 12. Source Index

- Schema: `lib/db/src/schema/*.ts`
- API route registration: `artifacts/api-server/src/routes/index.ts`
- Authorization: `artifacts/api-server/src/lib/roles.ts`
- Release/tenancy: `artifacts/api-server/src/lib/releaseSubject.ts`, `tenancyLifecycle.ts`
- Payments: `artifacts/api-server/src/payments/*`
- Documents/storage: `artifacts/api-server/src/routes/documents.ts`, `storage.ts`, `lib/objectStorage.ts`
- Notifications/schedulers: `artifacts/api-server/src/lib/notification*.ts`, scheduler modules, `artifacts/api-server/src/index.ts`
- Web routes: `artifacts/hoa-portal/src/App.tsx`
- Mobile routes: `artifacts/hoa-mobile/app/`