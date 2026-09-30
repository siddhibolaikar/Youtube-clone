import { FREE_DAILY_DOWNLOADS } from "./plans";
import { istDateStamp, istEndOfDay } from "./ist";

export interface DownloadQuota {
  isPremium: boolean;
  usedToday: number;
  /** null = unlimited */
  limit: number | null;
  remaining: number | null;
  /** ISO time of the next IST midnight, when the free allowance resets. */
  resetsAt: string;
}

/** Firestore doc id for the IST calendar day's download counter. */
export const downloadDayKey = (at: Date) => istDateStamp(at);

export function computeQuota(isPremium: boolean, usedToday: number, now: Date): DownloadQuota {
  const limit = isPremium ? null : FREE_DAILY_DOWNLOADS;
  return {
    isPremium,
    usedToday,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - usedToday),
    resetsAt: istEndOfDay(now).toISOString(),
  };
}

export const quotaLabel = (q: DownloadQuota) =>
  q.limit === null ? "Unlimited · Premium" : `${q.remaining} of ${q.limit} left today`;
