import type { BlockType, PageBlock, SmartPage, ThemeSettings } from "./types";

export const blockTypes: { value: BlockType; label: string }[] = [
  { value: "link", label: "Link Button" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "website", label: "Website" },
  { value: "heading", label: "Heading" },
  { value: "text", label: "Text" },
  { value: "divider", label: "Divider" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "socials", label: "Social Icons" },
];

export const themePresets: { value: ThemeSettings["preset"]; label: string }[] = [
  { value: "glass-light", label: "Glass Light" },
  { value: "glass-dark", label: "Glass Dark" },
  { value: "purple-glass", label: "Purple Glass" },
  { value: "midnight", label: "Midnight" },
  { value: "minimal-white", label: "Minimal White" },
  { value: "gradient", label: "Gradient" },
  { value: "neon-glass", label: "Neon Glass" },
  { value: "custom", label: "Custom Theme" },
];

export function nowIso() {
  return new Date().toISOString();
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

export function isValidSlug(input: string) {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(input);
}

export function isValidUrl(input: string) {
  if (!input) return true;
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function detectDevice(userAgent: string) {
  const value = userAgent.toLowerCase();
  if (/ipad|tablet/.test(value)) return "tablet";
  if (/mobi|android|iphone/.test(value)) return "mobile";
  return "desktop";
}

export function safeReferrer(referrer: string | null) {
  if (!referrer) return "Direct";
  try {
    return new URL(referrer).hostname;
  } catch {
    return "Direct";
  }
}

export function buildSmartUrl(block: PageBlock) {
  const phone = block.phone.replace(/[^\d+]/g, "");
  const message = encodeURIComponent(block.message.trim());
  const url = block.url.trim();

  if (block.type === "whatsapp") {
    const cleanPhone = phone.replace(/^\+/, "");
    return cleanPhone ? `https://wa.me/${cleanPhone}${message ? `?text=${message}` : ""}` : "#";
  }

  if (block.type === "telegram") {
    if (url.startsWith("@")) return `https://t.me/${url.slice(1)}`;
    if (url && !url.startsWith("http")) return `https://t.me/${url}`;
    return url || "#";
  }

  if (block.type === "email") {
    return url.includes("@") ? `mailto:${url}${message ? `?body=${message}` : ""}` : url || "#";
  }

  if (block.type === "phone") {
    return phone ? `tel:${phone}` : "#";
  }

  if (block.type === "messenger") {
    if (url && !url.startsWith("http")) return `https://m.me/${url.replace(/^@/, "")}`;
    return url || "#";
  }

  if (["instagram", "facebook", "youtube", "website", "link", "socials"].includes(block.type)) {
    return url || "#";
  }

  return "#";
}

export function publicPageUrl(slug: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const url = new URL(base);
    url.pathname = `/${slug}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return `/${slug}`;
  }
}

export type ParsedBlockIcon =
  | { kind: "none" }
  | { kind: "emoji"; value: string }
  | { kind: "image"; src: string }
  | { kind: "key"; key: string }
  | { kind: "empty" };

export function parseBlockIcon(icon: string): ParsedBlockIcon {
  if (!icon) return { kind: "empty" };
  if (icon === "none") return { kind: "none" };
  if (icon.startsWith("emoji:")) return { kind: "emoji", value: icon.slice("emoji:".length) };
  if (/^https?:\/\//.test(icon) || icon.startsWith("data:")) return { kind: "image", src: icon };
  return { kind: "key", key: icon };
}

export function readableTextColor(hex: string) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return "#ffffff";
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

export function emptyBlock(pageId: number, type: BlockType, sortOrder: number): PageBlock {
  const timestamp = nowIso();
  const isVideo = type === "video";
  return {
    id: Date.now(),
    pageId,
    type,
    title: isVideo
      ? "Signup walkthrough"
      : type === "whatsapp"
        ? "WhatsApp"
        : blockTypes.find((item) => item.value === type)?.label ?? "Link",
    subtitle: isVideo ? "Watch the guide directly on this page" : type === "whatsapp" ? "Chat with our team" : "",
    url: isVideo ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ" : "",
    icon: type,
    phone: "",
    message: "",
    imageUrl: "",
    videoUrl: isVideo ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ" : "",
    settings: {},
    sortOrder,
    isActive: true,
    clicks: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function summarizePage(page: SmartPage) {
  return {
    id: page.id,
    name: page.name,
    slug: page.slug,
    status: page.status,
    views: page.views,
    uniqueVisitors: page.uniqueVisitors,
    clicks: page.blocks.reduce((sum, block) => sum + block.clicks, 0),
    updatedAt: page.updatedAt,
  };
}
