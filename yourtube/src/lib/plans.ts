// Single source of truth for plans and prices. The server reads amounts from
// here when it creates Razorpay orders; the client only ever sends a product id.

import type { PlanId } from "./types";

export interface PlanConfig {
  id: PlanId;
  name: string;
  pricePaise: number;
  /** Seconds of playback allowed per video; null = unlimited. */
  watchLimitSec: number | null;
  rank: number;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: { id: "free", name: "Free", pricePaise: 0, watchLimitSec: 5 * 60, rank: 0 },
  bronze: { id: "bronze", name: "Bronze", pricePaise: 10_00, watchLimitSec: 7 * 60, rank: 1 },
  silver: { id: "silver", name: "Silver", pricePaise: 50_00, watchLimitSec: 10 * 60, rank: 2 },
  gold: { id: "gold", name: "Gold", pricePaise: 100_00, watchLimitSec: null, rank: 3 },
};

export const PLAN_ORDER: PlanId[] = ["free", "bronze", "silver", "gold"];

export const PREMIUM = {
  id: "premium" as const,
  name: "Premium (Downloads)",
  pricePaise: 99_00,
};

export const FREE_DAILY_DOWNLOADS = 1;

export type ProductId = "premium" | Exclude<PlanId, "free">;

export interface Product {
  id: ProductId;
  name: string;
  amountPaise: number;
  /** Bullet points for the invoice and the purchase UI. */
  includes: string[];
}

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS;

export function getPlan(id: PlanId | null | undefined): PlanConfig {
  return PLANS[id && isPlanId(id) ? id : "free"];
}

export function watchLimitLabel(plan: PlanConfig): string {
  return plan.watchLimitSec === null ? "Unlimited watch time" : `${plan.watchLimitSec / 60} minutes per video`;
}

export function getProduct(id: unknown): Product | null {
  if (id === "premium") {
    return {
      id: "premium",
      name: PREMIUM.name,
      amountPaise: PREMIUM.pricePaise,
      includes: ["Unlimited video downloads", "Does not change your watch-time plan"],
    };
  }
  if (id === "bronze" || id === "silver" || id === "gold") {
    const plan = PLANS[id];
    return {
      id,
      name: `${plan.name} plan`,
      amountPaise: plan.pricePaise,
      includes: [watchLimitLabel(plan), `Downloads: ${FREE_DAILY_DOWNLOADS} per day (unlimited with Premium)`],
    };
  }
  return null;
}

/** Upgrade only: the target plan must rank above the current one. */
export const canUpgrade = (current: PlanId | undefined, target: PlanId) =>
  PLANS[target].rank > getPlan(current).rank;

export const formatInr = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0 })}`;
