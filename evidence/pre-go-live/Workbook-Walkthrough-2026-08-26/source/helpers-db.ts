/**
 * Lightweight pg helper used only in Playwright test setup files.
 * Production code should always go through the shared Drizzle client.
 */
import pg from "pg";

const { Client } = pg;

/** Elevate a HOA DB user to admin by their Clerk user-id. */
export async function elevateToAdmin(clerkId: string): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE users SET role = 'admin' WHERE clerk_id = $1`,
      [clerkId]
    );
  } finally {
    await client.end();
  }
}

/** Fetch the HOA DB user record for a given Clerk user-id. */
export async function fetchHoaUser(
  clerkId: string
): Promise<Record<string, unknown> | undefined> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT * FROM users WHERE clerk_id = $1 LIMIT 1`,
      [clerkId]
    );
    return rows[0] as Record<string, unknown> | undefined;
  } finally {
    await client.end();
  }
}

/** Set the HOA DB role for a user looked up by email address. */
export async function setUserRoleByEmail(
  email: string,
  role: string
): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE users SET role = $1::user_role WHERE email = $2`,
      [role, email]
    );
  } finally {
    await client.end();
  }
}

/**
 * Seed an active Waha Pass credential for a verified-resident E2E user.
 *
 * Inserts a waha_pass_applications row (status='active') and a
 * waha_pass_credentials row (status='active', credential_index=1, held_by_user_id)
 * so that hasActiveWahaPass(userId) returns true and the facility booking
 * wizard is accessible to the resident in E2E tests.
 *
 * Idempotent: no-ops if an active credential for this user already exists.
 */
export async function seedActiveWahaPassByEmail(email: string): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Resolve the HOA user record
    const { rows: users } = await client.query<{ id: number; unit_id: number | null }>(
      `SELECT id, unit_id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (!users[0]) {
      console.warn(`[e2e db] seedActiveWahaPassByEmail: user not found for ${email}`);
      return;
    }
    const userId = users[0].id;
    const unitId = users[0].unit_id;
    if (!unitId) {
      console.warn(`[e2e db] seedActiveWahaPassByEmail: user ${email} has no unit_id — seed seedVerifiedOwnerByEmail first`);
      return;
    }

    // Check if an active credential already exists for this user+unit
    const { rows: existing } = await client.query(
      `SELECT c.id FROM waha_pass_credentials c
         JOIN waha_pass_applications a ON a.id = c.application_id
        WHERE c.held_by_user_id = $1
          AND c.status = 'active'
          AND a.unit_id = $2
        LIMIT 1`,
      [userId, unitId]
    );
    if (existing.length > 0) {
      // Already seeded — idempotent exit
      return;
    }

    // Insert the application
    const { rows: [app] } = await client.query<{ id: number }>(
      `INSERT INTO waha_pass_applications
         (unit_id, applicant_user_id, occupancy_track, status, created_at, updated_at)
       VALUES ($1, $2, 'owner', 'active', NOW(), NOW())
       RETURNING id`,
      [unitId, userId]
    );

    // Insert credential index 1 (primary holder)
    await client.query(
      `INSERT INTO waha_pass_credentials
         (application_id, credential_index, holder_name, held_by_user_id, status, created_at)
       VALUES ($1, 1, 'E2E Verified Resident', $2, 'active', NOW())`,
      [app.id, userId]
    );
  } finally {
    await client.end();
  }
}

/** Delete a booking by its numeric id (best-effort E2E cleanup). */
export async function deleteBookingById(id: number): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM bookings WHERE id = $1`, [id]);
  } finally {
    await client.end();
  }
}

/**
 * Seed a verified-owner record for an E2E test user by email.
 *
 * Sets role = 'owner', verification_status = 'verified_owner', and
 * unit_id = <first available unit> directly on the users row — sufficient for the portal to render the
 * "Add Vehicle" and "Register Guest" buttons without a verification prompt.
 *
 * Idempotent: safe to call on every test run.
 */
export async function seedVerifiedOwnerByEmail(email: string): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Use the first unit in the database as the E2E unit anchor.
    const { rows: units } = await client.query<{ id: number }>(
      `SELECT id FROM units ORDER BY id LIMIT 1`
    );
    if (units.length === 0) {
      console.warn("[e2e db] No units found — seedVerifiedOwnerByEmail skipped");
      return;
    }
    const unitId = units[0].id;
    await client.query(
      `UPDATE users
          SET role = 'owner',
              verification_status = 'verified_owner',
              unit_id = $1
        WHERE email = $2`,
      [unitId, email]
    );
  } finally {
    await client.end();
  }
}

/** Assign an existing user the shared E2E unit without changing their role. */
export async function seedUnitAnchorByEmail(email: string): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: units } = await client.query<{ id: number }>(
      `SELECT id FROM units ORDER BY id LIMIT 1`
    );
    if (units.length === 0) {
      console.warn("[e2e db] No units found — seedUnitAnchorByEmail skipped");
      return;
    }
    await client.query(
      `UPDATE users SET unit_id = $1 WHERE email = $2`,
      [units[0].id, email]
    );
  } finally {
    await client.end();
  }
}

export type GateWalkthroughFixture = {
  residentNationalId: string;
  residentEmail: string;
  residentName: string;
  unitNumber: string;
  guestPassToken: string;
  dayPassBarcode: string;
  wahaPassNumber: string;
  guestName: string;
  contractorName: string;
  contractorMobile: string;
};

const GATE_FIXTURE = {
  residentClerkId: "e2e-gate-resident-fixture",
  residentEmail: "e2e-gate-resident-fixture@example.invalid",
  residentNationalId: "1000000714",
  residentFirstName: "Gate",
  residentLastName: "Fixture Resident",
  guestFirstName: "Gate",
  guestLastName: "Fixture Visitor",
  guestPassToken: "e2e-gate-guest-pass-20260825",
  guestPassUuid: "e2e-gate-guest-pass-uuid-20260825",
  dayPassToken: "e2e-gate-day-pass-20260825",
  wahaPassNumber: "E2E-GATE-WAHA-001",
  wahaPassToken: "e2e-gate-waha-pass-20260825",
  moveInDescription: "E2E gate walkthrough move-in fixture",
  moveOutDescription: "E2E gate walkthrough move-out fixture",
  renovationDescription: "E2E gate walkthrough renovation fixture",
  contractorName: "E2E Gate Works",
  contractorMobile: "+966501112233",
  unitBuilding: "E2E",
  unitNumber: "GATE-101",
} as const;

/**
 * Promote a Clerk-authenticated test identity to an active guard after its
 * first portal visit has created the HOA row.
 */
export async function seedGuardByEmail(email: string): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `UPDATE users
          SET role = 'guard',
              status = 'active',
              updated_at = NOW()
        WHERE email = $1`,
      [email],
    );
    if (rowCount !== 1) {
      throw new Error(`[e2e db] guard setup could not find HOA user ${email}`);
    }
  } finally {
    await client.end();
  }
}

/**
 * Seed development-only positive records for the live guard walkthrough.
 * Reserved values make this safe to repeat without touching user-created rows.
 */
export async function seedGateWalkthroughFixtures(): Promise<GateWalkthroughFixture> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const { rows: fixtureUnits } = await client.query<{ id: number; unit_number: string }>(
      `SELECT id, unit_number
         FROM units
        WHERE building = $1 AND unit_number = $2
        LIMIT 1`,
      [GATE_FIXTURE.unitBuilding, GATE_FIXTURE.unitNumber],
    );
    const unit = fixtureUnits[0] ?? (await client.query<{ id: number; unit_number: string }>(
      `INSERT INTO units
        (building, unit_number, occupant_type, is_system, created_at, updated_at)
       VALUES ($1, $2, 'vacant', false, NOW(), NOW())
       RETURNING id, unit_number`,
      [
        GATE_FIXTURE.unitBuilding,
        GATE_FIXTURE.unitNumber,
      ],
    )).rows[0];
    if (!unit) {
      throw new Error("[e2e db] failed to seed the isolated gate walkthrough unit");
    }

    const { rows: residentRows } = await client.query<{ id: number }>(
      `INSERT INTO users
        (clerk_id, email, first_name, last_name, unit_number, role, status, unit_id, national_id, verification_status, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'owner', 'active', $6, $7, 'verified_owner', NOW())
       ON CONFLICT (clerk_id) DO UPDATE
         SET email = EXCLUDED.email,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             unit_number = EXCLUDED.unit_number,
             role = 'owner',
             status = 'active',
             unit_id = EXCLUDED.unit_id,
             national_id = EXCLUDED.national_id,
             verification_status = 'verified_owner',
             updated_at = NOW()
       RETURNING id`,
      [
        GATE_FIXTURE.residentClerkId,
        GATE_FIXTURE.residentEmail,
        GATE_FIXTURE.residentFirstName,
        GATE_FIXTURE.residentLastName,
        unit.unit_number,
        unit.id,
        GATE_FIXTURE.residentNationalId,
      ],
    );
    const resident = residentRows[0];
    if (!resident) throw new Error("[e2e db] failed to seed gate fixture resident");

    const { rows: existingGuestRows } = await client.query<{ id: number }>(
      `SELECT id FROM guests
        WHERE resident_id = $1 AND first_name = $2 AND last_name = $3
        ORDER BY id DESC LIMIT 1`,
      [resident.id, GATE_FIXTURE.guestFirstName, GATE_FIXTURE.guestLastName],
    );
    const guest = existingGuestRows[0] ?? (await client.query<{ id: number }>(
      `INSERT INTO guests
        (resident_id, first_name, last_name, visit_date, visit_reason, status, gender, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_DATE, 'E2E gate walkthrough', 'approved', 'male', NOW(), NOW())
       RETURNING id`,
      [resident.id, GATE_FIXTURE.guestFirstName, GATE_FIXTURE.guestLastName],
    )).rows[0];
    if (!guest) throw new Error("[e2e db] failed to seed gate fixture guest");

    await client.query(
      `INSERT INTO guest_passes
        (pass_uuid, verification_token, guest_id, resident_id, guest_name, visit_date, vehicle_plate, reason_for_visit, status, created_at, approved_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'E2E-GUEST-01', 'E2E gate walkthrough', 'approved', NOW(), NOW())
       ON CONFLICT (verification_token) DO UPDATE
         SET pass_uuid = EXCLUDED.pass_uuid,
             guest_id = EXCLUDED.guest_id,
             resident_id = EXCLUDED.resident_id,
             guest_name = EXCLUDED.guest_name,
             visit_date = CURRENT_DATE,
             vehicle_plate = EXCLUDED.vehicle_plate,
             status = 'approved',
             approved_at = NOW(),
             revoked_at = NULL`,
      [
        GATE_FIXTURE.guestPassUuid,
        GATE_FIXTURE.guestPassToken,
        guest.id,
        resident.id,
        `${GATE_FIXTURE.guestFirstName} ${GATE_FIXTURE.guestLastName}`,
      ],
    );

    await client.query(
      `DELETE FROM waha_guest_day_passes WHERE verification_token = $1`,
      [GATE_FIXTURE.dayPassToken],
    );
    const { rows: dayPassRows } = await client.query<{ id: number }>(
      `INSERT INTO waha_guest_day_passes
        (unit_id, unit_number, date, extra_guest_count, guest_count, amount_sar, payment_status, purchased_by_user_id, created_at, issued_at, verification_token, vehicle_plate)
       VALUES ($1, $2, CURRENT_DATE, 3, 3, 15.00, 'paid', $3, NOW(), NOW(), $4, 'E2E-DAY-42')
       RETURNING id`,
      [unit.id, unit.unit_number, resident.id, GATE_FIXTURE.dayPassToken],
    );
    const dayPass = dayPassRows[0];
    if (!dayPass) throw new Error("[e2e db] failed to seed gate fixture day pass");

    const { rows: applicationRows } = await client.query<{ id: number }>(
      `SELECT id FROM waha_pass_applications
        WHERE unit_id = $1 AND applicant_user_id = $2
        ORDER BY id DESC LIMIT 1`,
      [unit.id, resident.id],
    );
    const application = applicationRows[0] ?? (await client.query<{ id: number }>(
      `INSERT INTO waha_pass_applications
        (unit_id, applicant_user_id, occupancy_track, status, created_at, updated_at)
       VALUES ($1, $2, 'owner', 'active', NOW(), NOW())
       RETURNING id`,
      [unit.id, resident.id],
    )).rows[0];
    if (!application) throw new Error("[e2e db] failed to seed gate fixture Waha application");
    await client.query(
      `UPDATE waha_pass_applications SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [application.id],
    );
    await client.query(
      `INSERT INTO waha_pass_credentials
        (application_id, credential_index, pass_number, verification_token, holder_name, held_by_user_id, status, created_at)
       VALUES ($1, 1, $2, $3, $4, $5, 'active', NOW())
       ON CONFLICT (pass_number) DO UPDATE
         SET application_id = EXCLUDED.application_id,
             credential_index = EXCLUDED.credential_index,
             verification_token = EXCLUDED.verification_token,
             holder_name = EXCLUDED.holder_name,
             held_by_user_id = EXCLUDED.held_by_user_id,
             status = 'active',
             revocation_reason = NULL,
             revoked_at = NULL`,
      [
        application.id,
        GATE_FIXTURE.wahaPassNumber,
        GATE_FIXTURE.wahaPassToken,
        `${GATE_FIXTURE.residentFirstName} ${GATE_FIXTURE.residentLastName}`,
        resident.id,
      ],
    );

    await client.query(
      `DELETE FROM permits
        WHERE user_id = $1
          AND description IN ($2, $3, $4)`,
      [
        resident.id,
        GATE_FIXTURE.moveInDescription,
        GATE_FIXTURE.moveOutDescription,
        GATE_FIXTURE.renovationDescription,
      ],
    );
    await client.query(
      `INSERT INTO permits
        (user_id, unit_id, unit_number, type, description, status, requested_start_date, requested_end_date,
         moving_company_name, moving_company_contact, contractor_name, contractor_contact, renovation_scope,
         working_hours_requested, common_area_impact, created_at, updated_at)
       VALUES
        ($1, $2, $3, 'move_in', $4, 'approved', CURRENT_DATE, CURRENT_DATE + 1,
         'E2E Moving Co', '+966501111111', NULL, NULL, NULL, NULL, false, NOW(), NOW()),
        ($1, $2, $3, 'move_out', $5, 'approved', CURRENT_DATE, CURRENT_DATE + 1,
         'E2E Moving Co', '+966501111111', NULL, NULL, NULL, NULL, false, NOW(), NOW()),
        ($1, $2, $3, 'renovation', $6, 'approved', CURRENT_DATE, CURRENT_DATE + 2,
         NULL, NULL, $7, $8, '[\"flooring\"]', '09:00-17:00', false, NOW(), NOW())`,
      [
        resident.id,
        unit.id,
        unit.unit_number,
        GATE_FIXTURE.moveInDescription,
        GATE_FIXTURE.moveOutDescription,
        GATE_FIXTURE.renovationDescription,
        GATE_FIXTURE.contractorName,
        GATE_FIXTURE.contractorMobile,
      ],
    );

    await client.query("COMMIT");
    return {
      residentNationalId: GATE_FIXTURE.residentNationalId,
      residentEmail: GATE_FIXTURE.residentEmail,
      residentName: `${GATE_FIXTURE.residentFirstName} ${GATE_FIXTURE.residentLastName}`,
      unitNumber: unit.unit_number,
      guestPassToken: GATE_FIXTURE.guestPassToken,
      dayPassBarcode: String(dayPass.id),
      wahaPassNumber: GATE_FIXTURE.wahaPassNumber,
      guestName: `${GATE_FIXTURE.guestFirstName} ${GATE_FIXTURE.guestLastName}`,
      contractorName: GATE_FIXTURE.contractorName,
      contractorMobile: GATE_FIXTURE.contractorMobile,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
