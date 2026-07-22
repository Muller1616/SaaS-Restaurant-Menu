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
    return { ok: true as const, messageId: info.messageId };
  } catch (error) {
    logger.warn("Email send failed", {
      to: input.to,
      subject: input.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, error };
  }
}

export function registrationReceivedEmail(input: {
  fullName: string;
  businessName: string;
  planName: string;
}) {
  const subject = "We received your KitchenOS application";
  const text = `Hi ${input.fullName},

We received your application for ${input.businessName}.

Selected plan: ${input.planName}

Our team will review your registration and notify you by email once a decision is made.

Best regards,
KitchenOS Team`;

  return { subject, text };
}

export function accountApprovedEmail(input: {
  fullName: string;
  businessName: string;
  email: string;
  password: string;
  planName: string;
  branchName: string;
  loginUrl: string;
  trialDays?: number;
}) {
  const trialDays = input.trialDays ?? 14;
  const subject = "Your KitchenOS Account is Ready!";
  const text = `Hi ${input.fullName},

Your registration for ${input.businessName} has been approved.

Your login credentials:
Email: ${input.email}
Password: ${input.password}

Login here: ${input.loginUrl}

Please change your password after first login.

Your plan: ${input.planName}
Branch: ${input.branchName}
Trial: ${trialDays}-day free trial has started (full access).

Best regards,
KitchenOS Team`;

  const html = `
  <div style="font-family:Manrope,Arial,sans-serif;background:#070a09;color:#eef2ef;padding:32px">
    <div style="max-width:560px;margin:0 auto;background:#121a17;border:1px solid rgba(232,196,154,0.18);border-radius:24px;padding:28px">
      <p style="letter-spacing:0.28em;text-transform:uppercase;color:#d4a574;font-size:12px;margin:0">KitchenOS</p>
      <h1 style="font-family:Georgia,serif;font-size:32px;margin:12px 0 8px;color:#fff">Your account is ready</h1>
      <p style="color:rgba(238,242,239,0.72);line-height:1.6">Hi ${input.fullName}, your registration for <strong style="color:#fff">${input.businessName}</strong> has been approved.</p>
      <div style="margin:24px 0;padding:16px;border-radius:16px;background:rgba(0,0,0,0.28);border:1px solid rgba(232,196,154,0.18)">
        <p style="margin:0 0 8px"><strong>Email:</strong> ${input.email}</p>
        <p style="margin:0 0 8px"><strong>Password:</strong> ${input.password}</p>
        <p style="margin:0"><strong>Plan:</strong> ${input.planName}</p>
        <p style="margin:8px 0 0"><strong>Branch:</strong> ${input.branchName}</p>
        <p style="margin:8px 0 0"><strong>Trial:</strong> ${trialDays}-day free trial started</p>
      </div>
      <a href="${input.loginUrl}" style="display:inline-block;background:#d4a574;color:#070a09;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Login to KitchenOS</a>
      <p style="margin-top:20px;color:rgba(238,242,239,0.65);font-size:14px">Please change your password after first login.</p>
    </div>
  </div>`;

  return { subject, text, html };
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
