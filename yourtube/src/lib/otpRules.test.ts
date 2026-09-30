import { describe, expect, it } from "vitest";
import { checkSendAllowed, maskEmail, maskPhone, normalizeIndianMobile } from "./otpRules";

const S = 1000;
const MIN = 60 * S;

describe("checkSendAllowed", () => {
  it("first send is allowed", () => {
    expect(checkSendAllowed([], 0)).toEqual({ ok: true, log: [0] });
  });

  it("blocks within 30 s and reports the wait", () => {
    const r = checkSendAllowed([100 * S], 110 * S);
    expect(r).toEqual({ ok: false, reason: "COOLDOWN", retryAfterMs: 20 * S });
  });

  it("allows again at exactly 30 s", () => {
    expect(checkSendAllowed([0], 30 * S).ok).toBe(true);
  });

  it("caps at 5 per rolling hour", () => {
    const log = [0, 1, 2, 3, 4].map((i) => i * MIN);
    const r = checkSendAllowed(log, 10 * MIN);
    expect(r).toMatchObject({ ok: false, reason: "HOURLY_LIMIT" });
    if (!r.ok) expect(r.retryAfterMs).toBe(50 * MIN);
    // An hour after the first send, one slot frees up.
    expect(checkSendAllowed(log, 60 * MIN).ok).toBe(true);
  });

  it("prunes entries older than an hour", () => {
    const r = checkSendAllowed([0, 5 * MIN], 2 * 60 * MIN);
    expect(r).toEqual({ ok: true, log: [2 * 60 * MIN] });
  });
});

describe("normalizeIndianMobile", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["91-98765-43210", "+919876543210"],
    ["098765 43210", "+919876543210"],
    ["6000000000", "+916000000000"],
  ])("%s → %s", (input, out) => expect(normalizeIndianMobile(input)).toBe(out));

  it.each(["12345", "5876543210", "98765432101", "+1 415 555 0100", "abcdefghij", ""])("rejects %s", (input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
  });
});

describe("masking", () => {
  it("masks phone and email", () => {
    expect(maskPhone("+919876543210")).toBe("+91 98******10");
    expect(maskEmail("piushgogi@gmail.com")).toBe("pi*******@gmail.com");
  });
});
