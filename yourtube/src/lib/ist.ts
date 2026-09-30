// Time helpers pinned to Indian Standard Time. Never use the browser's or the
// server's local time zone for business rules (theme, download quota, invoices).

export const IST_TIME_ZONE = "Asia/Kolkata";
// IST has no DST, so the offset is constant.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface IstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function istParts(date: Date = new Date()): IstParts {
  const map: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYYMMDD" for the IST calendar day. */
export function istDateStamp(date: Date = new Date()): string {
  const p = istParts(date);
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

/** The instant at which the IST calendar day containing `date` began. */
export function istStartOfDay(date: Date = new Date()): Date {
  const p = istParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - IST_OFFSET_MS);
}

/** The instant at which the next IST calendar day begins. */
export function istEndOfDay(date: Date = new Date()): Date {
  return new Date(istStartOfDay(date).getTime() + 24 * 60 * 60 * 1000);
}

/** Human-readable IST timestamp, e.g. "30 Sept 2026, 7:45 pm IST". */
export function formatIst(date: Date = new Date()): string {
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date) + " IST"
  );
}
