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
export type ThemePreset =
  | "glass-light"
  | "glass-dark"
  | "purple-glass"
  | "midnight"
  | "minimal-white"
  | "gradient"
  | "neon-glass"
  | "custom";

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
