import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreatePortalHelpTicketBody, CreatePortalHelpTicketResponse,
  RequestPortalHelpScreenshotUploadUrlBody, RequestPortalHelpScreenshotUploadUrlResponse,
} from "@workspace/api-zod";
import {
  db, notificationPreferencesTable, portalHelpTicketsTable, usersTable,
} from "@workspace/db";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import { enqueueBothNotificationChannels } from "../lib/notificationProducer";
import { canonicalUnitReference } from "../lib/unitReference";

const router = Router();
const storage = new ObjectStorageService();
const VERIFIED_RESIDENT_STATUSES = ["verified_owner", "verified_tenant", "verified_household_member"];
const REDIRECT_REPLY = `Thank you for contacting us. This request does not concern the portal itself. If it relates to your unit or your tenancy, please contact your landlord. If you are the unit owner and it concerns the community's common areas, please use Contact HOA.

شكرًا لتواصلك معنا. هذا الطلب لا يتعلق بالبوابة نفسها. فإذا كان يخص وحدتك أو عقد إيجارك، يرجى التواصل مع المالك. وإذا كنت مالك الوحدة وكان يتعلق بالمناطق المشتركة، يرجى استخدام "التواصل مع الجمعية".`;

async function callerFor(req: any) {
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, req.auth().userId!));
  return caller;
}
function canSubmit(caller: any) {
  return caller && ["owner", "tenant"].includes(caller.role) && caller.status === "active"
    && VERIFIED_RESIDENT_STATUSES.includes(caller.verificationStatus);
}
function residentTicket(ticket: any) {
  const { screenshotObjectKey: _key, screenshotContentType: _type, submitterUserId: _submitter, submitterRole: _role, submitterUnit: _unit, ...safe } = ticket;
  return serializeDates(safe);
}
function adminTicket(ticket: any) {
  const { screenshotObjectKey: _key, ...safe } = ticket;
  return serializeDates(safe);
}
function serializeDates(value: Record<string, any>) {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key, entry instanceof Date ? entry.toISOString() : entry,
  ]));
}

async function notifyApprovalRoutedAdmins(ticketId: number, unit: string) {
  const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
  await Promise.all(admins.map(async admin => {
    const [preferences] = await db.select().from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, admin.id));
    if (!preferences?.receivesApprovalNotifications) return;
    const idempotencyKey = `approval-required:portal-help:${ticketId}`;
    const payload = {
      title: "Portal help request / طلب مساعدة للبوابة",
      body: `A portal help request requires attention (${unit || "resident"}).`,
      data: { screen: "admin", queue: "portalHelp", itemId: ticketId },
    };
    await enqueueBothNotificationChannels({
      eventType: "approval_required", idempotencyKey, recipientUserId: admin.id,
      recipientEmail: admin.email, locale: "ar",
      payload, preferencePolicy: "mandatory",
    });
  }));
}

router.post("/portal-help/upload-url", requireApiAuth, async (req, res) => {
  const caller = await callerFor(req);
  if (!canSubmit(caller)) return res.status(403).json({ error: "Verified active owner or tenant access is required" });
  const parsed = RequestPortalHelpScreenshotUploadUrlBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "One JPEG, PNG, or WebP screenshot of 10 MB or smaller is required" });
  try {
    const uploadURL = await storage.getPortalHelpScreenshotUploadURL(parsed.data.contentType);
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    return res.json(RequestPortalHelpScreenshotUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    req.log.error({ err: error }, "portal-help screenshot upload URL failed");
    return res.status(500).json({ error: "Failed to generate screenshot upload URL" });
  }
});

router.post("/portal-help", requireApiAuth, async (req, res) => {
  const caller = await callerFor(req);
  if (!canSubmit(caller)) return res.status(403).json({ error: "Verified active owner or tenant access is required" });
  const parsed = CreatePortalHelpTicketBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.details.trim()
    || Boolean(parsed.data.screenshotObjectPath) !== Boolean(parsed.data.screenshotContentType)) {
    return res.status(400).json({ error: "A valid category, nonblank details, and a complete optional screenshot are required" });
  }
  const retention = parsed.data.screenshotObjectPath ? new Date(Date.now() + 30 * 24 * 60 * 60_000) : null;
  const unitReference = await canonicalUnitReference(caller.unitId);
  const [ticket] = await db.insert(portalHelpTicketsTable).values({
    submitterUserId: caller.id, submitterRole: caller.role, submitterUnit: unitReference,
    category: parsed.data.category, details: parsed.data.details.trim(),
    screenshotObjectKey: parsed.data.screenshotObjectPath ?? null,
    screenshotContentType: parsed.data.screenshotContentType ?? null,
    screenshotDeleteAfter: retention,
  }).returning();
  void notifyApprovalRoutedAdmins(ticket!.id, unitReference).catch(() => {});
  return res.status(201).json(CreatePortalHelpTicketResponse.parse(residentTicket(ticket)));
});

router.get("/portal-help", requireApiAuth, async (req, res) => {
  const caller = await callerFor(req);
  if (!canSubmit(caller)) return res.status(403).json({ error: "Verified active owner or tenant access is required" });
  const tickets = await db.select().from(portalHelpTicketsTable)
    .where(eq(portalHelpTicketsTable.submitterUserId, caller.id)).orderBy(desc(portalHelpTicketsTable.createdAt));
  return res.json(tickets.map(residentTicket));
});

router.get("/admin/portal-help", requireApiAuth, async (req, res) => {
  const caller = await callerFor(req);
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const status = req.query.status;
  if (status && !["pending", "in_progress", "closed"].includes(String(status))) return res.status(400).json({ error: "Invalid status" });
  const tickets = await db.select().from(portalHelpTicketsTable)
    .where(status ? eq(portalHelpTicketsTable.status, status as any) : undefined).orderBy(desc(portalHelpTicketsTable.createdAt));
  return res.json(tickets.map(adminTicket));
});

router.get("/admin/portal-help/:id", requireApiAuth, async (req, res) => {
  const caller = await callerFor(req);
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const [ticket] = await db.select().from(portalHelpTicketsTable).where(eq(portalHelpTicketsTable.id, Number(req.params.id)));
  return ticket ? res.json(adminTicket(ticket)) : res.status(404).json({ error: "Not found" });
});

router.post("/admin/portal-help/:id/reply", requireApiAuth, async (req, res) => {
  const caller = await callerFor(req);
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const kind = req.body?.kind;
  if (!["reply", "redirect"].includes(kind) || (kind === "reply" && !String(req.body?.reply ?? "").trim())) return res.status(400).json({ error: "A reply or redirect is required" });
  const [ticket] = await db.update(portalHelpTicketsTable).set({
    status: "in_progress", adminReply: kind === "redirect" ? REDIRECT_REPLY : String(req.body.reply).trim(),
    replyKind: kind, repliedByUserId: caller.id, repliedAt: new Date(),
  }).where(eq(portalHelpTicketsTable.id, Number(req.params.id))).returning();
  if (!ticket) return res.status(404).json({ error: "Not found" });
  const [submitter] = await db.select({ email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, ticket.submitterUserId));
  void enqueueBothNotificationChannels({
    eventType: "portal_help_reply", idempotencyKey: `portal-help-reply:${ticket.id}:${ticket.repliedAt!.toISOString()}`,
    recipientUserId: ticket.submitterUserId, recipientEmail: submitter?.email ?? null, payload: {
      title: "Portal help response", subject: "Portal help response",
      body: ticket.adminReply ?? "An administrator replied to your portal help request.",
      html: `<p style="white-space:pre-wrap">${(ticket.adminReply ?? "An administrator replied to your portal help request.").replace(/\n/g, "<br/>")}</p>`,
      data: { screen: "portalHelp", id: ticket.id },
    }, preferencePolicy: "decision",
  }).catch(() => {});
  return res.json(adminTicket(ticket));
});

router.post("/admin/portal-help/:id/close", requireApiAuth, async (req, res) => {
  const caller = await callerFor(req);
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const [ticket] = await db.update(portalHelpTicketsTable).set({ status: "closed", closedAt: new Date() })
    .where(and(eq(portalHelpTicketsTable.id, Number(req.params.id)), eq(portalHelpTicketsTable.status, "in_progress"))).returning();
  return ticket ? res.json(adminTicket(ticket)) : res.status(404).json({ error: "Not found or not in progress" });
});

router.get("/admin/portal-help/:id/screenshot-url", requireApiAuth, async (req, res) => {
  const caller = await callerFor(req);
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const [ticket] = await db.select().from(portalHelpTicketsTable).where(eq(portalHelpTicketsTable.id, Number(req.params.id)));
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (!ticket.screenshotObjectKey || ticket.screenshotDeletedAt) return res.status(404).json({ error: "Screenshot not available" });
  try { return res.json({ url: await storage.getObjectEntityDownloadURL(ticket.screenshotObjectKey) }); }
  catch (error) { req.log.error({ err: error }, "portal-help screenshot URL failed"); return res.status(500).json({ error: "Failed to generate screenshot URL" }); }
});

export default router;