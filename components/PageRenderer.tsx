"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import {
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
import { buildSmartUrl, parseBlockIcon, readableTextColor } from "@/lib/utils";
import { resolveButtonStyle, resolveSurface, themeCssVariables } from "@/lib/themes";

/**
 * Editing affordances supplied by the admin builder. When absent the renderer
 * is in public mode. These only ever add wrappers and overlays around blocks —
 * the block markup, classes and inline styles are identical in both modes, so
 * the builder preview cannot drift from the published page.
 */
export type PageEditHooks = {
  selectedBlockId: number | null;
  onSelectBlock: (blockId: number) => void;
  onEditProfile: () => void;
};

/**
 * The one renderer for a SmartPage. Used by the public route and by the phone
 * preview inside the admin builder. It owns the page's entire visual design;
 * neither caller styles page content itself.
 */
export function PageRenderer({
  edit,
  onTrack,
  page,
}: {
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
  page: SmartPage;
}) {
  const theme = page.theme;
  const buttonStyle = resolveButtonStyle(theme);
  const surface = resolveSurface(theme);

  // The builder shows hidden blocks (dimmed) so they can be re-enabled;
  // visitors only ever get the active ones. Order is identical.
  const ordered = [...page.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const blocks = edit ? ordered : ordered.filter((block) => block.isActive);

  const socialBlocks = blocks.filter((block) => block.type === "socials");
  const mainBlocks = blocks.filter((block) => block.type !== "socials");

  return (
    // smartPage paints the theme full-bleed; pageColumn caps the content at
    // the phone width and centres it. The column is the same width in the
    // builder frame and on a desktop browser, so content geometry is identical.
    <div className="smartPage" style={themeCssVariables(theme)}>
      <div className="pageColumn">
      <div className={`smartCard surface-${surface}`}>
        <PageBanner edit={edit} theme={theme} />

        <header className="pageProfile">
          {/* Same element type and classes in both modes; the builder only
              swaps the tag for a button so the identity is clickable. */}
          {edit ? (
            <button
              type="button"
              className="pageIdentity pageIdentityEditable"
              aria-label="Edit profile"
              onClick={edit.onEditProfile}
            >
              <ProfileIdentity page={page} />
            </button>
          ) : (
            <div className="pageIdentity">
              <ProfileIdentity page={page} />
            </div>
          )}
          <ShareAction page={page} preview={Boolean(edit)} />
        </header>

        {mainBlocks.length > 0 && (
          <div className="pageBlocks">
            {mainBlocks.map((block) => (
              <BlockRow block={block} buttonStyle={buttonStyle} edit={edit} key={block.id} onTrack={onTrack} />
            ))}
          </div>
        )}

        {socialBlocks.length > 0 && (
          <div className="pageSocials">
            {socialBlocks.map((block) => (
              <SocialRow block={block} edit={edit} key={block.id} onTrack={onTrack} />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function PageBanner({ edit, theme }: { edit?: PageEditHooks; theme: SmartPage["theme"] }) {
  const style = theme.backgroundImage ? { backgroundImage: `url(${theme.backgroundImage})` } : undefined;
  if (!edit) return <div className="pageBanner" style={style} />;
  return (
    <button type="button" className="pageBanner pageBannerEditable" aria-label="Edit banner" style={style} onClick={edit.onEditProfile} />
  );
}

function ProfileIdentity({ page }: { page: SmartPage }) {
  return (
    <>
      <ProfileAvatar name={page.title || page.name} src={page.profileImage} />
      <h1 className="pageTitle">{page.title}</h1>
      {page.bio && <p className="pageBio">{page.bio}</p>}
    </>
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
    return <div className="pageAvatar pageAvatarFallback">{initials || "?"}</div>;
  }

  return <img className="pageAvatar" key={src} src={src} alt="" onError={() => setFailed(true)} />;
}

/**
 * Rendered in both views at the same position. In the builder it is inert so a
 * click cannot open a share sheet while designing, but it occupies exactly the
 * same box with the same styling.
 */
function ShareAction({ page, preview }: { page: SmartPage; preview: boolean }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window === "undefined" ? "" : `${window.location.origin}/${page.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: page.title || page.name, url });
        return;
      } catch {
        /* dismissed — fall through to copying */
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      className="pageShare"
      aria-label={`Share ${page.title || page.name}`}
      onClick={preview ? undefined : share}
      tabIndex={preview ? -1 : 0}
    >
      <Share2 aria-hidden="true" />
      <span>{copied ? "Copied" : "Share"}</span>
    </button>
  );
}

/**
 * Wraps a block with the builder's selection affordances. The block itself is
 * always PageBlockView, so its markup is identical in both modes.
 */
function BlockRow({
  block,
  buttonStyle,
  edit,
  onTrack,
}: {
  block: PageBlock;
  buttonStyle: string;
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
}) {
  const view = <PageBlockView block={block} buttonStyle={buttonStyle} preview={Boolean(edit)} onTrack={onTrack} />;
  if (!edit) return view;

  const selected = edit.selectedBlockId === block.id;
  return (
    <div
      className={`pageBlockRow ${selected ? "pageBlockRowSelected" : ""} ${block.isActive ? "" : "pageBlockHidden"}`}
      onClickCapture={(event) => {
        // Selecting must never follow the link while designing.
        event.preventDefault();
        event.stopPropagation();
        edit.onSelectBlock(block.id);
      }}
    >
      {view}
    </div>
  );
}

/** A single block, rendered identically for the builder and for visitors. */
export function PageBlockView({
  block,
  buttonStyle,
  onTrack,
  preview,
}: {
  block: PageBlock;
  buttonStyle: string;
  onTrack?: (block: PageBlock) => void;
  preview: boolean;
}) {
  if (block.type === "heading") return <h2 className="pageHeading">{block.title}</h2>;
  if (block.type === "text") return <p className="pageText">{block.subtitle || block.title}</p>;
  if (block.type === "divider") return <hr className="pageDivider" />;

  if (block.type === "image") {
    return <BlockImage alt={block.title} src={block.imageUrl || block.url} />;
  }

  if (block.type === "video") {
    return (
      <div className="pageVideo">
        <PlayableVideo preview={preview} src={block.videoUrl || block.url} title={block.title || "Video"} />
        {block.title && <strong>{block.title}</strong>}
      </div>
    );
  }

  const buttonColor = typeof block.settings.buttonColor === "string" ? block.settings.buttonColor : "";
  const colorOverride = buttonColor ? { background: buttonColor, color: readableTextColor(buttonColor) } : undefined;

  return (
    <a
      className={`pageButton buttonStyle-${buttonStyle}`}
      href={buildSmartUrl(block)}
      style={colorOverride}
      target={preview ? undefined : "_blank"}
      rel={preview ? undefined : "noreferrer"}
      onClick={preview ? (event) => event.preventDefault() : () => onTrack?.(block)}
      tabIndex={preview ? -1 : 0}
    >
      <span className="pageButtonIcon">{resolveBlockIcon(block.icon, block.type)}</span>
      <span className="pageButtonLabel">
        <strong>{block.title || "Untitled link"}</strong>
        {block.subtitle && <small>{block.subtitle}</small>}
      </span>
    </a>
  );
}

function SocialRow({
  block,
  edit,
  onTrack,
}: {
  block: PageBlock;
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
}) {
  const preview = Boolean(edit);
  const link = (
    <a
      className="pageSocialIcon"
      href={buildSmartUrl(block)}
      aria-label={block.title || "Social link"}
      target={preview ? undefined : "_blank"}
      rel={preview ? undefined : "noreferrer"}
      onClick={preview ? (event) => event.preventDefault() : () => onTrack?.(block)}
      tabIndex={preview ? -1 : 0}
    >
      {resolveBlockIcon(block.icon, block.type)}
    </a>
  );

  if (!edit) return link;

  const selected = edit.selectedBlockId === block.id;
  return (
    <div
      className={`pageSocialWrap ${selected ? "pageBlockRowSelected" : ""} ${block.isActive ? "" : "pageBlockHidden"}`}
      onClickCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        edit.onSelectBlock(block.id);
      }}
    >
      {link}
    </div>
  );
}

function BlockImage({ alt, src }: { alt: string; src: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="pageImage pageImageFallback" role="img" aria-label={alt || "Image"}>
        <ImageIcon aria-hidden="true" />
      </div>
    );
  }
  return <img className="pageImage" key={src} src={src} alt={alt} onError={() => setFailed(true)} />;
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

const curatedIcons: Record<string, LucideIcon> = {
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
  instagram: Camera,
  facebook: Globe2,
  youtube: Play,
  camera: Camera,
};

/** Shared by both views so an icon can never resolve differently. */
export function resolveBlockIcon(icon: string, fallbackType: PageBlock["type"]) {
  const parsed = parseBlockIcon(icon);
  if (parsed.kind === "none") return null;
  if (parsed.kind === "emoji") return <span className="emojiIcon">{parsed.value}</span>;
  if (parsed.kind === "image") {
    return <IconImage src={parsed.src} />;
  }
  const key = parsed.kind === "key" ? parsed.key : "";
  const Icon = curatedIcons[key] ?? blockTypeIcons[fallbackType] ?? Link2;
  return <Icon aria-hidden="true" />;
}

function IconImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Link2 aria-hidden="true" />;
  return <img className="customIconImage" key={src} src={src} alt="" onError={() => setFailed(true)} />;
}

function PlayableVideo({ preview, src, title }: { preview: boolean; src: string; title: string }) {
  const embed = videoEmbedUrl(src);

  if (embed.type === "iframe") {
    return (
      <iframe
        src={embed.src}
        title={title}
        // Pointer events are disabled in the builder so a click selects the
        // block instead of being swallowed by the player.
        style={preview ? { pointerEvents: "none" } : undefined}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }

  if (embed.type === "video") {
    return <video src={embed.src} controls={!preview} playsInline style={preview ? { pointerEvents: "none" } : undefined} />;
  }

  return (
    <div className="videoPlaceholder">
      <Play fill="currentColor" aria-hidden="true" />
      <strong>Video coming soon</strong>
    </div>
  );
}

function videoEmbedUrl(src: string) {
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
