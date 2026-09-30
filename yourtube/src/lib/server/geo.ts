import type { NextApiRequest } from "next";
import { INDIAN_REGIONS, SAMPLE_CITY } from "../regions";
import { TEST_OVERRIDES_ENABLED, parseOverrides } from "../testOverrides";

export interface GeoInfo {
  city: string | null;
  regionCode: string | null;
  regionName: string | null;
  country: string | null;
  source: "vercel" | "ipapi" | "override" | "unknown";
}

const header = (req: NextApiRequest, name: string): string | undefined => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) || undefined;
};

const decode = (v: string | undefined): string | null => {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

const regionNameFor = (country: string | null, code: string | null): string | null =>
  code && (!country || country === "IN") ? INDIAN_REGIONS[code] ?? null : null;

function clientIp(req: NextApiRequest): string | null {
  const fwd = header(req, "x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.socket?.remoteAddress || null;
  if (!ip) return null;
  const bare = ip.replace(/^::ffff:/, "");
  // Private / loopback addresses mean local dev: let ipapi use the egress IP.
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(bare)) return null;
  return bare;
}

// ipapi.co's free tier is ~1000 req/day; cache per IP for the life of the lambda.
const ipapiCache = new Map<string, { at: number; geo: GeoInfo }>();
const IPAPI_TTL_MS = 30 * 60 * 1000;

async function lookupIpapi(ip: string | null): Promise<GeoInfo> {
  const key = ip ?? "self";
  const cached = ipapiCache.get(key);
  if (cached && Date.now() - cached.at < IPAPI_TTL_MS) return cached.geo;

  const url = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : "https://ipapi.co/json/";
  const res = await fetch(url, {
    headers: { "User-Agent": "yourtube/1.0" },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`ipapi.co responded ${res.status}`);
  const data = (await res.json()) as {
    error?: boolean;
    city?: string;
    region?: string;
    region_code?: string;
    country_code?: string;
  };
  if (data.error) throw new Error("ipapi.co lookup failed");
  const country = data.country_code?.toUpperCase() ?? null;
  const regionCode = data.region_code?.toUpperCase() ?? null;
  const geo: GeoInfo = {
    city: data.city ?? null,
    regionCode,
    regionName: regionNameFor(country, regionCode) ?? data.region ?? null,
    country,
    source: "ipapi",
  };
  ipapiCache.set(key, { at: Date.now(), geo });
  return geo;
}

export function readOverrideRegion(req: NextApiRequest): string | undefined {
  if (!TEST_OVERRIDES_ENABLED) return undefined;
  return parseOverrides(header(req, "x-test-region") ?? req.query.testRegion, undefined).region;
}

/** Location of the caller: test override, then Vercel edge headers, then ipapi.co. */
export async function getGeo(req: NextApiRequest): Promise<GeoInfo> {
  const override = readOverrideRegion(req);
  if (override) {
    return {
      city: SAMPLE_CITY[override] ?? INDIAN_REGIONS[override] ?? override,
      regionCode: override,
      regionName: INDIAN_REGIONS[override] ?? override,
      country: "IN",
      source: "override",
    };
  }

  const vercelCountry = header(req, "x-vercel-ip-country");
  if (vercelCountry) {
    const country = vercelCountry.toUpperCase();
    const regionCode = header(req, "x-vercel-ip-country-region")?.toUpperCase() ?? null;
    return {
      city: decode(header(req, "x-vercel-ip-city")),
      regionCode,
      regionName: regionNameFor(country, regionCode),
      country,
      source: "vercel",
    };
  }

  try {
    return await lookupIpapi(clientIp(req));
  } catch (err) {
    console.warn("[geo] ipapi.co fallback failed:", err);
    return { city: null, regionCode: null, regionName: null, country: null, source: "unknown" };
  }
}
