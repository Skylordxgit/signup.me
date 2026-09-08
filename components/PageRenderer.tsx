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
import { buildSmartUrl, parseBlockIcon, publicPageUrl, readableTextColor } from "@/lib/utils";
import { resolveAlignment, resolveButtonStyle, resolveProfileLayout, resolveSurface, themeCssVariables } from "@/lib/themes";

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
  preview = false,
}: {
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
  page: SmartPage;
  preview?: boolean;
}) {
  const theme = page.theme;
  const buttonStyle = resolveButtonStyle(theme);
  const surface = resolveSurface(theme);
  const align = resolveAlignment(theme);
  const layout = resolveProfileLayout(theme);
  const hasCover = Boolean(theme.backgroundImage) && layout !== "avatar" && layout !== "none";
  const avatarImage = page.logoImage || page.profileImage;
  const hasAvatar = Boolean(avatarImage) && layout !== "none";
  const hasProfile = hasAvatar || Boolean(page.title || page.bio);
  const isPreview = preview || Boolean(edit);

  // The builder shows hidden blocks (dimmed) so they can be re-enabled;
  // visitors only ever get the active ones. Order is identical.
  const ordered = [...page.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  const blocks = edit ? ordered : ordered.filter((block) => block.isActive);

  // Only adjacent social links share a row; never move them ahead of content.
  const groups: PageBlock[][] = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    if (block.type === "socials" && last?.[0].type === "socials") last.push(block);
    else groups.push([block]);
  }

  return (
    <div className="smartPage" style={themeCssVariables(theme)}>
      <div className="pageColumn">
      <div className={`smartCard surface-${surface}`} data-align={align} data-layout={layout} data-cover={hasCover} data-avatar={hasAvatar}>
        {hasCover && <PageCover edit={edit} page={page} preview={isPreview} theme={theme} />}
        {!hasCover && theme.showShareButton && (
          <div className="pageActions"><ShareAction page={page} preview={isPreview} /></div>
        )}

        {(hasProfile || edit) && <header className="pageProfile">
          {/* Same element type and classes in both modes; the builder only
              swaps the tag for a button so the identity is clickable. */}
          {edit ? (
            <button
              type="button"
              className="pageIdentity pageIdentityEditable"
              aria-label="Edit profile"
              onClick={edit.onEditProfile}
            >
              <ProfileIdentity page={page} showAvatar={hasAvatar} src={avatarImage} />
            </button>
          ) : (
            <div className="pageIdentity">
              <ProfileIdentity page={page} showAvatar={hasAvatar} src={avatarImage} />
            </div>
          )}
        </header>}

        {groups.length > 0 && (
          <div className="pageBlocks">
            {groups.map((group) => group[0].type === "socials" ? (
              <div className="pageSocials" key={group[0].id}>
                {group.map((block) => <SocialRow block={block} edit={edit} key={block.id} onTrack={onTrack} preview={isPreview} />)}
              </div>
            ) : (
              <BlockRow block={group[0]} buttonStyle={buttonStyle} edit={edit} key={group[0].id} onTrack={onTrack} preview={isPreview} />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function PageCover({
  edit,
  page,
  preview,
  theme,
}: {
  edit?: PageEditHooks;
  page: SmartPage;
  preview: boolean;
  theme: SmartPage["theme"];
}) {
  const style = theme.backgroundImage ? { backgroundImage: `url(${theme.backgroundImage})` } : undefined;
  return (
    <div className="pageCover" style={style}>
      {/* Edit affordance fills the cover and sits beneath the share control,
          so tapping share never opens the cover editor. */}
      {edit && (
        <button type="button" className="pageCoverEdit" aria-label="Edit cover" onClick={edit.onEditProfile} />
      )}
      {theme.showShareButton && <ShareAction page={page} preview={preview} />}
    </div>
  );
}

function ProfileIdentity({ page, showAvatar, src }: { page: SmartPage; showAvatar: boolean; src: string }) {
  return (
    <>
      {showAvatar && <ProfileAvatar key={src} name={page.title || page.name} src={src} />}
      {(page.title || page.bio) && <div className="pageIdentityText">
        {page.title && <h1 className="pageTitle">{page.title}</h1>}
        {page.bio && <p className="pageBio">{page.bio}</p>}
      </div>}
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
    const url = publicPageUrl(page.slug);
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
      title={copied ? "Link copied" : "Share page"}
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
  preview,
}: {
  block: PageBlock;
  buttonStyle: string;
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
  preview: boolean;
}) {
  const view = <PageBlockView block={block} buttonStyle={buttonStyle} preview={preview} onTrack={onTrack} />;
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

  if (block.type === "video" || block.type === "youtube") {
    return (
      <div className="pageVideo">
        <PlayableVideo preview={preview} src={block.videoUrl || block.url} title={block.title || "Video"} />
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
  preview,
}: {
  block: PageBlock;
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
  preview: boolean;
}) {
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
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
      />
    );
  }

  if (embed.type === "video") {
    return <video src={embed.src} autoPlay muted controls={!preview} playsInline style={preview ? { pointerEvents: "none" } : undefined} />;
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
    const youtubeId = youtubeVideoId(url);
    if (youtubeId) {
      return { type: "iframe" as const, src: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1&rel=0` };
    }
    if (url.hostname.includes("vimeo.com")) {
      return { type: "iframe" as const, src: `https://player.vimeo.com/video/${url.pathname.split("/").filter(Boolean).pop()}?autoplay=1&muted=1` };
    }
    if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) {
      return { type: "video" as const, src };
    }
  } catch {
    return { type: "empty" as const, src: "" };
  }
  return { type: "iframe" as const, src };
}

function youtubeVideoId(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
  if (!host.endsWith("youtube.com")) return "";
  const direct = url.searchParams.get("v");
  if (direct) return direct;
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
  return marker >= 0 ? parts[marker + 1] || "" : "";
}
