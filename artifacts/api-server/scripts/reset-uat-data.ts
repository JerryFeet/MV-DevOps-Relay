/**
 * Destructive Development-only UAT reset. It never alters schema or storage.
 * Invoke only with RESET_UAT_CONFIRM=CLEAN_DEVELOPMENT_UAT and NODE_ENV=development.
 */
import { createHash } from "crypto";
import { pool } from "@workspace/db";

const RESET_CONFIRMATION = "CLEAN_DEVELOPMENT_UAT";
const SEEDED_TABLES = new Set(["facilities", "document_folders", "documents"]);
const RETAINED_TABLES = new Set(["hoa_settings"]);
type IdRow = { id: number };
type TableRow = { table_name: string };
type ForeignKeyRow = { child_table: string; parent_table: string };
type SequenceRow = { sequence_name: string; table_name: string; column_name: string };
type ImmutableTriggerRow = { table_name: string; trigger_name: string };

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function settingsDigest(snapshot: string): string {
  return createHash("sha256").update(snapshot).digest("hex");
}

function deleteOrder(tables: string[], foreignKeys: ForeignKeyRow[]): string[] {
  // Every FK is child -> parent. A child must be emptied before its parent.
  const remaining = new Set(tables);
  const edges = foreignKeys
    .filter(({ child_table, parent_table }) => remaining.has(child_table) && remaining.has(parent_table))
    .map(({ child_table, parent_table }) => [child_table, parent_table] as const);
  const order: string[] = [];
  while (remaining.size) {
    const parents = new Set(edges.filter(([child]) => remaining.has(child)).map(([, parent]) => parent));
    const ready = [...remaining].filter((table) => !parents.has(table)).sort();
    if (!ready.length) {
      throw new Error(`Refusing reset: cyclic FK dependency among ${[...remaining].sort().join(", ")}.`);
    }
    for (const table of ready) {
      order.push(table);
      remaining.delete(table);
    }
  }
  return order;
}

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Refusing reset: NODE_ENV must be exactly development.");
  }
  if (process.env.RESET_UAT_CONFIRM !== RESET_CONFIRMATION) {
    throw new Error(`Refusing reset. Set RESET_UAT_CONFIRM=${RESET_CONFIRMATION} explicitly.`);
  }

  const client = await pool.connect();
  let began = false;
  try {
    const schemaTables = await client.query<TableRow>(
      `SELECT tablename AS table_name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tableNames = schemaTables.rows.map(({ table_name }) => table_name);
    for (const required of ["hoa_settings", "units", ...SEEDED_TABLES]) {
      if (!tableNames.includes(required)) throw new Error(`Refusing reset: required public table ${required} is missing.`);
    }
    const settingsBeforeRows = await client.query<{ key: string; value: string }>(
      "SELECT key, value FROM hoa_settings ORDER BY key",
    );
    const settingsBefore = JSON.stringify(settingsBeforeRows.rows);
    const settingsBeforeHash = settingsDigest(settingsBefore);
    const commonRes = await client.query<{
      id: number; is_system: boolean; verified_owner_id: number | null;
      verified_tenant_id: number | null; pre_approved_claim_id: number | null; occupant_type: string;
    }>(`SELECT id, is_system, verified_owner_id, verified_tenant_id, pre_approved_claim_id, occupant_type
          FROM units WHERE building = 'HOA' AND unit_number = 'COMMON' LIMIT 2`);
    if (commonRes.rowCount !== 1) throw new Error(`Refusing reset: expected exactly one HOA COMMON system unit, found ${commonRes.rowCount ?? 0}.`);
    const common = commonRes.rows[0]!;
    if (!common.is_system || common.verified_owner_id !== null || common.verified_tenant_id !== null
      || common.pre_approved_claim_id !== null || common.occupant_type !== "vacant") {
      throw new Error("Refusing reset: HOA COMMON failed its system-anchor protection invariant.");
    }

    const foreignKeys = await client.query<ForeignKeyRow>(
       `SELECT child.relname AS child_table, parent.relname AS parent_table
         FROM pg_constraint fk_constraint
         JOIN pg_class child ON child.oid = fk_constraint.conrelid
         JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
         JOIN pg_class parent ON parent.oid = fk_constraint.confrelid
         JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
        WHERE fk_constraint.contype = 'f' AND child_ns.nspname = 'public' AND parent_ns.nspname = 'public'`,
    );
    // This schema-driven set intentionally includes newly added transactional
    // and audit tables (extra_resident_requests/events,
    // monthly_booking_allowances, occupancy_correction_operations and their
    // supplements, resident_removal_operations, and unit_master_data_audit)
    // without allowing the reset list to drift behind the public schema.
    // units participates so its non-common rows are removed before referenced
    // users, but hoa_settings is intentionally not a deletion node.
    const clearNodes = tableNames.filter((table) => !RETAINED_TABLES.has(table));
    const ordered = deleteOrder(clearNodes, foreignKeys.rows);

    await client.query("BEGIN");
    began = true;
    const immutableTriggers = await client.query<ImmutableTriggerRow>(
      `SELECT table_relation.relname AS table_name, trigger.tgname AS trigger_name
         FROM pg_trigger trigger
         JOIN pg_class table_relation ON table_relation.oid = trigger.tgrelid
         JOIN pg_namespace table_ns ON table_ns.oid = table_relation.relnamespace
         JOIN pg_proc trigger_function ON trigger_function.oid = trigger.tgfoid
        WHERE table_ns.nspname = 'public' AND NOT trigger.tgisinternal
          AND trigger_function.proname IN (
            'reject_occupancy_append_only_mutation',
            'reject_immutable_unit_registry_evidence'
          )
        ORDER BY table_relation.relname, trigger.tgname`,
    );
    for (const trigger of immutableTriggers.rows) {
      await client.query(
        `ALTER TABLE ${quotedIdentifier(trigger.table_name)} DISABLE TRIGGER ${quotedIdentifier(trigger.trigger_name)}`,
      );
    }
    const deleted: Record<string, number> = {};
    for (const table of ordered) {
      const result = table === "units"
        ? await client.query("DELETE FROM units WHERE id <> $1", [common.id])
        : await client.query(`DELETE FROM ${quotedIdentifier(table)}`);
      deleted[table] = result.rowCount ?? 0;
    }
    for (const trigger of immutableTriggers.rows) {
      await client.query(
        `ALTER TABLE ${quotedIdentifier(trigger.table_name)} ENABLE TRIGGER ${quotedIdentifier(trigger.trigger_name)}`,
      );
    }
    const disabledImmutableTriggers = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM pg_trigger trigger
         JOIN pg_proc trigger_function ON trigger_function.oid = trigger.tgfoid
         JOIN pg_class table_relation ON table_relation.oid = trigger.tgrelid
         JOIN pg_namespace table_ns ON table_ns.oid = table_relation.relnamespace
        WHERE table_ns.nspname = 'public' AND NOT trigger.tgisinternal
          AND trigger_function.proname IN (
            'reject_occupancy_append_only_mutation',
            'reject_immutable_unit_registry_evidence'
          )
          AND trigger.tgenabled <> 'O'`,
    );
    if (disabledImmutableTriggers.rows[0]?.count !== 0) {
      throw new Error("Clean reset postcondition failed: an immutable-audit trigger was not restored.");
    }

    const facility = await client.query<IdRow>(
      `INSERT INTO facilities (name, description, price_per_hour, is_active, weekday_open_hour, weekday_close_hour,
         weekend_open_hour, weekend_close_hour, slot_interval_minutes, min_duration_minutes, max_duration_minutes,
         cleaning_buffer_minutes, requires_approval, requires_movie_title, capacity_mode, pricing_model)
       VALUES ('H5 Bookable Community Hall', 'Bookable community facility for resident UAT.', 0, true, 10, 23, 10, 25,
         60, 60, 240, 15, false, false, 'numeric', 'per_hour') RETURNING id`,
    );
    const residentFolder = await client.query<IdRow>(
      `INSERT INTO document_folders (name, name_ar, default_visibility, default_download_mode, sort_order, is_active, is_triage)
       VALUES ('Resident Documents', 'وثائق السكان', 'all_portal_users', 'download_allowed', 10, true, false) RETURNING id`,
    );
    const ownerFolder = await client.query<IdRow>(
      `INSERT INTO document_folders (name, name_ar, default_visibility, default_download_mode, sort_order, is_active, is_triage)
       VALUES ('Owner Documents', 'وثائق الملاك', 'verified_owners', 'download_allowed', 20, true, false) RETURNING id`,
    );
    await client.query(
      `INSERT INTO documents (title, description, category, file_url, mime_type, file_size, is_public, uploaded_by_id,
         folder_id, visibility, download_mode, is_archived) VALUES
       ('Resident Welcome Guide', 'Resident-visible starter document for UAT.', 'general',
         'fixtures/h5/resident-welcome-guide.pdf', 'application/pdf', 1, false, 0, $1, 'all_portal_users', 'download_allowed', false),
       ('Owners Committee Guide', 'Verified-owner starter document for UAT.', 'general',
         'fixtures/h5/owners-committee-guide.pdf', 'application/pdf', 1, false, 0, $2, 'verified_owners', 'download_allowed', false)`,
      [residentFolder.rows[0]!.id, ownerFolder.rows[0]!.id],
    );

    // Exact empty assertions cover every dynamically discovered cleared table,
    // except the deliberately reseeded library tables and the protected unit.
    for (const table of tableNames) {
      const countQuery = table === "units"
        ? { text: "SELECT COUNT(*)::int AS count FROM units WHERE id <> $1", values: [common.id] }
        : { text: `SELECT COUNT(*)::int AS count FROM ${quotedIdentifier(table)}`, values: [] as unknown[] };
      const count = await client.query<{ count: number }>(countQuery.text, countQuery.values);
      const expected = table === "facilities" ? 1 : SEEDED_TABLES.has(table) ? 2 : RETAINED_TABLES.has(table) ? null : 0;
      if (expected !== null && count.rows[0]?.count !== expected) {
        throw new Error(`Clean reset postcondition failed: ${table} has ${count.rows[0]?.count ?? -1} rows; expected ${expected}.`);
      }
    }
    const exactSeeds = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM facilities WHERE name = 'H5 Bookable Community Hall'
       UNION ALL SELECT COUNT(*)::int FROM document_folders WHERE name IN ('Resident Documents', 'Owner Documents')
       UNION ALL SELECT COUNT(*)::int FROM documents WHERE title IN ('Resident Welcome Guide', 'Owners Committee Guide')`,
    );
    if (exactSeeds.rows.some((row, index) => row.count !== (index === 0 ? 1 : 2))) {
      throw new Error("Clean reset postcondition failed: exact facility/document seed records were not restored.");
    }
    const settingsAfterRows = await client.query<{ key: string; value: string }>("SELECT key, value FROM hoa_settings ORDER BY key");
    const settingsAfter = JSON.stringify(settingsAfterRows.rows);
    if (settingsAfter !== settingsBefore || settingsDigest(settingsAfter) !== settingsBeforeHash) {
      throw new Error("Clean reset postcondition failed: hoa_settings values/hash changed.");
    }
    const commonAfter = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM units WHERE id = $1 AND building = 'HOA' AND unit_number = 'COMMON'
       AND is_system = true AND verified_owner_id IS NULL AND verified_tenant_id IS NULL
       AND pre_approved_claim_id IS NULL AND occupant_type = 'vacant'`, [common.id],
    );
    if (commonAfter.rows[0]?.count !== 1) throw new Error("Clean reset postcondition failed: HOA COMMON protection was not preserved.");

    // DELETE does not rewind sequences. Reset every public table-owned serial
    // or identity sequence after the HOA COMMON and library seed rows exist:
    // populated tables get MAX(id)+1 on their next insert, while an empty table
    // gets 1. This covers future schema tables as well as the preserved unit.
    const sequences = await client.query<SequenceRow>(
      `SELECT sequence_relation.relname AS sequence_name, table_relation.relname AS table_name, attribute.attname AS column_name
         FROM pg_class sequence_relation
         JOIN pg_namespace sequence_ns ON sequence_ns.oid = sequence_relation.relnamespace
         JOIN pg_depend dependency ON dependency.objid = sequence_relation.oid AND dependency.deptype IN ('a', 'i')
         JOIN pg_class table_relation ON table_relation.oid = dependency.refobjid
         JOIN pg_namespace table_ns ON table_ns.oid = table_relation.relnamespace
         JOIN pg_attribute attribute ON attribute.attrelid = table_relation.oid AND attribute.attnum = dependency.refobjsubid
        WHERE sequence_relation.relkind = 'S' AND sequence_ns.nspname = 'public' AND table_ns.nspname = 'public'
        ORDER BY sequence_relation.relname`,
    );
    for (const sequence of sequences.rows) {
      const table = quotedIdentifier(sequence.table_name);
      const column = quotedIdentifier(sequence.column_name);
      await client.query(
        `SELECT setval($1::regclass, COALESCE((SELECT MAX(${column}) FROM ${table}), 1),
          EXISTS (SELECT 1 FROM ${table}))`,
        [`public.${quotedIdentifier(sequence.sequence_name)}`],
      );
    }

    await client.query("COMMIT");
    began = false;
    console.log(JSON.stringify({ reset: "clean-development-uat", deleted, seeded: { facilityId: facility.rows[0]!.id, documentFolders: 2, documents: 2 }, preserved: { hoaCommonUnitId: common.id, hoaSettingsHash: settingsBeforeHash, schemaChanged: false, productionChanged: false } }, null, 2));
  } catch (error) {
    if (began) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Clean UAT reset failed");
  process.exitCode = 1;
});