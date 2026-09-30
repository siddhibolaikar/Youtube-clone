import { describe, expect, it } from "vitest";
import { canUpgrade, formatInr, getPlan, getProduct, PLANS } from "./plans";

describe("plan limits", () => {
  it.each([
    ["free", 300],
    ["bronze", 420],
    ["silver", 600],
    ["gold", null],
  ] as const)("%s → %s seconds", (id, seconds) => {
    expect(getPlan(id).watchLimitSec).toBe(seconds);
  });

  it("unknown or missing plan falls back to Free", () => {
    expect(getPlan(undefined).id).toBe("free");
    expect(getPlan(null).id).toBe("free");
    // Firestore data is untrusted input
    expect(getPlan("platinum" as never).id).toBe("free");
  });
});

describe("prices come from config", () => {
  it.each([
    ["premium", 9900],
    ["bronze", 1000],
    ["silver", 5000],
    ["gold", 10000],
  ])("%s costs %i paise", (id, paise) => {
    expect(getProduct(id)?.amountPaise).toBe(paise);
  });

  it("free and unknown are not purchasable", () => {
    expect(getProduct("free")).toBeNull();
    expect(getProduct("anything")).toBeNull();
    expect(getProduct({ amountPaise: 1 })).toBeNull();
  });

  it("formats rupees", () => {
    expect(formatInr(PLANS.gold.pricePaise)).toBe("₹100");
    expect(formatInr(9950)).toBe("₹99.50");
  });
});

describe("canUpgrade", () => {
  it("only allows strictly higher plans", () => {
    expect(canUpgrade("free", "bronze")).toBe(true);
    expect(canUpgrade(undefined, "gold")).toBe(true);
    expect(canUpgrade("silver", "silver")).toBe(false);
    expect(canUpgrade("silver", "bronze")).toBe(false);
    expect(canUpgrade("gold", "gold")).toBe(false);
  });
});
