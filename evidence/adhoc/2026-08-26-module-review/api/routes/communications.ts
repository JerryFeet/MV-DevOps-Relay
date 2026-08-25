import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, communicationsTable, hoaSettingsTable, unitsTable } from "@workspace/db";
import { eq, and, desc, getTableColumns, count } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { getAuth } from "@clerk/express";
import { getSmtpConfig, sendTestEmail } from "../lib/email";
import { enqueueNotification } from "../lib/notificationService";
import { EVT, communicationsReplyKey } from "../lib/notificationWiring";

const router = Router();

async function getContactEmail(): Promise<string> {
  const [row] = await db.select().from(hoaSettingsTable).where(eq(hoaSettingsTable.key, "contact_email"));
  return row?.value ?? "";
}

async function sendEmailNotification(toEmail: string, comm: { type: string; subject: string; body: string }, senderName: string) {
  if (!toEmail) return;
  const cfg = await getSmtpConfig();
  if (!cfg) return;

  const { createTransport } = await import("nodemailer");
  const transporter = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const label = comm.type === "complaint" ? "Complaint" : "Suggestion";
  await transporter.sendMail({
    from: `"Madain Village Portal" <${cfg.user}>`,
    to: toEmail,
    subject: `[HOA ${label}] ${comm.subject}`,
    text: `New ${label} submitted by ${senderName}\n\n${comm.body}`,
    html: `
      <h2>New ${label} from ${senderName}</h2>
      <p><strong>Subject:</strong> ${comm.subject}</p>
      <hr/>
      <p>${comm.body.replace(/\n/g, "<br/>")}</p>
      <hr/>
      <p style="color:#888;font-size:12px">Submitted via Madain Village Resident Portal</p>
    `,
  });
}

router.post("/communications", requireApiAuth, async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId!));
  if (!caller) return res.status(404).json({ error: "User not found" });
  if (caller.role !== "owner" || caller.verificationStatus !== "verified_owner") {
    return res.status(403).json({ error: "Only verified property owners can submit complaints and suggestions to the HOA." });
  }

  const { type, subject, body } = req.body;
  if (!type || !subject || !body) return res.status(400).json({ error: "type, subject, and body are required" });
  if (!["complaint", "suggestion"].includes(type)) return res.status(400).json({ error: "type must be complaint or suggestion" });

  const [comm] = await db.insert(communicationsTable).values({
    userId: caller.id,
    type,
    subject,
    body,
    status: "pending",
  }).returning();

  const contactEmail = await getContactEmail();
  const senderName = [caller.firstName, caller.lastName].filter(Boolean).join(" ") || caller.email;
  try {
    await sendEmailNotification(contactEmail, comm, senderName);
  } catch {
    // email failure is non-fatal — communication is saved regardless
  }

  res.status(201).json(comm);
});

router.get("/communications/mine", requireApiAuth, async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId!));
  if (!caller) return res.status(404).json({ error: "User not found" });
  if (caller.role !== "owner" || caller.verificationStatus !== "verified_owner") {
    return res.status(403).json({ error: "Only verified property owners can view their own communications." });
  }

  const comms = await db.select().from(communicationsTable)
    .where(eq(communicationsTable.userId, caller.id))
    .orderBy(desc(communicationsTable.createdAt));
  res.json(comms);
});

router.get("/communications", requireApiAuth, async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId!));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);

  const [{ total }] = await db.select({ total: count() }).from(communicationsTable);
  const cols = getTableColumns(communicationsTable);
  const comms = await db
    .select({
      ...cols,
      senderEmail: usersTable.email,
      senderFirstName: usersTable.firstName,
      senderLastName: usersTable.lastName,
      senderPhone: usersTable.phone,
      senderUnit: usersTable.unitNumber,
      senderBuilding: unitsTable.building,
      senderApartment: unitsTable.unitNumber,
    })
    .from(communicationsTable)
    .leftJoin(usersTable, eq(communicationsTable.userId, usersTable.id))
    .leftJoin(unitsTable, eq(usersTable.unitId, unitsTable.id))
    .orderBy(desc(communicationsTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json(paginatedResponse(comms, Number(total), page, limit));
});

// Standard bilingual reply bodies for admin quick-actions
const REJECT_BODY = `Dear sender, thank you for contacting us. This request is not within the responsibility of the owner association.

عزيزي المُرسِل، شكراً لتواصلك معنا. هذا الطلب ليس ضمن مسؤولية جمعية الملاك.`;

const DEFER_BODY = `Dear sender, thank you for contacting us. Please contact the official channels for maintenance requests.

عزيزي المُرسِل، شكراً لتواصلك معنا. يرجى التواصل مع القنوات الرسمية لطلبات الصيانة.`;

async function sendReplyToSubmitter(
  toEmail: string,
  originalSubject: string,
  replyBody: string,
  replySubject: string,
) {
  if (!toEmail) return;
  const cfg = await getSmtpConfig();
  if (!cfg) return;

  const { createTransport } = await import("nodemailer");
  const transporter = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await transporter.sendMail({
    from: `"Madain Village HOA" <${cfg.user}>`,
    to: toEmail,
    subject: `Re: ${originalSubject} — ${replySubject}`,
    text: replyBody,
    html: `<p style="white-space:pre-wrap">${replyBody.replace(/\n/g, "<br/>")}</p>
      <hr/>
      <p style="color:#888;font-size:12px">Madain Village Community Management</p>`,
  });
}

router.patch("/communications/:id", requireApiAuth, async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId!));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { status, adminNote } = req.body;

  // Fetch the existing record so we can look up the submitter
  const [existing] = await db.select().from(communicationsTable)
    .where(eq(communicationsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });

  // For reject / defer, persist the standard bilingual reply body in adminNote
  // (prepended to any custom note the admin provided), so the thread data is
  // self-contained without relying on front-end constants.
  let storedAdminNote = adminNote ?? null;
  if (status === "rejected" || status === "deferred_to_maintenance") {
    const replyBody = status === "rejected" ? REJECT_BODY : DEFER_BODY;
    storedAdminNote = adminNote && adminNote.trim()
      ? `${replyBody}\n\n---\n${adminNote.trim()}`
      : replyBody;
  }

  const [updated] = await db.update(communicationsTable)
    .set({ status, adminNote: storedAdminNote })
    .where(and(
      eq(communicationsTable.id, existing.id),
      eq(communicationsTable.status, existing.status),
    ))
    .returning();
  if (!updated) {
    return res.status(409).json({ error: "Communication was changed by another administrator. Refresh and try again." });
  }

  // For reject / defer-to-maintenance, email the submitter with the standard bilingual reply
  if (status === "rejected" || status === "deferred_to_maintenance") {
    try {
      const [submitter] = await db.select().from(usersTable).where(eq(usersTable.id, existing.userId));
      if (submitter?.email) {
        const isReject = status === "rejected";
        const replyBody = isReject ? REJECT_BODY : DEFER_BODY;
        const replySubject = isReject
          ? "Response from Madain Village HOA / رد من جمعية مدائن فيلدج"
          : "Maintenance Request Referral / إحالة طلب صيانة";
        await sendReplyToSubmitter(submitter.email, existing.subject, replyBody, replySubject);
      }

      // Row 7 — communications_reply (rejected or deferred)
      if (submitter) {
        const isReject = status === "rejected";
        enqueueNotification({
          eventType: EVT.COMMUNICATIONS_REPLY,
          idempotencyKey: communicationsReplyKey(existing.id, status),
          recipientUserId: submitter.id,
          recipientEmail: submitter.email ?? null,
          channel: "push",
          payload: {
            title: isReject ? "📬 HOA Response" : "📬 HOA Response",
            body: isReject
              ? "The HOA has responded to your communication."
              : "Your request has been referred to maintenance.",
            data: { screen: "communications", id: existing.id },
          },
          preferencePolicy: "decision",
        }).catch(() => {});
      }
    } catch {
      // Email failure is non-fatal — status is already updated
    }
  }

  res.json(updated);
});

// ── HOA Settings ─────────────────────────────────────────────────────────────

// GET /settings — return all settings.
// smtp_pass is never included. smtp_* config keys are only included for admin callers.
router.get("/settings", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const rows = await db.select().from(hoaSettingsTable);

  // Check whether the caller is an authenticated admin
  let isAdmin = false;
  if (clerkId) {
    const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
    isAdmin = caller?.role === "admin";
  }

  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (row.key === "smtp_pass") continue;
    if (row.key.startsWith("smtp_") && !isAdmin) continue;
    settings[row.key] = row.value;
  }
  // Signal to admin callers whether a password is stored (without exposing it)
  if (isAdmin) {
    const hasPass = rows.some(r => r.key === "smtp_pass" && r.value);
    if (hasPass) settings["smtp_pass_set"] = "true";
  }
  res.json(settings);
});

// PUT /settings — upsert; never overwrites smtp_pass with an empty value
router.put("/settings", requireApiAuth, async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId!));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const updates: Record<string, string> = req.body;
  for (const [key, value] of Object.entries(updates)) {
    if (key === "smtp_pass" && !value.trim()) continue; // never clear a stored password with blank
    await db.insert(hoaSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: hoaSettingsTable.key, set: { value } });
  }
  const rows = await db.select().from(hoaSettingsTable);
  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (row.key === "smtp_pass") continue;
    settings[row.key] = row.value;
  }
  const hasPass = rows.some(r => r.key === "smtp_pass" && r.value);
  if (hasPass) settings["smtp_pass_set"] = "true";
  res.json(settings);
});

// POST /settings/test-email — admin only; sends a test email using current SMTP config
router.post("/settings/test-email", requireApiAuth, async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId!));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  try {
    await sendTestEmail();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "Failed to send test email" });
  }
});

export default router;
