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
  | "spacer"
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
  | "cyberpunk"
  | "cosmic-nebula"
  | "emerald-luxe"
  | "rose-gold"
  | "synthwave"
  | "frosted-matcha"
  | "stealth-black"
  | "midnight-sapphire"
  | "golden-hour"
  | "nordic-frost"
  | "ruby-royale"
  | "lavender-dream"
  | "monochrome"
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
  buttonAnimation?: boolean;
  surface?: SurfaceStyle;
  backgroundStyle?: "solid" | "gradient" | "image";
  pageBackground?: string;
  showShareButton?: boolean;
  profileLayout?: "hero" | "centered" | "avatar" | "none";
  /* Profile layout. Kept in the theme blob so it needs no schema change, and
     deliberately carried across when a new theme preset is applied. */
  profileAlignment?: ProfileAlignment;
  /* Profile manual fine-tuning position & scale controls */
  avatarX?: number;
  avatarY?: number;
  avatarSize?: number;
  titleX?: number;
  titleY?: number;
  bioX?: number;
  bioY?: number;
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
  notificationPrompt?: import('./notificationPrompt').NotificationPromptSettings;
};

export type PageBlock = {
  workspaceId?: string;
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
  /** Owning workspace. Pages saved before workspaces existed read as the
   *  default workspace, so existing slugs keep working untouched. */
  workspaceId: string;
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

export type LocationMetric = {
  location: string;
  country: string;
  city: string;
  views: number;
  clicks: number;
};

export type LinkClickLocation = {
  blockId: number;
  blockTitle: string;
  location: string;
  country: string;
  city: string;
  clicks: number;
};

export type CityDetailMetric = {
  city: string;
  location: string;
  views: number;
  clicks: number;
  ctr: number;
  topLinks: { blockId: number; blockTitle: string; url?: string; clicks: number }[];
};

export type CountryDetailMetric = {
  countryCode: string;
  countryName: string;
  views: number;
  clicks: number;
  ctr: number;
  cities: CityDetailMetric[];
};

export type RecentActivityItem = {
  id: string | number;
  type: 'view' | 'click';
  pageId: number;
  pageName?: string;
  blockId?: number;
  blockTitle?: string;
  country: string;
  city: string;
  location: string;
  device: string;
  referrer: string;
  date: string;
};

export type HourlyMetric = {
  hour: number;
  views: number;
  clicks: number;
};

export type LinkPerformanceItem = {
  blockId: number;
  title: string;
  type: string;
  pageId: number;
  pageName: string;
  pageSlug: string;
  views: number;
  clicks: number;
  uniqueClicks: number;
  ctr: number;
  subscribers: number;
  conversion: number;
};

export type AnalyticsReport = {
  views: number;
  uniqueVisitors: number;
  returningVisitors?: number;
  clicks: number;
  ctr: number;
  subscribers?: number;
  subscriptionRate?: number;
  topBlocks: { id: number; title: string; clicks: number }[];
  daily: DailyMetric[];
  hourly?: HourlyMetric[];
  devices: { device: string; count: number; percentage?: number }[];
  osBreakdown?: { os: string; count: number; percentage: number }[];
  browserBreakdown?: { browser: string; count: number; percentage: number }[];
  referrers: { referrer: string; count: number; percentage?: number }[];
  trafficSources?: { source: string; views: number; clicks: number; ctr: number; percentage?: number }[];
  locations: LocationMetric[];
  linkLocations?: LinkClickLocation[];
  linkStats?: LinkPerformanceItem[];
  countries?: CountryDetailMetric[];
  recentActivity?: RecentActivityItem[];
  previousPeriod?: { views: number; clicks: number; uniqueVisitors: number; ctr: number; subscribers: number };
  deltas?: { views: number; clicks: number; visitors: number; ctr: number; subscribers: number };
  days?: number | string;
  startDate?: string;
  endDate?: string;
};

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
};

export type NotificationSubscriber = {
  workspaceId?: string;
  id: number;
  pageId: number;
  slug: string;
  endpointHash: string;
  userAgent: string;
  details?: SubscriberDetails;
  isActive?: boolean;
  lastFailedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriberDetails = {
  device: string;
  browser: string;
  ipAddress: string;
  country: string;
  city: string;
  timezone: string;
};

export type SubscriberListItem = Pick<NotificationSubscriber, 'id' | 'pageId' | 'slug' | 'createdAt' | 'isActive' | 'lastFailedAt'> & SubscriberDetails;

export type NotificationSubscriberSummary = {
  total: number;
  inactive: number;
  byPage: { pageId: number; slug: string; subscribers: number }[];
  recent?: SubscriberListItem[];
};

export type NotificationSendInput = {
  title: string;
  body: string;
  url: string;
  pageId?: number | null;
  /** Restricts delivery to pages in this workspace. */
  workspaceId?: string;
  /** Internal tracking id attached after the campaign row is created. */
  campaignId?: number;
};

export type NotificationSendResult = {
  campaignId?: number;
  attempted: number;
  sent: number;
  removed: number;
  failed: number;
  campaign?: NotificationCampaign;
};

export type NotificationCampaign = {
  id: number;
  workspaceId: string;
  pageId: number | null;
  pageSlug: string | null;
  title: string;
  body: string;
  url: string;
  audience: string;
  attempted: number;
  sent: number;
  delivered: number;
  seen: number;
  clicked: number;
  clicks: number;
  failed: number;
  removed: number;
  createdAt: string;
  updatedAt: string;
};
