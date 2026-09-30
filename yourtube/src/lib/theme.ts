import { istParts } from "./ist";
import { isSouthernIndia } from "./regions";

export type AppTheme = "light" | "dark";

export interface ThemeInputs {
  /** IST hour, 0-23 */
  hour: number;
  regionCode: string | null | undefined;
  country: string | null | undefined;
}

/**
 * Light only from 10:00 (inclusive) to 12:00 (exclusive) IST in Tamil Nadu,
 * Kerala, Karnataka, Andhra Pradesh or Telangana. Dark in every other case,
 * including when the location is unknown.
 */
export function themeFor({ hour, regionCode, country }: ThemeInputs): AppTheme {
  return hour >= 10 && hour < 12 && isSouthernIndia(country, regionCode) ? "light" : "dark";
}

/** Current IST hour, or the test override when one is set. */
export function istHourNow(testHour?: number, now: Date = new Date()): number {
  return testHour ?? istParts(now).hour;
}

/** Milliseconds until the next IST minute boundary (for re-checking). */
export function msToNextMinute(now: Date = new Date()): number {
  return 60_000 - (now.getTime() % 60_000);
}
