// OTP policy shared by the API routes (enforcement) and the OTP dialog (UI).

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

export type OtpChannel = "email" | "sms";

export type SendCheck =
  | { ok: true; log: number[] }
  | { ok: false; reason: "COOLDOWN" | "HOURLY_LIMIT"; retryAfterMs: number };

/**
 * Rate limit: one send per 30 s and at most 5 per rolling hour.
 * `log` holds previous send times (ms); returns the pruned log with `now` added.
 */
export function checkSendAllowed(log: number[], now: number): SendCheck {
  const recent = log.filter((t) => now - t < HOUR_MS).sort((a, b) => a - b);
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < OTP_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "COOLDOWN", retryAfterMs: OTP_RESEND_COOLDOWN_MS - (now - last) };
  }
  if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
    return { ok: false, reason: "HOURLY_LIMIT", retryAfterMs: HOUR_MS - (now - recent[0]) };
  }
  return { ok: true, log: [...recent, now] };
}

/** Indian mobile: +91 followed by 10 digits starting 6-9. Accepts spaces, dashes, a leading 0 or 91. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = (input ?? "").replace(/[\s()-]/g, "").replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export const maskPhone = (phone: string) => phone.replace(/^(\+91)(\d{2})\d{6}(\d{2})$/, "$1 $2******$3");

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
