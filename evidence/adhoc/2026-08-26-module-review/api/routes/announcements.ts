import { Router } from "express";
import { requireApiAuth } from "../middlewares/requireApiAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, announcementsTable, announcementEditHistoryTable, ANNOUNCEMENT_VISIBILITIES } from "@workspace/db";
import { eq, desc, inArray, and, ne } from "drizzle-orm";
import { parsePaginationParams, paginatedResponse } from "../lib/pagination";
import OpenAI from "openai";
import { STAFF_ROLES } from "../lib/roles";
import { sendPushToAll } from "../lib/pushNotifications";
import { sendEmail, getSmtpConfig } from "../lib/email";
import { enqueueNotification } from "../lib/notificationService";
import { EVT, announcementPublishedKey } from "../lib/notificationWiring";

const router = Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Caller = typeof usersTable.$inferSelect;
type AnnouncementRow = typeof announcementsTable.$inferSelect;

async function getCaller(req: any): Promise<Caller | null> {
  const auth = getAuth(req);
  if (!auth.userId) return null;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  return caller ?? null;
}

function isExpired(a: AnnouncementRow): boolean {
  return !!a.expiresAt && new Date(a.expiresAt) < new Date();
}

function canView(caller: Caller | null, a: AnnouncementRow): boolean {
  if (a.status === "deleted") return caller?.role === "admin";
  if (a.status === "draft") return caller?.role === "admin";
  if (!caller) return false;
  if ((STAFF_ROLES as readonly string[]).includes(caller.role)) return true;
  if (a.visibility === "all_portal_users") return true;
  return caller.verificationStatus === "verified_owner" || caller.role === "admin";
}

function addIsExpired<T extends AnnouncementRow>(a: T) {
  return { ...a, isExpired: isExpired(a) };
}

async function withAuthorNames(list: AnnouncementRow[]) {
  const ids = [...new Set(list.map(a => a.authorId))];
  if (ids.length === 0) return list.map(a => ({ ...addIsExpired(a), authorName: null as string | null }));
  const authors = await db.select().from(usersTable).where(inArray(usersTable.id, ids));
  const map = new Map(authors.map(u => [u.id, u]));
  return list.map(a => {
    const u = map.get(a.authorId);
    const authorName = u
      ? ([u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || null)
      : null;
    return { ...addIsExpired(a), authorName };
  });
}

// ─── Fixed announcement templates ────────────────────────────────────────────
const TEMPLATES = [
  {
    id: "general",
    name: "General Notice",
    bodyHtml: "<p>Dear Residents of Madain Village,</p><p>We would like to inform you that [details here].</p><p>For inquiries, please contact the management office.</p><p>Thank you for your cooperation.</p><p>Madain Village HOA Management</p>",
    bodyArabic: "عزيزي سكان مدائن فيلدج،\n\nنودّ إعلامكم بأن [التفاصيل هنا].\n\nللاستفسارات، يُرجى التواصل مع مكتب الإدارة.\n\nشكراً لتعاونكم.\n\nإدارة جمعية مدائن فيلدج",
  },
  {
    id: "maintenance",
    name: "Maintenance / Outage Notice",
    bodyHtml: "<p>Dear Residents,</p><p>Please be informed that scheduled maintenance for <strong>[service/area]</strong> will be carried out on <strong>[date]</strong> from <strong>[time]</strong> to <strong>[time]</strong>.</p><p>We apologise for any inconvenience and appreciate your patience.</p><p>Madain Village HOA Management</p>",
    bodyArabic: "عزيزي السكان،\n\nنحيطكم علماً بأن صيانة مجدولة لـ [الخدمة/المنطقة] ستُجرى بتاريخ [التاريخ] من الساعة [الوقت] حتى الساعة [الوقت].\n\nنعتذر عن أي إزعاج ونشكركم على صبركم.\n\nإدارة جمعية مدائن فيلدج",
  },
  {
    id: "event",
    name: "Event Invitation",
    bodyHtml: "<p>Dear Residents,</p><p>You are cordially invited to <strong>[event name]</strong>.</p><p><strong>Date:</strong> [date]<br/><strong>Time:</strong> [time]<br/><strong>Location:</strong> [venue]</p><p>We look forward to seeing you there.</p><p>Madain Village HOA Management</p>",
    bodyArabic: "عزيزي السكان،\n\nيسرّنا دعوتكم لحضور [اسم الفعالية].\n\nالتاريخ: [التاريخ]\nالوقت: [الوقت]\nالمكان: [المكان]\n\nنتطلع إلى رؤيتكم هناك.\n\nإدارة جمعية مدائن فيلدج",
  },
  {
    id: "policy",
    name: "Policy Update",
    bodyHtml: "<p>Dear Residents,</p><p>We would like to bring to your attention an important update to our community policy regarding <strong>[topic]</strong>.</p><p><strong>What is changing:</strong> [describe the change]</p><p><strong>Effective date:</strong> [date]</p><p>Please ensure compliance with this update. For questions, contact the management office.</p><p>Madain Village HOA Management</p>",
    bodyArabic: "عزيزي السكان،\n\nنودّ لفت انتباهكم إلى تحديث مهم في سياسة المجتمع بخصوص [الموضوع].\n\nما الذي يتغير: [وصف التغيير]\nتاريخ السريان: [التاريخ]\n\nيُرجى الالتزام بهذا التحديث. للاستفسار، تواصلوا مع مكتب الإدارة.\n\nإدارة جمعية مدائن فيلدج",
  },
  {
    id: "mullak",
    name: "Important Mullak Update",
    bodyHtml: "<p>Dear Owners of Madain Village,</p><p>This is an important update for property owners regarding <strong>[topic]</strong>.</p><p>[Details here]</p><p>This communication is addressed exclusively to registered unit owners. Please do not share outside the owners' group.</p><p>Madain Village HOA Management</p>",
    bodyArabic: "عزيزي ملاك مدائن فيلدج،\n\nهذا تحديث مهم لأصحاب العقارات بشأن [الموضوع].\n\n[التفاصيل هنا]\n\nهذه الرسالة موجّهة حصراً لملاك الوحدات المسجّلين. يُرجى عدم مشاركتها خارج مجموعة الملاك.\n\nإدارة جمعية مدائن فيلدج",
  },
];

// ─── GET /announcements/templates ─────────────────────────────────────────────
router.get("/announcements/templates", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  res.json(TEMPLATES);
});

// ─── GET /announcements ────────────────────────────────────────────────────────
router.get("/announcements", requireApiAuth, async (req, res) => {
  const caller = await getCaller(req);
  const isAdmin = caller?.role === "admin";
  const { page, limit, offset } = parsePaginationParams(req.query as Record<string, string>);

  const all = await db
    .select()
    .from(announcementsTable)
    .orderBy(desc(announcementsTable.pinned), desc(announcementsTable.createdAt));

  const visible = all.filter(a => {
    if (a.status === "deleted") return false;
    if (a.status === "draft") return isAdmin;
    // Hide expired announcements from residents so the API `total` reflects what they can
    // actually see. Admins can still see expired items for content management.
    if (!isAdmin && isExpired(a)) return false;
    return canView(caller, a);
  });

  const pageData = visible.slice(offset, offset + limit);
  return res.json(paginatedResponse(await withAuthorNames(pageData), visible.length, page, limit));
});

// ─── POST /announcements ───────────────────────────────────────────────────────
router.post("/announcements", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { title, titleAr, body, bodyHtml, bodyArabic, visibility, pinned, expiresAt, status } = req.body;
  const targetStatus: string = status === "draft" ? "draft" : "published";
  const targetVisibility = ANNOUNCEMENT_VISIBILITIES.includes(visibility) ? visibility : "all_portal_users";

  if (targetStatus === "published") {
    if (!title || !String(title).trim()) return res.status(400).json({ error: "English title is required" });
    if (!titleAr || !String(titleAr).trim()) return res.status(400).json({ error: "Arabic title is required" });
    if (!bodyArabic || !String(bodyArabic).trim()) return res.status(400).json({ error: "Arabic text is required" });
    if (!bodyHtml || !String(bodyHtml).trim()) return res.status(400).json({ error: "English text is required" });
  }

  const [a] = await db.insert(announcementsTable).values({
    title: title ?? "",
    titleAr: titleAr ?? "",
    body: body ?? "",
    bodyHtml: bodyHtml ?? "",
    bodyArabic: bodyArabic ?? "",
    visibility: targetVisibility,
    isPublic: false,
    pinned: pinned ?? false,
    status: targetStatus,
    authorId: caller.id,
    publishedAt: targetStatus === "published" ? new Date() : undefined,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  }).returning();

  if (targetStatus === "published") {
    if (pinned ?? false) {
      sendPushToAll({
        title: "📌 New Pinned Announcement",
        body: (title as string) ?? "A new notice has been posted.",
        data: { screen: "announcements", id: a.id },
      }, "announcements").catch(() => {});
    }

    // Row 8 — announcement_published (system-level: no specific recipientUserId)
    enqueueNotification({
      eventType: EVT.ANNOUNCEMENT_PUBLISHED,
      idempotencyKey: announcementPublishedKey(a.id, a.publishedAt?.toISOString() ?? new Date().toISOString()),
      recipientUserId: null,
      channel: "push",
      payload: {
        title: (pinned ?? false) ? "📌 New Pinned Announcement" : "📢 New Announcement",
        body: (typeof title === "string" ? title : null) ?? "A new notice has been posted.",
        data: { screen: "announcements", id: a.id },
      },
      preferencePolicy: "announcement",
    }).catch(() => {});
  }

  res.status(201).json({ ...addIsExpired(a), authorName: `${caller.firstName ?? ""} ${caller.lastName ?? ""}`.trim() || caller.email });
});

// ─── POST /announcements/ai-suggest ───────────────────────────────────────────
router.post("/announcements/ai-suggest", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { sourceText, sourceLang, title } = req.body;
  if (!sourceText) return res.status(400).json({ error: "sourceText is required" });
  if (!["en", "ar"].includes(sourceLang)) return res.status(400).json({ error: "sourceLang must be 'en' or 'ar'" });

  const isEnSource = sourceLang === "en";
  const titleTrimmed = typeof title === "string" ? title.trim() : "";

  // Optional title translation — runs in parallel but never fails the whole request
  const titleCallPromise: Promise<any> =
    isEnSource && titleTrimmed
      ? openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a professional Arabic translator for HOA communications. Translate this English announcement title into Modern Standard Arabic (فصحى). Return only the translated Arabic title — no explanation, no quotation marks.",
            },
            { role: "user", content: titleTrimmed },
          ],
          max_tokens: 120,
        }).catch(() => null)
      : Promise.resolve(null);

  const [optimizeResult, translateResult, titleResult] = await Promise.all([
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: isEnSource
            ? "You are a professional editor for HOA communications. Improve the clarity, tone, and professionalism of this HOA announcement text written in English. Keep the same meaning but make it cleaner and more polished. Return only the improved text."
            : "أنت محرر محترف لمراسلات جمعيات الملاك. حسّن وضوح ونبرة واحترافية هذا الإعلان المكتوب بالعربية. احتفظ بنفس المعنى ولكن اجعله أكثر أناقة واحترافية. أعد النص المحسّن فقط.",
        },
        { role: "user", content: sourceText },
      ],
      max_tokens: 800,
    }),
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: isEnSource
            ? "You are a professional Arabic translator specializing in HOA communications. Translate the following English HOA announcement text into Modern Standard Arabic (فصحى). Return only the translated Arabic text."
            : "You are a professional English translator specializing in HOA communications. Translate the following Arabic HOA announcement text into professional English. Return only the translated English text.",
        },
        { role: "user", content: sourceText },
      ],
      max_tokens: 800,
    }),
    titleCallPromise,
  ]);

  res.json({
    optimized: optimizeResult.choices[0]?.message?.content ?? "",
    translated: translateResult.choices[0]?.message?.content ?? "",
    titleAr: titleResult ? (titleResult.choices[0]?.message?.content ?? "") : "",
  });
});

// ─── POST /announcements/ai-generate (legacy — kept for backwards compat) ─────
router.post("/announcements/ai-generate", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { prompt, language } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  const isArabic = language === "ar";
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: isArabic
          ? "أنت مساعد لجمعية مدائن فيلدج. اكتب إعلانات HOA واضحة واحترافية وودية للسكان باللغة العربية الفصحى. أعد نص الإعلان فقط بدون عنوان أو مقدمة."
          : "You are an assistant for Madain Village HOA. Write clear, professional, friendly announcements for residents in English. Return only the announcement text (no subject line, no preamble). Use plain paragraphs.",
      },
      { role: "user", content: `Write an HOA announcement about: ${prompt}` },
    ],
    max_tokens: 600,
  });

  res.json({ text: completion.choices[0]?.message?.content ?? "" });
});

// ─── POST /announcements/ai-translate (legacy — kept for backwards compat) ────
router.post("/announcements/ai-translate", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a professional Arabic translator. Translate the provided HOA announcement text into Modern Standard Arabic (فصحى). Return only the translated Arabic text." },
      { role: "user", content: text },
    ],
    max_tokens: 800,
  });

  res.json({ arabic: completion.choices[0]?.message?.content ?? "" });
});

// ─── GET /announcements/:id ────────────────────────────────────────────────────
router.get("/announcements/:id", requireApiAuth, async (req, res) => {
  const [a] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, Number(req.params.id)));
  if (!a) return res.status(404).json({ error: "Not found" });
  const caller = await getCaller(req);
  if (!canView(caller, a)) return res.status(404).json({ error: "Not found" });
  const [enriched] = await withAuthorNames([a]);
  res.json(enriched);
});

// ─── PATCH /announcements/:id ─────────────────────────────────────────────────
router.patch("/announcements/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { title, titleAr, body, bodyHtml, bodyArabic, visibility, pinned, expiresAt, status, isMaterialChange, changeSummary } = req.body;

  const [existing] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, Number(req.params.id)));
  if (!existing || existing.status === "deleted") return res.status(404).json({ error: "Not found" });

  const targetStatus: string | undefined = status === "draft" ? "draft" : status === "published" ? "published" : undefined;

  const isPublishing = targetStatus === "published" || (!targetStatus && existing.status === "published");

  if (isPublishing) {
    const effectiveTitle = title ?? existing.title;
    const effectiveTitleAr = titleAr ?? existing.titleAr;
    const effectiveBodyHtml = bodyHtml ?? existing.bodyHtml;
    const effectiveBodyArabic = bodyArabic ?? existing.bodyArabic;
    if (!effectiveTitle?.trim()) return res.status(400).json({ error: "English title is required" });
    if (!effectiveTitleAr?.trim()) return res.status(400).json({ error: "Arabic title is required" });
    if (!effectiveBodyHtml?.trim()) return res.status(400).json({ error: "English text is required" });
    if (!effectiveBodyArabic?.trim()) return res.status(400).json({ error: "Arabic text is required" });
  }

  const updatePayload: Partial<typeof announcementsTable.$inferInsert> = {};
  if (title !== undefined) updatePayload.title = title;
  if (titleAr !== undefined) updatePayload.titleAr = titleAr;
  if (body !== undefined) updatePayload.body = body;
  if (bodyHtml !== undefined) updatePayload.bodyHtml = bodyHtml;
  if (bodyArabic !== undefined) updatePayload.bodyArabic = bodyArabic;
  if (visibility !== undefined) {
    if (!ANNOUNCEMENT_VISIBILITIES.includes(visibility)) {
      return res.status(400).json({ error: "Invalid announcement visibility" });
    }
    updatePayload.visibility = visibility;
  }
  // Legacy is_public is intentionally inert. Keep it false for all new writes.
  updatePayload.isPublic = false;
  if (pinned !== undefined) updatePayload.pinned = pinned;
  if (targetStatus !== undefined) {
    updatePayload.status = targetStatus;
    if (targetStatus === "published" && existing.status !== "published") {
      updatePayload.publishedAt = new Date();
    }
  }
  if (expiresAt !== undefined) updatePayload.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const [a] = await db
    .update(announcementsTable)
    .set(updatePayload)
    .where(eq(announcementsTable.id, Number(req.params.id)))
    .returning();
  if (!a) return res.status(404).json({ error: "Not found" });

  await db.insert(announcementEditHistoryTable).values({
    announcementId: a.id,
    editedBy: caller.id,
    changeSummary: changeSummary ?? null,
    wasFlaggedMaterial: isMaterialChange === true,
  });

  const [enriched] = await withAuthorNames([a]);

  const isPinned = updatePayload.pinned !== undefined ? updatePayload.pinned : existing.pinned;
  const wasJustPublished = updatePayload.status === "published" && existing.status !== "published";
  const effectiveTitle = (updatePayload.title ?? existing.title) as string;
  if (wasJustPublished) {
    sendPushToAll({
      title: isPinned ? "📌 New Pinned Announcement" : "📢 New Announcement",
      body: effectiveTitle ?? "A new notice has been posted.",
      data: { screen: "announcements", id: a.id },
    }, "announcements").catch(() => {});

    // Row 8 — announcement_published (draft → published transition)
    enqueueNotification({
      eventType: EVT.ANNOUNCEMENT_PUBLISHED,
      idempotencyKey: announcementPublishedKey(a.id, a.publishedAt?.toISOString() ?? new Date().toISOString()),
      recipientUserId: null,
      channel: "push",
      payload: {
        title: isPinned ? "📌 New Pinned Announcement" : "📢 New Announcement",
        body: effectiveTitle ?? "A new notice has been posted.",
        data: { screen: "announcements", id: a.id },
      },
      preferencePolicy: "announcement",
    }).catch(() => {});
  } else if (isPinned && updatePayload.pinned === true && existing.status === "published") {
    sendPushToAll({
      title: "📌 Pinned Announcement Updated",
      body: effectiveTitle ?? "A pinned notice has been updated.",
      data: { screen: "announcements", id: a.id },
    }, "announcements").catch(() => {});
  }

  // ── Material-change email notification (FR-7) ──────────────────────────────
  if (isMaterialChange === true && a.status === "published") {
    const effectiveTitleEn = (updatePayload.title ?? existing.title ?? "") as string;
    const effectiveTitleAr = (updatePayload.titleAr ?? existing.titleAr ?? "") as string;
    const portalUrl = (() => {
      const d = process.env["REPLIT_DOMAINS"]?.split(",")[0];
      return d ? `https://${d}/portal/announcements` : "http://localhost:80/portal/announcements";
    })();

    // Determine who receives the email
    const effectiveVisibility = updatePayload.visibility ?? existing.visibility;
    getSmtpConfig().then(async cfg => {
      if (!cfg) return;
      try {
        const baseCondition = ne(usersTable.role, "admin" as any);
        const recipients = await db
          .select({ email: usersTable.email, firstName: usersTable.firstName })
          .from(usersTable)
          .where(
            effectiveVisibility === "all_portal_users"
              ? baseCondition
              : and(baseCondition, eq(usersTable.verificationStatus, "verified_owner" as any)),
          );

        const subject = effectiveTitleEn
          ? `[Madain Village] Important Notice: ${effectiveTitleEn}`
          : "[Madain Village] Important Notice";

        for (const u of recipients) {
          if (!u.email) continue;
          const html = `
            <div dir="rtl" style="font-family:Arial,sans-serif;margin-bottom:16px;background:#f9f5f0;padding:16px;border-radius:8px;border:1px solid #e0d5c5;">
              <p style="font-size:15px;color:#0F4442;margin:0 0 8px;">${effectiveTitleAr}</p>
            </div>
            <div style="font-family:Arial,sans-serif;">
              <p style="font-size:15px;color:#0F4442;margin:0 0 16px;">${effectiveTitleEn}</p>
              <a href="${portalUrl}" style="display:inline-block;background:#E27A2F;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
                View Announcement
              </a>
            </div>
          `;
          await sendEmail(u.email, subject, html).catch(() => {});
        }
      } catch {
        // Non-fatal — never block the API response
      }
    }).catch(() => {});
  }

  res.json(enriched);
});

// ─── DELETE /announcements/:id (soft delete) ──────────────────────────────────
router.delete("/announcements/:id", requireApiAuth, async (req, res) => {
  const clerkId = req.auth().userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!caller || caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, Number(req.params.id)));
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.update(announcementsTable)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(eq(announcementsTable.id, Number(req.params.id)));

  res.status(204).send();
});

export default router;
