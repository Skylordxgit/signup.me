/* Shared by the server branding store and client-safe branding defaults, so a
   "use client" component never has to import the server module to know what to
   paint before real branding arrives. */

export type BrandingSettings = {
  name: string;
  siteTitle: string;
  logo: string;
  favicon: string;
  signupEnabled: boolean;
};

/** What every surface renders immediately, before any branding read. */
export const defaultBranding: BrandingSettings = {
  name: 'signup888',
  siteTitle: 'signup888 - Your Link. Your World.',
  logo: '/signup888-logo.png',
  favicon: '/favicon.ico',
  signupEnabled: true,
};
