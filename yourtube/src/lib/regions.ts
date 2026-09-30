// ISO 3166-2:IN subdivision codes (without the "IN-" prefix), which is what both
// Vercel's x-vercel-ip-country-region header and ipapi.co's region_code return.
export const INDIAN_REGIONS: Record<string, string> = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  CG: "Chhattisgarh",
  DH: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OR: "Odisha",
  OD: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TG: "Telangana",
  TS: "Telangana",
  TN: "Tamil Nadu",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UK: "Uttarakhand",
  UT: "Uttarakhand",
  WB: "West Bengal",
};

// TS is the pre-2023 code for Telangana; some geo providers still return it.
export const SOUTHERN_REGION_CODES = new Set(["TN", "KL", "KA", "AP", "TG", "TS"]);

export function isSouthernIndia(country: string | null | undefined, regionCode: string | null | undefined): boolean {
  if (!regionCode) return false;
  if (country && country.toUpperCase() !== "IN") return false;
  return SOUTHERN_REGION_CODES.has(regionCode.toUpperCase());
}

// Used when a test override picks a region, so the comment city looks plausible.
export const SAMPLE_CITY: Record<string, string> = {
  TN: "Chennai",
  KL: "Kochi",
  KA: "Bengaluru",
  AP: "Visakhapatnam",
  TG: "Hyderabad",
  TS: "Hyderabad",
  MH: "Pune",
  DL: "New Delhi",
};
