# N1 Source Change Inventory

## New core modules

- artifacts/api-server/src/lib/settings.ts
- artifacts/api-server/src/lib/notificationProducer.ts

## Delivery and settings

- artifacts/api-server/src/lib/email.ts
- artifacts/api-server/src/lib/notificationService.ts
- artifacts/api-server/src/routes/communications.ts
- artifacts/api-server/src/routes/admin.ts
- artifacts/api-server/src/routes/users.ts

## X3 producers

- artifacts/api-server/src/routes/units.ts
- artifacts/api-server/src/routes/permits.ts
- artifacts/api-server/src/routes/bookings.ts
- artifacts/api-server/src/routes/vehicles.ts
- artifacts/api-server/src/routes/wahaPasses.ts
- artifacts/api-server/src/routes/communications.ts
- artifacts/api-server/src/routes/portalHelp.ts
- artifacts/api-server/src/routes/announcements.ts

## Admin UI

- artifacts/hoa-portal/src/pages/portal/admin.tsx
- artifacts/hoa-portal/src/lib/translations.ts

## New focused tests

- artifacts/api-server/src/__tests__/settingsSecurity.test.ts
- artifacts/api-server/src/__tests__/emailSecurity.test.ts
- artifacts/api-server/src/__tests__/notificationProducer.test.ts

Existing route and dashboard tests were updated to assert persisted delivery rather than immediate SMTP/push calls.
