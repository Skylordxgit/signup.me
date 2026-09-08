export type BlockType =
  | "link"
  | "whatsapp"
  | "telegram"
  | "messenger"
  | "instagram"
  | "facebook"
  | "youtube"
  | "email"
  | "phone"
  | "website"
  | "heading"
  | "text"
  | "divider"
  | "image"
  | "video"
  | "socials";

export type PageStatus = "published" | "draft" | "disabled";

/** Presets still stored on pages created before the theme library existed. */
export type LegacyThemePreset = "glass-dark" | "purple-glass" | "midnight" | "gradient" | "neon-glass";

export type ThemePreset =
  | LegacyThemePreset
  | "glass-light"
  | "midnight-glass"
  | "aurora"
  | "minimal-white"
  | "minimal-dark"
  | "purple-glow"
  | "ocean-glass"
  | "sunset"
  | "gradient-mesh"
  | "professional"
  | "neon"
  | "soft-pastel"
  | "custom";

export type ButtonStyle =
  | "glass"
  | "solid"
  | "soft"
  | "outline"
  | "pill"
  | "minimal"
  | "elevated"
  | "neon";

export type SurfaceStyle = "glass" | "glass-dark" | "solid" | "plain" | "plain-dark";

/** How the whole profile identity block is aligned on the page. */
export type ProfileAlignment = "left" | "center" | "right";

export type ThemeSettings = {
  preset: ThemePreset;
  backgroundColor: string;
  gradientFrom: string;
  gradientTo: string;
  backgroundImage: string;
  backgroundBlur: number;
  textColor: string;
  headingColor: string;
  buttonBackground: string;
  buttonTextColor: string;
  buttonBorderColor: string;
  buttonRadius: number;
  buttonTransparency: number;
  glassBlur: number;
  shadow: number;
  font: "inter" | "system" | "serif" | "mono";
  spacing: number;
  /* Optional: pages saved before these existed fall back to their theme. */
  buttonStyle?: ButtonStyle;
  surface?: SurfaceStyle;
  backgroundStyle?: "solid" | "gradient";
  showShareButton?: boolean;
  profileLayout?: "hero" | "centered" | "avatar" | "none";
  /* Profile layout. Kept in the theme blob so it needs no schema change, and
     deliberately carried across when a new theme preset is applied. */
  profileAlignment?: ProfileAlignment;
};

export type SeoSettings = {
  seoTitle: string;
  metaDescription: string;
  socialTitle: string;
  socialDescription: string;
  ogImage: string;
  favicon: string;
};

export type IntegrationSettings = {
  metaPixelId: string;
  gtmId: string;
};

export type PageBlock = {
  id: number;
  pageId: number;
  type: BlockType;
  title: string;
  subtitle: string;
  url: string;
  icon: string;
  phone: string;
  message: string;
  imageUrl: string;
  videoUrl: string;
  settings: Record<string, string | number | boolean>;
  sortOrder: number;
  isActive: boolean;
  clicks: number;
  createdAt: string;
  updatedAt: string;
};

export type SmartPage = {
  id: number;
  name: string;
  slug: string;
  title: string;
  bio: string;
  profileImage: string;
  logoImage: string;
  status: PageStatus;
  theme: ThemeSettings;
  seo: SeoSettings;
  integrations: IntegrationSettings;
  views: number;
  uniqueVisitors: number;
  createdAt: string;
  updatedAt: string;
  blocks: PageBlock[];
};

export type PageSummary = {
  id: number;
  name: string;
  slug: string;
  status: PageStatus;
  views: number;
  uniqueVisitors: number;
  clicks: number;
  updatedAt: string;
};

export type DailyMetric = {
  date: string;
  views: number;
  clicks: number;
};

export type AnalyticsReport = {
  views: number;
  uniqueVisitors: number;
  clicks: number;
  ctr: number;
  topBlocks: { id: number; title: string; clicks: number }[];
  daily: DailyMetric[];
  devices: { device: string; count: number }[];
  referrers: { referrer: string; count: number }[];
};
