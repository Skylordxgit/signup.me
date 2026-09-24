export type BlockType =
  | "button"
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
export type PageType = "standard" | "custom_html";

export type CustomHtmlVersion = {
  version: number;
  sourceHtml: string;
  sanitizedHtml: string;
  createdAt: string;
  publishedAt?: string;
  warnings: string[];
};

export type CustomHtmlSettings = {
  sourceHtml: string;
  draftHtml: string;
  publishedHtml: string;
  warnings: string[];
  draftVersion: number;
  publishedVersion: number;
  versions: CustomHtmlVersion[];
  uploadedMetadata?: { title?: string; description?: string; socialTitle?: string; socialDescription?: string; ogImage?: string; canonicalUrl?: string };
};

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
  footerText?: string;
};

export type SeoSettings = {
  seoTitle: string;
  metaDescription: string;
  socialTitle?: string;
  socialDescription?: string;
  ogImage: string;
  favicon: string;
  canonicalUrl?: string;
  noindex?: boolean;
};

export type IntegrationSettings = {
  metaPixelId?: string;
  gtmId?: string;
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
  /** Standard pages keep their existing renderer; custom HTML pages use the
   * separate static-document editor and never enter the block builder. */
  pageType?: PageType;
  customHtml?: CustomHtmlSettings;
};

export type PageSummary = {
  id: number;
  name: string;
  title?: string;
  slug: string;
  status: PageStatus;
  views: number;
  uniqueVisitors: number;
  clicks: number;
  ctr?: number;
  updatedAt: string;
  blocks?: Pick<PageBlock, "id" | "pageId" | "type" | "title" | "clicks" | "isActive" | "sortOrder">[];
  pageType?: PageType;
};

export type DailyMetric = {
  date: string;
  views: number;
  clicks: number;
};

export type LocationMetric = {
  location: string;
  country: string;
  countryCode?: string;
  region?: string;
  regionCode?: string;
  city: string;
  views: number;
  visitors?: number;
  clicks: number;
  subscribers?: number;
  ctr?: number;
  viewShare?: number;
  visitorShare?: number;
};

export type LinkClickLocation = {
  blockId: number;
  blockTitle: string;
  location: string;
  country: string;
  region?: string;
  city: string;
  clicks: number;
};

export type CityDetailMetric = {
  city: string;
  region?: string;
  country?: string;
  location: string;
  views: number;
  visitors?: number;
  clicks: number;
  subscribers?: number;
  ctr: number;
  viewShare?: number;
  visitorShare?: number;
  topLinks: { blockId: number; blockTitle: string; url?: string; clicks: number }[];
};

export type RegionDetailMetric = {
  regionCode: string;
  regionName: string;
  countryName: string;
  views: number;
  visitors?: number;
  clicks: number;
  subscribers?: number;
  ctr: number;
  viewShare?: number;
  visitorShare?: number;
  cities: CityDetailMetric[];
};

export type CountryDetailMetric = {
  countryCode: string;
  countryName: string;
  views: number;
  visitors?: number;
  clicks: number;
  subscribers?: number;
  ctr: number;
  viewShare?: number;
  visitorShare?: number;
  regions?: RegionDetailMetric[];
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
  region?: string;
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

export type CustomHtmlLinkMetric = {
  href: string;
  clicks: number;
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
  regions?: RegionDetailMetric[];
  linkLocations?: LinkClickLocation[];
  linkStats?: LinkPerformanceItem[];
  customHtmlLinks?: CustomHtmlLinkMetric[];
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
  countryCode?: string;
  countryName?: string;
  region?: string;
  regionCode?: string;
  regionName?: string;
  city: string;
  timezone: string;
  lastActiveAt?: string;
  source?: string;
  utmSource?: string;
  utmCampaign?: string;
  totalSent?: number;
  totalClicks?: number;
};

export type SubscriberListItem = Pick<NotificationSubscriber, 'id' | 'pageId' | 'slug' | 'createdAt' | 'isActive' | 'lastFailedAt'> & SubscriberDetails;

export type NotificationSubscriberSummary = {
  total: number;
  inactive: number;
  byPage: { pageId: number; slug: string; subscribers: number }[];
  recent?: SubscriberListItem[];
};

export type LocationTargeting = {
  includeCountries: string[];
  excludeCountries: string[];
  includeRegions: string[];
  excludeRegions: string[];
  includeCities: string[];
  excludeCities: string[];
  includeUnknownLocation: boolean;
};

export type AudienceFilters = {
  locations?: Partial<LocationTargeting>;
  pageIds?: number[];
  subscribedWithinDays?: number | null;
  subscribedBeforeDays?: number | null;
  lastActiveWithinDays?: number | null;
  devices?: ('mobile' | 'desktop' | 'tablet')[];
  browsers?: string[];
  operatingSystems?: string[];
  engagement?: 'all' | 'clicked' | 'never_clicked';
  trafficSources?: string[];
  visitedPageIds?: number[];
  clickedBlockIds?: number[];
  status?: 'active' | 'inactive' | 'all';
  segmentId?: string | null;
};

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'cancelled' | 'failed';

export type NotificationSendInput = {
  name?: string;
  description?: string;
  tags?: string[];
  type?: 'broadcast' | 'scheduled';
  title: string;
  body: string;
  url: string;
  image?: string | null;
  icon?: string | null;
  badge?: string | null;
  ctaText?: string | null;
  pageId?: number | null;
  workspaceId?: string;
  campaignId?: number;
  status?: CampaignStatus;
  scheduledAt?: string | null;
  timezone?: string;
  smartTimezoneDelivery?: boolean;
  batchSize?: number;
  throttleRate?: number;
  retryTemporaryFailures?: boolean;
  priority?: 'normal' | 'high' | 'urgent';
  targetFilters?: AudienceFilters;
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
  name?: string;
  description?: string;
  tags?: string[];
  type?: 'broadcast' | 'scheduled';
  pageId: number | null;
  pageSlug: string | null;
  title: string;
  body: string;
  image?: string | null;
  icon?: string | null;
  badge?: string | null;
  ctaText?: string | null;
  url: string;
  audience: string;
  status: CampaignStatus;
  scheduledAt?: string | null;
  timezone?: string;
  smartTimezoneDelivery?: boolean;
  batchSize?: number;
  throttleRate?: number;
  retryTemporaryFailures?: boolean;
  priority?: 'normal' | 'high' | 'urgent';
  targetFilters?: AudienceFilters;
  attempted: number;
  sent: number;
  delivered: number;
  seen: number;
  clicked: number;
  clicks: number;
  failed: number;
  removed: number;
  startedAt?: string | null;
  completedAt?: string | null;
  locationStats?: Record<string, { sent: number; clicked: number; delivered: number }>;
  deviceStats?: Record<string, { sent: number; clicked: number; delivered: number }>;
  createdAt: string;
  updatedAt: string;
};

export type NotificationDeliveryLog = {
  id: string;
  campaignId: number;
  campaignName: string;
  subscriberId: number;
  endpointHash?: string;
  pageSlug?: string;
  country: string;
  region?: string;
  city: string;
  device: string;
  browser: string;
  status: 'sent' | 'delivered' | 'clicked' | 'failed';
  errorReason?: string | null;
  sentAt: string;
  clickedAt?: string | null;
};

export type SubscriberSegment = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  filters: AudienceFilters;
  subscriberCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type NotificationTemplate = {
  id: string;
  workspaceId: string;
  name: string;
  category?: 'promotion' | 'announcement' | 'reminder' | 'content' | 'urgent' | 'custom';
  title: string;
  body: string;
  url?: string;
  icon?: string | null;
  image?: string | null;
  badge?: string | null;
  ctaText?: string | null;
  createdAt: string;
  updatedAt: string;
};
