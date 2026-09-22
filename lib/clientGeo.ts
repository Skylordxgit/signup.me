export type ClientGeo = {
  city?: string;
  country?: string;
  region?: string;
};

let inMemoryGeo: ClientGeo | null = null;

export async function getClientGeo(): Promise<ClientGeo> {
  if (typeof window === "undefined") return {};
  if (inMemoryGeo) return inMemoryGeo;

  try {
    const cached = window.sessionStorage.getItem("smartlink_geo");
    if (cached) {
      const parsed = JSON.parse(cached) as ClientGeo;
      if (parsed && typeof parsed === "object" && (parsed.city || parsed.country)) {
        inMemoryGeo = parsed;
        return inMemoryGeo;
      }
    }
  } catch {
    // sessionStorage might be restricted in some iframe / private mode contexts
  }

  // Fast background detection (non-blocking, with 1200ms timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch("https://freeipapi.com/api/json", {
      signal: controller.signal,
      headers: { accept: "application/json" },
    }).catch(() => null);
    clearTimeout(timeout);

    if (res && res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        cityName?: string;
        countryName?: string;
        regionName?: string;
      };
      const geo: ClientGeo = {
        city: data.cityName && data.cityName !== "-" ? data.cityName.trim() : undefined,
        country: data.countryName ? data.countryName.trim() : undefined,
        region: data.regionName && data.regionName !== "-" ? data.regionName.trim() : undefined,
      };
      inMemoryGeo = geo;
      try {
        window.sessionStorage.setItem("smartlink_geo", JSON.stringify(geo));
      } catch {
        /* Ignore storage errors */
      }
      return geo;
    }
  } catch {
    // Graceful fallback
  }

  return {};
}
