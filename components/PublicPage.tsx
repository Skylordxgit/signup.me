"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect } from "react";
import { ArrowUpRight, Camera, Globe2, Link2, Mail, MessageCircle, Phone, Play, Send, Share2, type LucideIcon } from "lucide-react";
import type { PageBlock, SmartPage } from "@/lib/types";
import { buildSmartUrl, publicPageUrl } from "@/lib/utils";

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
  const buttonBackground = withAlpha(theme.buttonBackground, theme.buttonTransparency / 100);

  return (
    <main
      className={`publicExperience ${theme.preset}`}
      style={
        {
          "--from": theme.gradientFrom,
          "--to": theme.gradientTo,
          "--bg": theme.backgroundColor,
          "--glass": theme.glassBlur,
          "--button-bg": theme.buttonBackground,
          "--button-bg-glass": buttonBackground,
          "--button-text": theme.buttonTextColor,
          "--button-border": theme.buttonBorderColor,
          "--button-radius": `${theme.buttonRadius}px`,
          "--button-alpha": `${theme.buttonTransparency / 100}`,
          "--shadow": `0 ${Math.max(10, theme.shadow)}px ${Math.max(24, theme.shadow * 2)}px rgba(15, 23, 42, 0.22)`,
          "--spacing": `${theme.spacing}px`,
          "--heading": theme.headingColor,
          "--text": theme.textColor,
        } as React.CSSProperties
      }
    >
      <div className="publicBackdrop" style={{ backgroundImage: `url(${theme.backgroundImage})` }} />
      <section className="publicCard">
        <div className="publicBanner" style={{ backgroundImage: `url(${theme.backgroundImage})` }} />
        <header className="publicProfile">
          <img key={page.profileImage} src={page.profileImage} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
          <h1>{page.title}</h1>
          <p>{page.bio}</p>
        </header>

        <div className="blockStack">
          {activeBlocks.map((block) => (
            <PublicBlock block={block} key={block.id} onClick={() => track(block)} />
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

function PublicBlock({ block, onClick }: { block: PageBlock; onClick: () => void }) {
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

  return (
    <a className="publicButton" href={buildSmartUrl(block)} onClick={onClick} target="_blank" rel="noreferrer">
      <span>{iconLabel(block.type)}</span>
      <div>
        <strong>{block.title}</strong>
        {block.subtitle && <small>{block.subtitle}</small>}
      </div>
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}

function iconLabel(type: PageBlock["type"]) {
  const map: Partial<Record<PageBlock["type"], LucideIcon>> = {
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
  const Icon = map[type] ?? Link2;
  return <Icon aria-hidden="true" />;
}

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0.15, alpha))})`;
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
