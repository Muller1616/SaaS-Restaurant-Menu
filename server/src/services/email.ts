import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth:
    env.smtp.user && env.smtp.pass
      ? { user: env.smtp.user, pass: env.smtp.pass }
      : undefined,
});

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  try {
    const info = await transporter.sendMail({
      from: env.smtp.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<pre>${input.text}</pre>`,
    });
    logger.info("Email sent", {
      to: input.to,
      subject: input.subject,
      messageId: info.messageId,
    });
    return { ok: true as const, messageId: info.messageId };
  } catch (error) {
    logger.error(
      "Email send failed",
      error,
      {
        to: input.to,
        subject: input.subject,
        smtpHost: env.smtp.host,
        smtpPort: env.smtp.port,
      },
    );
    return { ok: false as const, error };
  }
}

/** Soft SMTP probe for startup diagnostics — never throws. */
export async function verifySmtpConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    logger.info("SMTP connection verified", {
      host: env.smtp.host,
      port: env.smtp.port,
    });
    return true;
  } catch (error) {
    logger.warn("SMTP connection check failed — emails may not deliver", {
      host: env.smtp.host,
      port: env.smtp.port,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export function registrationReceivedEmail(input: {
  fullName: string;
  businessName: string;
  planName: string;
}) {
  const subject = "We received your KitchenOS application";
  const text = `Hi ${input.fullName},

Your restaurant registration for ${input.businessName} has been received successfully and is currently under review.

Selected plan: ${input.planName}

What happens next:
1. Our team reviews your application.
2. After approval, you will receive another email containing:
   - Your account activation link
   - A temporary password
   - Login instructions

You cannot sign in until your application is approved.

Best regards,
KitchenOS Team`;

  const html = `
  <div style="font-family:Manrope,Arial,sans-serif;background:#070a09;color:#eef2ef;padding:32px">
    <div style="max-width:560px;margin:0 auto;background:#121a17;border:1px solid rgba(232,196,154,0.18);border-radius:24px;padding:28px">
      <p style="letter-spacing:0.28em;text-transform:uppercase;color:#d4a574;font-size:12px;margin:0">KitchenOS</p>
      <h1 style="font-family:Georgia,serif;font-size:32px;margin:12px 0 8px;color:#fff">Application received</h1>
      <p style="color:rgba(238,242,239,0.72);line-height:1.6">Hi ${escapeHtml(input.fullName)}, thank you for registering <strong style="color:#fff">${escapeHtml(input.businessName)}</strong>.</p>
      <p style="color:rgba(238,242,239,0.72);line-height:1.6">Your application has been received successfully and is <strong style="color:#fff">currently under review</strong>.</p>
      <div style="margin:24px 0;padding:16px;border-radius:16px;background:rgba(0,0,0,0.28);border:1px solid rgba(232,196,154,0.18)">
        <p style="margin:0 0 12px"><strong>Selected plan:</strong> ${escapeHtml(input.planName)}</p>
        <p style="margin:0 0 8px;color:rgba(238,242,239,0.72)">After approval, you will receive another email with:</p>
        <ul style="margin:0;padding-left:18px;color:rgba(238,242,239,0.72);line-height:1.7">
          <li>Account activation link</li>
          <li>Temporary password</li>
          <li>Login instructions</li>
        </ul>
      </div>
      <p style="margin:0;color:rgba(238,242,239,0.55);font-size:13px">You cannot sign in until your application is approved.</p>
    </div>
  </div>`;

  return { subject, text, html };
}

export function accountApprovedEmail(input: {
  fullName: string;
  businessName: string;
  email: string;
  password: string;
  planName: string;
  branchName: string;
  loginUrl: string;
  activationUrl: string;
  activationHours: number;
  trialDays?: number;
}) {
  const trialDays = input.trialDays ?? 14;
  const subject = "Your KitchenOS Account is Ready — Activate now";
  const text = `Hi ${input.fullName},

Your registration for ${input.businessName} has been approved.

Activate your account (link expires in ${input.activationHours} hours):
${input.activationUrl}

Temporary credentials (for activation only):
Email: ${input.email}
Temporary password: ${input.password}

On the activation page, enter the temporary password and choose a new password. The temporary password will stop working after activation.

Then sign in here: ${input.loginUrl}

Plan: ${input.planName}
Branch: ${input.branchName}
Trial: ${trialDays}-day free trial has started.

Best regards,
KitchenOS Team`;

  const html = `
  <div style="font-family:Manrope,Arial,sans-serif;background:#070a09;color:#eef2ef;padding:32px">
    <div style="max-width:560px;margin:0 auto;background:#121a17;border:1px solid rgba(232,196,154,0.18);border-radius:24px;padding:28px">
      <p style="letter-spacing:0.28em;text-transform:uppercase;color:#d4a574;font-size:12px;margin:0">KitchenOS</p>
      <h1 style="font-family:Georgia,serif;font-size:32px;margin:12px 0 8px;color:#fff">You're approved</h1>
      <p style="color:rgba(238,242,239,0.72);line-height:1.6">Hi ${escapeHtml(input.fullName)}, <strong style="color:#fff">${escapeHtml(input.businessName)}</strong> is ready. Activate your account to choose a permanent password.</p>
      <div style="margin:24px 0;padding:16px;border-radius:16px;background:rgba(0,0,0,0.28);border:1px solid rgba(232,196,154,0.18)">
        <p style="margin:0 0 8px"><strong>Email:</strong> ${escapeHtml(input.email)}</p>
        <p style="margin:0 0 8px"><strong>Temporary password:</strong> ${escapeHtml(input.password)}</p>
        <p style="margin:0 0 8px"><strong>Plan:</strong> ${escapeHtml(input.planName)}</p>
        <p style="margin:0 0 8px"><strong>Branch:</strong> ${escapeHtml(input.branchName)}</p>
        <p style="margin:0"><strong>Trial:</strong> ${trialDays}-day free trial started</p>
      </div>
      <a href="${input.activationUrl}" style="display:inline-block;background:#d4a574;color:#070a09;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Activate account</a>
      <p style="margin-top:20px;color:rgba(238,242,239,0.65);font-size:14px">This activation link expires in <strong>${input.activationHours} hours</strong> and can be used once. After activation, sign in at <a href="${input.loginUrl}" style="color:#d4a574">${escapeHtml(input.loginUrl)}</a>.</p>
    </div>
  </div>`;

  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function accountRejectedEmail(input: {
  fullName: string;
  businessName: string;
  reason?: string;
}) {
  const subject = "KitchenOS registration update";
  const reasonLine = input.reason?.trim()
    ? `\nReason: ${input.reason.trim()}\n`
    : "\n";
  const text = `Hi ${input.fullName},

Thank you for applying to KitchenOS for ${input.businessName}.

Unfortunately, your registration was not approved at this time.
${reasonLine}
You may submit a new application if you wish to try again.

Best regards,
KitchenOS Team`;

  return { subject, text };
}

export function subscriptionNearExpiryEmail(input: {
  fullName: string;
  businessName: string;
  branchName: string;
  planName: string;
  daysRemaining: number;
  expiryDate: Date;
  renewUrl: string;
}) {
  const when =
    input.daysRemaining <= 0
      ? "today"
      : `in ${input.daysRemaining} day${input.daysRemaining === 1 ? "" : "s"}`;
  const subject = `KitchenOS subscription expires ${when}`;
  const text = `Hi ${input.fullName},

Your KitchenOS subscription for ${input.branchName} (${input.businessName}) expires ${when}.

Plan: ${input.planName}
Expiry date: ${input.expiryDate.toDateString()}

Renew now to keep your public menu and editing access uninterrupted:
${input.renewUrl}

Best regards,
KitchenOS Team`;

  return { subject, text };
}

export function subscriptionExpiredEmail(input: {
  fullName: string;
  businessName: string;
  branchName: string;
  planName: string;
  renewUrl: string;
}) {
  const subject = "Your KitchenOS subscription has expired";
  const text = `Hi ${input.fullName},

Your KitchenOS subscription for ${input.branchName} (${input.businessName}) has expired.

Plan: ${input.planName}

Your public menu is temporarily unavailable and menu editing is locked until you renew.

Renew here:
${input.renewUrl}

Best regards,
KitchenOS Team`;

  return { subject, text };
}
