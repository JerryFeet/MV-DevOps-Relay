# Round 3 Section 4 — post-fix delivery summary

## Delivered behavior

- Owner-workflow parking stored in legacy `units.parking_lots` is materialized
  into normalized parking rows before vehicle selection.
- The normalized row is used because vehicle assignment requires a persistent
  parking-lot identity and vehicle history must retain lot number/type display.
- Multiple vehicles may share one registered lot. Vehicle creation and admin
  parking correction routes no longer compare vehicle count to lot count.
- Istimara is absent from resident vehicle registration and display.
- The vehicle dialog preserves state on outside click and Escape; it closes
  through the X control.
- Owners must explicitly choose either parking registration or “No parking
  lot.” Parking options show lot number and underground/surface type.
- Tenants are not asked to declare parking again.
- Vehicle cards use the API-enriched assigned lot, including historical lots
  no longer present in the active selector.

## Permanent browser evidence

The dedicated Section 4 Clerk identity receives a fresh non-system unit per
test/retry. Historical fixture vehicles remain as inactive records; setup
refuses unmarked active/pending rows.

All six explicit Section 4 journeys pass:

1. Legacy owner-workflow lot is selectable with lot number/type.
2. Istimara is absent.
3. Outside click preserves dialog state.
4. Two vehicles share one lot and display its type.
5. Owner registration requires an explicit parking decision and exposes “No
   parking lot.”
6. Tenant registration contains no parking declaration.

## Final gates

- Portal typecheck: passed.
- Focused Section 4 API: 71 passed, zero failed.
- Focused Section 4 Playwright: 9 passed, zero failed.
- Named Round 3 Playwright: 16 passed, zero failed.
- Full API: 1,478 passed, 26 skipped, zero failed.
- Complete Playwright: 99 passed, 9 skipped, zero failed.
- Public portal health screenshot: rendered successfully.

## Out of Section 4 scope

- The public health screenshot logged the already-deferred signed-out
  announcement/Dalil 401 behavior. No Section 4 change was made for it.
- The relay schema-promotion workflow reports the relay canonical
  `package.json` as stale. Section 4 source/tests and all requested runtime
  gates passed; no relay promotion change was made.