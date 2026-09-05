# Round 2 Remaining Items — Real Browser Walkthrough

- Date: 2026-09-05 (Asia/Riyadh)
- Environment: Development only
- Authentication: real Development Clerk sessions
- Method: one persistent Playwright browser walkthrough with isolated resident, administrator, owner-claimant, tenant-claimant, and signed-out contexts
- E2E workflow: not started
- Production: not accessed

## Results in required order

| Item | Result | Browser evidence |
|---|---|---|
| D-2 | PASS | Unit Registry displayed full canonical Building A – 14; registered vehicle showed A14 lot. Screenshots ej9dfb, swkkqf. |
| D-6 | PASS | Household resident cards visibly showed Portal access / No portal access and Active WAHA credential. Screenshot 3h3ujz. |
| D-5 | PASS after browser-found fix | Future DOB displayed the exact error and Add to Household stayed disabled; zero resident row created. Screenshot ujli02. |
| D-4 | PASS | Single X closed the resident form; reopening showed blank/reset fields. Screenshots fn94d9, stnm94. |
| C-1 | PASS | Nationality was absent from resident and tenant forms. Screenshots 3le6v2, s8gde7. Historical nullable column retained for compatibility. |
| D-1 PDF | PASS after browser-found fixes | Authenticated inline application/pdf response; in-app one-page viewer displayed readable marker pixels. Screenshot 0kjutk. |
| D-1 DOCX | PASS after browser-found fixes | Authenticated inline text/html conversion; sandboxed preview displayed readable marker text. Screenshot 395836. |
| D-1 image | PASS after browser-found fixes | In-app image preview displayed readable PNG marker. Screenshot qche8h. |
| Resident document refusal | PASS | View-only cards exposed only View controls; no upload/add/edit/delete controls. Screenshot ixxq77. |
| C-3 tenant form | PASS | Tenant verification contained no parking confirmation/declaration. Screenshot twfert. |
| C-3 vehicle UI | PASS | Vehicle card showed A14-U01 Underground; selector offered only the unit-owned underground and surface lots. Screenshots geac8n, 0ki01o. |
| Foreign parking refusal | PASS | Foreign lot absent from selector; API returned PARKING_LOT_NOT_IN_UNIT; zero vehicle row created. Screenshot 6sjcwq. |
| D-3 | PASS | Owner name came from authenticated account and was read-only; no duplicate editable name entry. Screenshot dqz479. |
| C-2 invalid deed refusal | PASS | Four-digit deed kept submission disabled; API refused non-16-digit input and created no verification row. Screenshot b5gy06. |
| C-2 valid deed | PASS | Exact 16-digit text with leading zeroes submitted and appeared in pending review; no upload control. Screenshots tw0ri8, 6otuhu. |
| C-2 Mullak basis | PASS | Current approval basis was Deed number verified against Mullak; obsolete title-deed-reviewed basis absent. Screenshot 6otuhu. |
| C-4 Back refusal | PASS | Exact outgoing message confirmation displayed Send and Back. Back returned to editor and DB remained pending with no response/event. Screenshots mrab3t, 96n804. |
| C-4 Send | PASS | Second confirmation sent once; only tagged communication resolved with exact response. Screenshots ux2uqe, ud8ine. |
| C-5 | PASS | Needs your attention / action queues visibly separated from management tools. Screenshot 7us4zx. |
| C-6 | PASS after browser-found fix | Fresh signed-out footer contained no Admin Login, administrator-access text, or /admin link; resident sign-in remained. Screenshot jp1q3o. |
| Disclaimer | PASS | Exact mandated English and Arabic text rendered. Screenshots 3w4m1t, u2jidj. |
| HOA COMMON refusal | PASS | Unit Registry contained no HOA COMMON entry. Screenshots ej9dfb, jqtk5e. |

## Deliberate refusals

1. Resident upload/delete: refused by absence of management controls.
2. Invalid deed number: refused in UI and API; no row created.
3. Future DOB: refused at control and submit boundary; no row created.
4. Foreign parking lot: unavailable in UI and explicitly refused by API; no row created.
5. Back to message: performed no send and no database/event mutation.
6. HOA COMMON: absent from Unit Registry.

## Browser-found blockers corrected during the pass

- DOB warning could be shown while malformed browser date normalization still allowed submission. Strict portal and API validation now guard the mutation boundary.
- Document replacement discarded MIME type and size. Replacement requests now preserve metadata and the API rejects incomplete replacement metadata.
- Resident document cache could reuse stale metadata across identity changes. Document/folder query keys are identity-scoped and the preview can infer content type from the authenticated response.
- DOCX conversion exceeded the artifact request window because the generic object path performed metadata/ACL round trips. View-only DOCX now uses one authorized private-object read before conversion.
- A footer Admin Login link remained after the top-level link was removed. The footer link is now removed.

## Boundaries

No physical/native-only behavior was claimed. No E2E suite ran against Development. No Production access, deployment, db:push, forced push, or migration runner was used.
