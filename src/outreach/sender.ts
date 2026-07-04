// Provider-agnostic email sending.
// EMAIL_PROVIDER=console logs the send (dev default); =resend sends via the
// Resend API. Production also needs SPF/DKIM/DMARC on the sending domain and
// gradual warmup - see PLAN.md section 5.
import { config } from "../config.js";

export interface OutboundEmail {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export async function sendEmail(email: OutboundEmail): Promise<SendResult> {
  if (config.emailProvider === "resend") {
    return sendViaResend(email);
  }
  // console provider: dev/dry-run
  console.log(`\n=== EMAIL (console provider) ===\nTo: ${email.to}\nReply-To: ${email.replyTo ?? "-"}\nSubject: ${email.subject}\n\n${email.text}\n=== END EMAIL ===\n`);
  return { ok: true, providerMessageId: `console-${Date.now()}` };
}

async function sendViaResend(email: OutboundEmail): Promise<SendResult> {
  if (!config.resendApiKey) return { ok: false, error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [email.to],
      reply_to: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, providerMessageId: data.id };
}
