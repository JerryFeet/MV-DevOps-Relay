import { Router } from "express";
import { db } from "@workspace/db";
import { householdInvitationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { canonicalUnitReference } from "../lib/unitReference";

const router: Router = Router();

/**
 * Public (unauthenticated) endpoint used by the sign-up page to validate an
 * invitation token from the `?invite=` query param. Returns just enough to
 * pre-fill and lock the email field — never leaks other unit/resident data.
 */
router.get("/invitations/validate", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return res.status(400).json({ valid: false, reason: "missing_token" });

  const [invitation] = await db.select().from(householdInvitationsTable)
    .where(eq(householdInvitationsTable.token, token));

  if (!invitation) return res.json({ valid: false, reason: "not_found" });
  if (invitation.status === "revoked") return res.json({ valid: false, reason: "revoked" });
  if (invitation.status === "accepted") return res.json({ valid: false, reason: "used" });
  if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
    return res.json({ valid: false, reason: "expired" });
  }

  const unitReference = await canonicalUnitReference(invitation.unitId);
  res.json({
    valid: true,
    email: invitation.invitedEmail,
    // Compatibility field; its value is always the Unit Registry reference.
    unitNumber: unitReference,
    unitReference,
  });
});

export default router;
