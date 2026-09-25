"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ImageIcon, Play, Share2 } from "lucide-react";
import type { PageBlock, SmartPage } from "@/lib/types";
import type { WorkspaceBranding } from "@/lib/workspaceBrandingConstants";
import { buildSmartUrl, publicPageUrl, readableTextColor } from "@/lib/utils";
import { resolveAlignment, resolveButtonStyle, resolveProfileLayout, resolveSurface, themeCssVariables } from "@/lib/themes";
import { resolveBlockIcon } from "@/components/blockIcons";

export { resolveBlockIcon };

const buttonEffects = new Set([
  "shine",
  "border-glow",
  "neon-border",
  "pulse",
  "breathe",
  "lift",
  "slide-light",
  "aurora",
  "double-ring",
  "spotlight",
]);

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
  workspaceBranding,
}: {
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
  page: SmartPage;
  preview?: boolean;
  workspaceBranding?: WorkspaceBranding | null;
}) {
  const theme = page.theme;
  const buttonStyle = resolveButtonStyle(theme);
  const buttonAnimation = theme.buttonAnimation ?? false;
  const surface = resolveSurface(theme);
  const align = resolveAlignment(theme);
  const layout = resolveProfileLayout(theme);
  const hasCover = Boolean(theme.backgroundImage) && layout !== "avatar" && layout !== "none";
  const avatarImage = page.logoImage || page.profileImage || workspaceBranding?.logoUrl;
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
              <BlockRow block={group[0]} buttonAnimation={buttonAnimation} buttonStyle={buttonStyle} edit={edit} key={group[0].id} onTrack={onTrack} preview={isPreview} />
            ))}
          </div>
        )}
        {Boolean(workspaceBranding?.footerText) && (
          <footer className="pageCustomFooter" style={{ textAlign: "center", marginTop: 24, fontSize: 13, opacity: 0.75, color: "var(--text)" }}>
            {workspaceBranding?.footerText}
          </footer>
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

function ProfileIdentity({ page, showAvatar, src }: { page: SmartPage; showAvatar: boolean; src?: string }) {
  const theme = page.theme;
  const avatarX = theme.avatarX ?? 0;
  const avatarY = theme.avatarY ?? -19;
  const avatarSize = theme.avatarSize ?? 76;
  const titleX = theme.titleX ?? -2;
  const titleY = theme.titleY ?? -20;
  const bioX = theme.bioX ?? 0;
  const bioY = theme.bioY ?? -24;

  const avatarStyle: CSSProperties = {
    transform: `translate(${avatarX}px, ${avatarY}px)`,
    width: `${avatarSize}px`,
    height: `${avatarSize}px`,
    minWidth: `${avatarSize}px`,
    minHeight: `${avatarSize}px`,
  };

  const titleStyle: CSSProperties = {
    transform: `translate(${titleX}px, ${titleY}px)`,
  };

  const bioStyle: CSSProperties = {
    transform: `translate(${bioX}px, ${bioY}px)`,
  };

  return (
    <>
      {showAvatar && <ProfileAvatar key={src} name={page.title || page.name} src={src || ""} style={avatarStyle} />}
      {(page.title || page.bio) && (
        <div className="pageIdentityText">
          {page.title && <h1 className="pageTitle" style={titleStyle}>{page.title}</h1>}
          {page.bio && <p className="pageBio" style={bioStyle}>{page.bio}</p>}
        </div>
      )}
    </>
  );
}

/** Falls back to initials so a missing or broken avatar never leaves a hole. */
function ProfileAvatar({ name, src, style }: { name: string; src: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  if (!src || failed) {
    return <div className="pageAvatar pageAvatarFallback" style={style}>{initials || "?"}</div>;
  }

  return <img className="pageAvatar" key={src} src={src} alt="" style={style} onError={() => setFailed(true)} />;
}

/**
 * Rendered in both views at the same position. In the builder it is inert so a
 * click cannot open a share sheet while designing, but it occupies exactly the
 * same box with the same styling.
 */
function ShareAction({ page, preview }: { page: SmartPage; preview: boolean }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = publicPageUrl(page.slug, window.location.origin);
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
  buttonAnimation,
  buttonStyle,
  edit,
  onTrack,
  preview,
}: {
  block: PageBlock;
  buttonAnimation: boolean;
  buttonStyle: string;
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
  preview: boolean;
}) {
  const view = <PageBlockView block={block} buttonAnimation={buttonAnimation} buttonStyle={buttonStyle} preview={preview} onTrack={onTrack} />;
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
  buttonAnimation,
  buttonStyle,
  onTrack,
  preview,
}: {
  block: PageBlock;
  buttonAnimation?: boolean;
  buttonStyle: string;
  onTrack?: (block: PageBlock) => void;
  preview: boolean;
}) {
  if (block.type === "heading") {
    const align = typeof block.settings?.align === "string" ? block.settings.align : "";
    const style = align ? { textAlign: align as CSSProperties["textAlign"] } : undefined;
    return <h2 className={`pageHeading${align ? ` pageHeading-${align}` : ""}`} style={style}>{block.title}</h2>;
  }
  if (block.type === "text") {
    const align = typeof block.settings?.align === "string" ? block.settings.align : "";
    const style = align ? { textAlign: align as CSSProperties["textAlign"] } : undefined;
    return <p className={`pageText${align ? ` pageText-${align}` : ""}`} style={style}>{block.subtitle || block.title}</p>;
  }
  if (block.type === "divider") return <hr className="pageDivider" />;
  if (block.type === "spacer") {
    const rawHeight = typeof block.settings?.height === "number" ? block.settings.height : Number(block.settings?.height) || 24;
    const height = Math.max(4, Math.min(240, rawHeight));
    return (
      <div
        className="pageSpacer"
        style={{ height: `${height}px`, minHeight: `${height}px` }}
        aria-hidden="true"
      >
        {preview && (
          <span className="pageSpacerGuide">
            <span>{height}px space</span>
          </span>
        )}
      </div>
    );
  }

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
  const savedEffect = typeof block.settings.buttonEffect === "string" ? block.settings.buttonEffect : "";
  const buttonEffect = buttonEffects.has(savedEffect) ? savedEffect : savedEffect === "none" ? "" : buttonAnimation ? "shine" : "";
  const colorOverride = buttonColor ? {
    "--button-bg": buttonColor,
    background: buttonColor,
    color: readableTextColor(buttonColor),
  } as CSSProperties : undefined;

  const icon = resolveBlockIcon(block.icon, block.type);
  const hasIcon = Boolean(icon);

  return (
    <a
      className={`pageButton buttonStyle-${buttonStyle}${buttonEffect ? ` pageButtonEffect pageButtonEffect-${buttonEffect}` : ""}${hasIcon ? " hasIcon" : ""}`}
      href={buildSmartUrl(block)}
      style={colorOverride}
      target={preview ? undefined : "_blank"}
      rel={preview ? undefined : "noreferrer"}
      onClick={preview ? (event) => event.preventDefault() : () => onTrack?.(block)}
      tabIndex={preview ? -1 : 0}
    >
      <span className="pageButtonIcon">{icon}</span>
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

function PlayableVideo({ preview, src, title }: { preview: boolean; src: string; title: string }) {
  const embed = useMemo(() => videoEmbedUrl(src), [src]);
  const [checked, setChecked] = useState<{ src: string; blocked: boolean } | null>(null);

  useEffect(() => {
    if (embed.type !== "iframe" || !embed.oembedUrl) return;
    let cancelled = false;
    fetch(embed.oembedUrl)
      .then((response) => {
        if (!cancelled) setChecked({ src: embed.src, blocked: !response.ok });
      })
      .catch(() => {
        /* If the preflight check fails, try the embed as usual. */
      });
    return () => {
      cancelled = true;
    };
  }, [embed]);

  if (embed.type === "iframe" && checked?.src === embed.src && checked.blocked) {
    return (
      <div className="videoPlaceholder videoBlocked" role="status">
        <Play fill="currentColor" aria-hidden="true" />
        <strong>Video unavailable here</strong>
      </div>
    );
  }

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

type VideoEmbed =
  | { type: "empty"; src: "" }
  | { type: "video"; src: string }
  | { type: "iframe"; src: string; oembedUrl: string | null };

function videoEmbedUrl(src: string): VideoEmbed {
  if (!src) return { type: "empty", src: "" };
  try {
    const url = new URL(src);
    const youtubeId = youtubeVideoId(url);
    if (youtubeId) {
      const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
      return {
        type: "iframe",
        src: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1&rel=0`,
        oembedUrl: `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      };
    }
    if (url.hostname.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop() || "";
      const watchUrl = `https://vimeo.com/${id}`;
      return {
        type: "iframe",
        src: `https://player.vimeo.com/video/${id}?autoplay=1&muted=1`,
        oembedUrl: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(watchUrl)}`,
      };
    }
    if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) {
      return { type: "video", src };
    }
    return { type: "iframe", src, oembedUrl: null };
  } catch {
    return { type: "empty", src: "" };
  }
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
