#!/usr/bin/env node
/**
 * Builds Training Pal branded auth email HTML into supabase/templates/
 * and can push them to the hosted Supabase project via the Management API.
 *
 * Usage:
 *   node scripts/build-auth-emails.mjs              # write HTML files
 *   node scripts/build-auth-emails.mjs --push        # write + PATCH auth config
 *
 * --push needs SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 * and optionally PROJECT_REF (default: nwdxrkowrfkzilxlnhrl).
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "supabase", "templates");
const PROJECT_REF = process.env.PROJECT_REF || "nwdxrkowrfkzilxlnhrl";

const BRAND = {
  name: "Training Pal",
  eyebrow: "Your training",
  accent: "#e4572e",
  bg: "#f6f5f1",
  surface: "#ffffff",
  text: "#1d1d1f",
  muted: "#6e6e73",
  line: "#e6e4de",
};

function layout({ preheader, title, bodyHtml, ctaLabel, ctaUrl, footnote }) {
  const cta = ctaLabel && ctaUrl
    ? `
                  <tr>
                    <td style="padding:8px 0 4px;">
                      <a href="${ctaUrl}" style="display:inline-block;background:${BRAND.accent};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;line-height:1;padding:14px 22px;border-radius:12px;">
                        ${ctaLabel}
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                      Or copy this link into your browser:<br />
                      <a href="${ctaUrl}" style="color:${BRAND.accent};word-break:break-all;">${ctaUrl}</a>
                    </td>
                  </tr>`
    : "";

  const note = footnote
    ? `<tr><td style="padding:18px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted};">${footnote}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:16px;">
          <tr>
            <td style="padding:28px 28px 8px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="{{ .SiteURL }}/assets/icon-192.png" width="40" height="40" alt="" style="display:block;border-radius:10px;border:0;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      ${BRAND.eyebrow}
                    </div>
                    <div style="font-size:18px;font-weight:700;letter-spacing:-0.03em;color:${BRAND.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      ${BRAND.name}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:0 0 10px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${BRAND.text};">
                    ${title}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 8px;font-size:15px;line-height:1.55;color:${BRAND.text};">
                    ${bodyHtml}
                  </td>
                </tr>
                ${cta}
                ${note}
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:${BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:center;">
              Sent by ${BRAND.name}. If you didn’t expect this email, you can ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

const templates = {
  confirmation: {
    file: "confirmation.html",
    subject: "Confirm your Training Pal email",
    mailerKey: "confirmation",
    html: layout({
      preheader: "Confirm your email to finish creating your Training Pal account.",
      title: "Confirm your email",
      bodyHtml: `Welcome to <strong>${BRAND.name}</strong>. Tap the button below to confirm <strong>{{ .Email }}</strong> and finish signing up.`,
      ctaLabel: "Confirm email",
      ctaUrl: "{{ .ConfirmationURL }}",
      footnote: "This link expires soon and can only be used once.",
    }),
  },
  recovery: {
    file: "recovery.html",
    subject: "Reset your Training Pal password",
    mailerKey: "recovery",
    html: layout({
      preheader: "Choose a new password for your Training Pal account.",
      title: "Reset your password",
      bodyHtml: `We received a request to reset the password for <strong>{{ .Email }}</strong>. Tap below to choose a new one.`,
      ctaLabel: "Choose new password",
      ctaUrl: "{{ .ConfirmationURL }}",
      footnote: "If you didn’t ask for a reset, you can safely ignore this email. Your password won’t change.",
    }),
  },
  magic_link: {
    file: "magic_link.html",
    subject: "Your Training Pal sign-in link",
    mailerKey: "magic_link",
    html: layout({
      preheader: "Use this one-time link to sign in to Training Pal.",
      title: "Sign in to Training Pal",
      bodyHtml: `Tap the button below to sign in as <strong>{{ .Email }}</strong>. This link expires shortly and can only be used once.`,
      ctaLabel: "Sign in",
      ctaUrl: "{{ .ConfirmationURL }}",
      footnote: "If you didn’t try to sign in, you can ignore this email.",
    }),
  },
  invite: {
    file: "invite.html",
    subject: "You’re invited to Training Pal",
    mailerKey: "invite",
    html: layout({
      preheader: "You’ve been invited to create a Training Pal account.",
      title: "You’re invited",
      bodyHtml: `You’ve been invited to create a <strong>${BRAND.name}</strong> account. Tap below to accept and get started.`,
      ctaLabel: "Accept invitation",
      ctaUrl: "{{ .ConfirmationURL }}",
    }),
  },
  email_change: {
    file: "email_change.html",
    subject: "Confirm your new Training Pal email",
    mailerKey: "email_change",
    html: layout({
      preheader: "Confirm your new email address for Training Pal.",
      title: "Confirm your new email",
      bodyHtml: `Please confirm <strong>{{ .NewEmail }}</strong> as the new email for your ${BRAND.name} account.`,
      ctaLabel: "Confirm new email",
      ctaUrl: "{{ .ConfirmationURL }}",
      footnote: "If you didn’t request this change, you can ignore this email.",
    }),
  },
  reauthentication: {
    file: "reauthentication.html",
    subject: "{{ .Token }} is your Training Pal code",
    mailerKey: "reauthentication",
    html: layout({
      preheader: "Your Training Pal verification code.",
      title: "Your verification code",
      bodyHtml: `Use this code to verify it’s you. It expires shortly.`,
      footnote: `<div style="font-size:32px;letter-spacing:0.18em;font-weight:700;color:${BRAND.text};padding:8px 0;">{{ .Token }}</div>`,
    }),
  },
  password_changed_notification: {
    file: "password_changed_notification.html",
    subject: "Your Training Pal password was changed",
    mailerKey: "password_changed_notification",
    notificationEnabledKey: "mailer_notifications_password_changed_enabled",
    html: layout({
      preheader: "Your Training Pal password was changed.",
      title: "Password changed",
      bodyHtml: `The password for your ${BRAND.name} account was recently changed.`,
      footnote: `If you didn’t make this change, <a href="{{ .SiteURL }}" style="color:${BRAND.accent};">reset your password</a> right away.`,
    }),
  },
  email_changed_notification: {
    file: "email_changed_notification.html",
    subject: "Your Training Pal email was changed",
    mailerKey: "email_changed_notification",
    notificationEnabledKey: "mailer_notifications_email_changed_enabled",
    html: layout({
      preheader: "Your Training Pal email address was changed.",
      title: "Email address changed",
      bodyHtml: `The email for your ${BRAND.name} account was changed from <strong>{{ .OldEmail }}</strong> to <strong>{{ .Email }}</strong>.`,
      footnote: `If you didn’t make this change, sign in at <a href="{{ .SiteURL }}" style="color:${BRAND.accent};">{{ .SiteURL }}</a> and secure your account.`,
    }),
  },
};

async function writeTemplates() {
  await mkdir(OUT, { recursive: true });
  for (const tpl of Object.values(templates)) {
    const path = join(OUT, tpl.file);
    await writeFile(path, tpl.html.trim() + "\n", "utf8");
    console.log(`wrote ${path}`);
  }
}

function authPayload() {
  const payload = {};
  for (const tpl of Object.values(templates)) {
    payload[`mailer_subjects_${tpl.mailerKey}`] = tpl.subject;
    payload[`mailer_templates_${tpl.mailerKey}_content`] = tpl.html.trim();
    if (tpl.notificationEnabledKey) payload[tpl.notificationEnabledKey] = true;
  }
  return payload;
}

async function pushTemplates() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN is required for --push. Create one at https://supabase.com/dashboard/account/tokens"
    );
  }

  // Prefer freshly built content; fall back to files on disk.
  const payload = authPayload();
  for (const tpl of Object.values(templates)) {
    const fromDisk = await readFile(join(OUT, tpl.file), "utf8");
    payload[`mailer_templates_${tpl.mailerKey}_content`] = fromDisk.trim();
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Auth config update failed (${res.status}): ${text.slice(0, 500)}`);
  }
  console.log(`Pushed ${Object.keys(templates).length} templates to project ${PROJECT_REF}`);
}

const wantPush = process.argv.includes("--push");
await writeTemplates();
if (wantPush) await pushTemplates();
