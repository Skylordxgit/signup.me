"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { defaultBranding } from "@/lib/brandingConstants";

export type ClientBranding = { name: string; logo: string; signupEnabled: boolean };

export const fallbackBranding: ClientBranding = { name: defaultBranding.name, logo: defaultBranding.logo, signupEnabled: defaultBranding.signupEnabled };

/* Cached for the life of the tab: /admin/login and /admin/signup are a
   client-side navigation apart, so the second page reuses what the first
   already fetched instead of asking again and flashing the fallback. */
let cache: ClientBranding | null = null;
let inFlight: Promise<ClientBranding> | null = null;

/** Never rejects: an unavailable branding API just leaves the fallback in place. */
export function fetchBranding(): Promise<ClientBranding> {
  if (cache) return Promise.resolve(cache);
  inFlight ??= fetch("/api/branding")
    .then(response => response.ok ? response.json() as Promise<Partial<ClientBranding>> : null)
    .then(data => {
      const branding = data?.name && data.logo
        ? { name: data.name, logo: data.logo, signupEnabled: data.signupEnabled !== false }
        : fallbackBranding;
      cache = branding;
      return branding;
    })
    .catch(() => fallbackBranding)
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Renders the saved brand once known, and the fallback until then, so a page
 *  using it never waits on branding before painting. */
export function useBranding() {
  const [branding, setBranding] = useState<ClientBranding>(() => cache ?? fallbackBranding);

  useEffect(() => {
    let cancelled = false;
    void fetchBranding().then(next => { if (!cancelled) setBranding(next); });
    return () => { cancelled = true; };
  }, []);

  return branding;
}

/** The brand row shared by the login and signup pages. */
export function AuthBranding() {
  const branding = useBranding();
  return (
    <div className="authBrandRow">
      <img className="authBrandLogo" src={branding.logo} alt="" width={42} height={42} />
      <strong>{branding.name}</strong>
    </div>
  );
}
