# H5 empty-database baseline proof

## Canonical baseline
- Source: lib/db/migrations/0000_baseline.sql
- SHA-256: 93f6911017b2c159098d87a3b406c2b86b9f83d2b3a93cddc34f6116a9edf2d2
- Includes absorbed historical schema state through 0043.
- Active forward migrations after baseline: none.

## Forward closure
- 0042 SG9/SG11/SG12 persistence was published after its already-completed development application; it was not rerun.
- 0043 H6/H8a cleanup was published and relay-asserted before development application. It removed residents.id_photo_key and resident_photo_deletion_jobs; the renovation_scope type was already absent and was closed by idempotent DROP TYPE IF EXISTS.

## Fresh-database proof
1. Created an isolated temporary PostgreSQL database.
2. Restored the canonical baseline with psql -v ON_ERROR_STOP=1.
3. Took a schema-only pg_dump with no owner/privileges.
4. Compared it to the baseline after excluding only PostgreSQL 16's pre-created public-schema bootstrap block and pg_dump session guard lines.
5. The semantic diff was empty.

## Matching normalized proof hashes
- Baseline: afabea0f18c949257d4baa2808a3114363a5fc1caf5e767e96b39c33e73e3b34
- Restored fresh database: afabea0f18c949257d4baa2808a3114363a5fc1caf5e767e96b39c33e73e3b34

Development is schema-aligned with the regenerated baseline and is publishable with respect to this H5 divergence.
