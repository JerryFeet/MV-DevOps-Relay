import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { hoaSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function getNotificationEmail(): Promise<string> {
  const [notifRow] = await db
    .select()
    .from(hoaSettingsTable)
    .where(eq(hoaSettingsTable.key, "notification_email"));
  if (notifRow?.value) return notifRow.value;

  const [contactRow] = await db
    .select()
    .from(hoaSettingsTable)
    .where(eq(hoaSettingsTable.key, "contact_email"));
  return contactRow?.value ?? "";
}

/**
 * Resolve SMTP configuration: DB settings take priority over env vars.
 * Returns null if the minimum required fields (host, user, pass) are missing.
 */
export async function getSmtpConfig(): Promise<{
  host: string;
  user: string;
  pass: string;
  port: number;
  secure: boolean;
} | null> {
  const rows = await db.select().from(hoaSettingsTable);
  const db_: Record<string, string> = {};
  for (const row of rows) db_[row.key] = row.value;

  const host = db_["smtp_host"] || process.env.SMTP_HOST || "";
  const user = db_["smtp_user"] || process.env.SMTP_USER || "";
  const pass = db_["smtp_pass"] || process.env.SMTP_PASS || "";
  if (!host || !user || !pass) return null;

  const port = Number(db_["smtp_port"] || process.env.SMTP_PORT || 587);
  const secure = (db_["smtp_secure"] || process.env.SMTP_SECURE || "false") === "true";
  return { host, user, pass, port, secure };
}

/**
 * Send a fire-and-forget admin alert email.
 * Silently skips if SMTP is not configured or no destination email is set.
 * Never throws — email failure must never block an API response.
 */
export async function sendAdminAlert(subject: string, html: string): Promise<void> {
  const cfg = await getSmtpConfig();
  if (!cfg) return;

  const toEmail = await getNotificationEmail();
  if (!toEmail) return;

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    await transporter.sendMail({
      from: `"Madain Village Portal" <${cfg.user}>`,
      to: toEmail,
      subject,
      html:
        html +
        `<hr/><p style="color:#888;font-size:12px">Madain Village Resident Portal — Action Required. Log in to the admin portal to review.</p>`,
    });
  } catch {
    // Non-fatal — never block the API response
  }
}

/**
 * Send an email to a specific recipient (e.g. outgoing owner notification).
 * Silently skips if SMTP is not configured.
 * Never throws — email failure must never block an API response.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const cfg = await getSmtpConfig();
  if (!cfg || !to) return;
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({
      from: `"Madain Village Portal" <${cfg.user}>`,
      to,
      subject,
      html: html + `<hr/><p style="color:#888;font-size:12px">Madain Village Resident Portal</p>`,
    });
  } catch {
    // Non-fatal — never block the API response
  }
}

/**
 * Send a test email to verify SMTP configuration.
 * Unlike sendAdminAlert, this function throws on failure so the caller can
 * surface the error to the admin UI.
 */
export async function sendTestEmail(): Promise<void> {
  const cfg = await getSmtpConfig();
  if (!cfg) throw new Error("SMTP is not configured. Set host, username, and password.");

  const toEmail = await getNotificationEmail();
  if (!toEmail) throw new Error("No notification or contact email is configured. Set one in HOA Settings first.");

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await transporter.sendMail({
    from: `"Madain Village Portal" <${cfg.user}>`,
    to: toEmail,
    subject: "Test Email — Madain Village Portal",
    html: `<h2>Test Email</h2><p>This is a test email sent from the Madain Village Portal admin settings to confirm your SMTP configuration is working correctly.</p><hr/><p style="color:#888;font-size:12px">Madain Village Resident Portal</p>`,
  });
}
