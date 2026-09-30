// Outgoing email behind a tiny interface so Gmail SMTP can be swapped for
// Resend (or anything else) by changing getMailer().
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import nodemailer, { type Transporter } from "nodemailer";

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

export interface Mailer {
  send(message: MailMessage): Promise<{ messageId: string }>;
}

class SmtpMailer implements Mailer {
  private transport: Transporter;

  constructor(
    user: string,
    pass: string,
    private from: string
  ) {
    this.transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }

  async send(message: MailMessage) {
    const info = await this.transport.sendMail({ from: this.from, ...message });
    return { messageId: info.messageId };
  }
}

/** Test-only: writes each message to MAIL_CAPTURE_DIR instead of sending it. */
class CaptureMailer implements Mailer {
  constructor(private dir: string) {}

  async send(message: MailMessage) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await mkdir(this.dir, { recursive: true });
    for (const a of message.attachments ?? []) await writeFile(path.join(this.dir, `${id}-${a.filename}`), a.content);
    const { attachments, ...rest } = message;
    await writeFile(
      path.join(this.dir, `${id}.json`),
      JSON.stringify({ ...rest, attachments: (attachments ?? []).map((a) => `${id}-${a.filename}`) })
    );
    return { messageId: id };
  }
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (mailer) return mailer;
  if (process.env.MAIL_CAPTURE_DIR) {
    mailer = new CaptureMailer(process.env.MAIL_CAPTURE_DIR);
    return mailer;
  }
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error("Email is not configured: set SMTP_USER and SMTP_PASS");
  mailer = new SmtpMailer(user, pass, process.env.MAIL_FROM || `YourTube <${user}>`);
  return mailer;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
