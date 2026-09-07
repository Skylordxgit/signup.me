"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  CircleHelp,
  Globe2,
  Heart,
  ImageIcon,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Phone,
  Play,
  Send,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { PageBlock, SmartPage } from "@/lib/types";
import { buildSmartUrl, parseBlockIcon, publicPageUrl, readableTextColor } from "@/lib/utils";
import { resolveButtonStyle, resolveSurface, themeCssVariables } from "@/lib/themes";

export function PublicPage({ page, preview = false }: { page: SmartPage; preview?: boolean }) {
  useEffect(() => {
    if (preview) return;
    const visitorKey = window.localStorage.getItem("smartlink_visitor") || crypto.randomUUID();
    window.localStorage.setItem("smartlink_visitor", visitorKey);
    void fetch("/api/track/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: page.slug, visitorKey }),
    });
  }, [page.slug, preview]);

  async function track(block: PageBlock) {
    if (preview || ["heading", "text", "divider", "image", "video"].includes(block.type)) return;
    await fetch("/api/track/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageId: page.id, blockId: block.id }),
    });
  }

  const theme = page.theme;
  const pageUrl = publicPageUrl(page.slug);
  const activeBlocks = page.blocks.filter((block) => block.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const buttonStyle = resolveButtonStyle(theme);
  const surface = resolveSurface(theme);

  return (
    <main className={`publicExperience ${theme.preset}`} style={themeCssVariables(theme)}>
      {theme.backgroundImage && (
        <div className="publicBackdrop" style={{ backgroundImage: `url(${theme.backgroundImage})` }} />
      )}
      <section className={`publicCard surface-${surface}`}>
        <div className="publicBanner" style={theme.backgroundImage ? { backgroundImage: `url(${theme.backgroundImage})` } : undefined} />
        <header className="publicProfile">
          <ProfileAvatar name={page.title || page.name} src={page.profileImage} />
          <h1>{page.title}</h1>
          {page.bio && <p>{page.bio}</p>}
        </header>

        <div className="blockStack">
          {activeBlocks.map((block) => (
            <PublicBlock block={block} buttonStyle={buttonStyle} key={block.id} onClick={() => track(block)} />
          ))}
        </div>

        <footer className="publicFooter">
          <span>{page.name}</span>
          <a href={`https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(pageUrl)}`}>
            Download QR
          </a>
        </footer>
      </section>
    </main>
  );
}

/** Falls back to initials so a missing or broken avatar never leaves a hole. */
function ProfileAvatar({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  if (!src || failed) {
    return <div className="publicAvatar publicAvatarFallback">{initials || "?"}</div>;
  }

  return (
    <img className="publicAvatar" key={src} src={src} alt="" onError={() => setFailed(true)} />
  );
}

function PublicBlock({
  block,
  buttonStyle,
  onClick,
}: {
  block: PageBlock;
  buttonStyle: string;
  onClick: () => void;
}) {
  if (block.type === "heading") return <h2 className="publicHeading">{block.title}</h2>;
  if (block.type === "text") return <p className="publicText">{block.subtitle || block.title}</p>;
  if (block.type === "divider") return <hr className="publicDivider" />;
  if (block.type === "image") {
    return (
      <img
        key={block.imageUrl || block.url}
        className="publicImage"
        src={block.imageUrl || block.url}
        alt={block.title}
        onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
      />
    );
  }
  if (block.type === "video") {
    return (
      <div className="publicVideo">
        <PublicPlayableVideo src={block.videoUrl || block.url} title={block.title || "Video"} />
        <strong>{block.title || "Watch video"}</strong>
      </div>
    );
  }

  const buttonColor = typeof block.settings.buttonColor === "string" ? block.settings.buttonColor : "";
  const colorOverride = buttonColor ? { background: buttonColor, color: readableTextColor(buttonColor) } : undefined;

  return (
    <a
      className={`publicButton buttonStyle-${buttonStyle}`}
      href={buildSmartUrl(block)}
      onClick={onClick}
      target="_blank"
      rel="noreferrer"
      style={colorOverride}
    >
      <span>{resolvePublicIcon(block.icon, block.type)}</span>
      <div>
        <strong>{block.title}</strong>
        {block.subtitle && <small>{block.subtitle}</small>}
      </div>
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}

const blockTypeIcons: Partial<Record<PageBlock["type"], LucideIcon>> = {
  whatsapp: MessageCircle,
  telegram: Send,
  messenger: MessageCircle,
  instagram: Camera,
  facebook: Globe2,
  youtube: Play,
  email: Mail,
  phone: Phone,
  website: Globe2,
  link: Link2,
  socials: Share2,
};

const curatedPublicIcons: Record<string, LucideIcon> = {
  link: Link2,
  globe: Globe2,
  message: MessageCircle,
  mail: Mail,
  phone: Phone,
  send: Send,
  share: Share2,
  "map-pin": MapPin,
  "shopping-bag": ShoppingBag,
  star: Star,
  heart: Heart,
  music: Music2,
  video: Video,
  image: ImageIcon,
  help: CircleHelp,
  sparkles: Sparkles,
};

function resolvePublicIcon(icon: string, fallbackType: PageBlock["type"]) {
  const parsed = parseBlockIcon(icon);
  if (parsed.kind === "none") return null;
  if (parsed.kind === "emoji") return <span className="emojiIcon">{parsed.value}</span>;
  if (parsed.kind === "image") {
    return (
      <img
        key={parsed.src}
        className="customIconImage"
        src={parsed.src}
        alt=""
        onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
      />
    );
  }
  const key = parsed.kind === "key" ? parsed.key : "";
  const Icon = curatedPublicIcons[key] ?? blockTypeIcons[fallbackType] ?? Link2;
  return <Icon aria-hidden="true" />;
}


function PublicPlayableVideo({ src, title }: { src: string; title: string }) {
  const embed = publicVideoEmbedUrl(src);

  if (embed.type === "iframe") {
    return <iframe src={embed.src} title={title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />;
  }

  if (embed.type === "video") {
    return <video src={embed.src} controls playsInline />;
  }

  return (
    <div className="videoPlaceholder">
      <Play fill="currentColor" aria-hidden="true" />
      <strong>Video coming soon</strong>
    </div>
  );
}

function publicVideoEmbedUrl(src: string) {
  if (!src) return { type: "empty" as const, src: "" };
  try {
    const url = new URL(src);
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return { type: "iframe" as const, src: `https://www.youtube.com/embed/${id}` };
    }
    if (url.hostname.includes("youtu.be")) {
      return { type: "iframe" as const, src: `https://www.youtube.com/embed/${url.pathname.slice(1)}` };
    }
    if (url.hostname.includes("vimeo.com")) {
      return { type: "iframe" as const, src: `https://player.vimeo.com/video/${url.pathname.split("/").filter(Boolean).pop()}` };
    }
    if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) {
      return { type: "video" as const, src };
    }
  } catch {
    return { type: "empty" as const, src: "" };
  }
  return { type: "iframe" as const, src };
}
