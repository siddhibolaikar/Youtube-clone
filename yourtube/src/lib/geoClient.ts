import { apiFetch } from "./apiClient";

export interface ClientGeo {
  city: string | null;
  regionCode: string | null;
  regionName: string | null;
  country: string | null;
  source: "vercel" | "ipapi" | "override" | "unknown";
}

let inflight: Promise<ClientGeo> | null = null;

/** Where the server thinks this browser is (honours test overrides). Cached per page load. */
export function fetchGeo({ refresh = false } = {}): Promise<ClientGeo> {
  if (!inflight || refresh) {
    inflight = apiFetch<ClientGeo>("/api/geo", { withToken: false }).catch((err) => {
      inflight = null;
      console.warn("Geo lookup failed; defaulting to dark theme:", err);
      return { city: null, regionCode: null, regionName: null, country: null, source: "unknown" as const };
    });
  }
  return inflight;
}
