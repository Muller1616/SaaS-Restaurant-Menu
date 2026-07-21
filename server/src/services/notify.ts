import { prisma } from "../lib/prisma.js";
import { sendEmail } from "../services/email.js";

/**
 * Store an in-app notification and optionally email the tenant.
 * Emails respect `emailNotificationsEnabled` unless `forceEmail` is set
 * (use for credential delivery such as account approval).
 */
export async function notifyTenant(input: {
  tenantId: string;
  type: "SYSTEM" | "PAYMENT" | "SUBSCRIPTION";
  title: string;
  message: string;
  email?: {
    subject: string;
    text: string;
    html?: string;
  };
  /** Bypass the tenant email preference (transactional / credentials). */
  forceEmail?: boolean;
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      email: true,
      emailNotificationsEnabled: true,
    },
  });

  if (!tenant) return { emailed: false, stored: false };

  await prisma.notification.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      message: input.message,
      sentAt: new Date(),
    },
  });

  const shouldEmail =
    Boolean(input.email) &&
    (input.forceEmail || tenant.emailNotificationsEnabled);

  if (input.email && shouldEmail) {
    await sendEmail({
      to: tenant.email,
      subject: input.email.subject,
      text: input.email.text,
      html: input.email.html,
    });
    return { emailed: true, stored: true };
  }

  return { emailed: false, stored: true };
}
