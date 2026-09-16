"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Calendar,
  Camera,
  CircleHelp,
  Clock,
  Compass,
  CreditCard,
  Crown,
  FileText,
  Flame,
  Gift,
  Globe2,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  ImageIcon,
  Info,
  Layers,
  Link2,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Mic,
  Moon,
  MoveVertical,
  Music2,
  Navigation,
  Newspaper,
  Phone,
  Play,
  Podcast,
  Radio,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smile,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  Ticket,
  Tv,
  User,
  Users,
  Video,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { PageBlock, SmartPage } from "@/lib/types";
import { buildSmartUrl, parseBlockIcon, publicPageUrl, readableTextColor } from "@/lib/utils";
import { resolveAlignment, resolveButtonStyle, resolveProfileLayout, resolveSurface, themeCssVariables } from "@/lib/themes";

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
}: {
  edit?: PageEditHooks;
  onTrack?: (block: PageBlock) => void;
  page: SmartPage;
  preview?: boolean;
}) {
  const theme = page.theme;
  const buttonStyle = resolveButtonStyle(theme);
  const buttonAnimation = theme.buttonAnimation ?? false;
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
              <BlockRow block={group[0]} buttonAnimation={buttonAnimation} buttonStyle={buttonStyle} edit={edit} key={group[0].id} onTrack={onTrack} preview={isPreview} />
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
  const theme = page.theme;
  const avatarStyle: CSSProperties | undefined = (theme.avatarX || theme.avatarY || theme.avatarSize) ? {
    transform: (theme.avatarX || theme.avatarY) ? `translate(${theme.avatarX || 0}px, ${theme.avatarY || 0}px)` : undefined,
    width: theme.avatarSize ? `${theme.avatarSize}px` : undefined,
    height: theme.avatarSize ? `${theme.avatarSize}px` : undefined,
    minWidth: theme.avatarSize ? `${theme.avatarSize}px` : undefined,
    minHeight: theme.avatarSize ? `${theme.avatarSize}px` : undefined,
  } : undefined;

  const titleStyle: CSSProperties | undefined = (theme.titleX || theme.titleY) ? {
    transform: `translate(${theme.titleX || 0}px, ${theme.titleY || 0}px)`,
  } : undefined;

  const bioStyle: CSSProperties | undefined = (theme.bioX || theme.bioY) ? {
    transform: `translate(${theme.bioX || 0}px, ${theme.bioY || 0}px)`,
  } : undefined;

  return (
    <>
      {showAvatar && <ProfileAvatar key={src} name={page.title || page.name} src={src} style={avatarStyle} />}
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

/* Clean SVG brand icons for major social and digital platforms */
function SvgFacebook(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function SvgInstagram(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function SvgWhatsApp(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M17.472 14.382c-.301-.15-1.782-.879-2.058-.98-.277-.1-.478-.15-.679.15-.201.301-.778.98-.954 1.181-.176.201-.351.226-.653.076-.301-.151-1.272-.469-2.424-1.497-.896-.799-1.501-1.787-1.677-2.088-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.151-.176.201-.301.301-.502.1-.201.05-.376-.025-.527-.075-.15-.679-1.636-.93-2.241-.244-.589-.493-.509-.679-.519-.176-.01-.377-.01-.578-.01-.201 0-.527.075-.803.376s-1.055 1.03-1.055 2.511c0 1.481 1.08 2.909 1.23 3.11 0.151.201 2.125 3.245 5.15 4.551.719.311 1.281.497 1.719.636.723.23 1.381.197 1.901.12.579-.087 1.782-.728 2.033-1.431.251-.703.251-1.305.176-1.431-.075-.125-.276-.201-.577-.351zM12.042 21.904c-1.782 0-3.528-.48-5.06-1.388l-.363-.215-3.76 0.986 1.003-3.666-.237-.377c-.997-1.587-1.523-3.424-1.523-5.312 0-5.467 4.453-9.92 9.939-9.92 2.653 0 5.147 1.034 7.021 2.91 1.874 1.876 2.906 4.372 2.906 7.024 0 5.469-4.453 9.958-9.926 9.958zM12.042 0C5.399 0 0.007 5.391 0.007 12.034c0 2.121.554 4.189 1.606 6.012L0 24l6.136-1.609c1.758.959 3.738 1.464 5.906 1.464 6.644 0 12.034-5.391 12.034-12.034C24.076 5.391 18.686 0 12.042 0z" />
    </svg>
  );
}

function SvgTelegram(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.197 1.006.128.832.942z" />
    </svg>
  );
}

function SvgTwitterX(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function SvgYouTube(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function SvgTikTok(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 2.89 3.5 2.76 1.17-.04 2.27-.67 2.89-1.66.42-.64.6-1.42.6-2.2V.02h.73z" />
    </svg>
  );
}

function SvgLinkedIn(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}

function SvgDiscord(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function SvgSnapchat(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M12.007 0C6.302 0 3.784 3.738 3.784 6.844c0 1.705.518 3.518 1.57 4.708.204.23.33.456.28.704-.085.42-.663.667-1.282.89-.526.19-1.08.39-1.385.733-.284.32-.236.724-.13 1.047.382 1.157 1.838 1.94 3.535 2.052.285.019.508.188.625.433.22.464.004.992-.48 1.382-1.09.877-2.398 1.268-3.663 1.487-.417.072-.676.326-.643.687.037.402.393.636.817.653 1.485.059 2.923-.424 4.29-1.127.426-.219.866-.145 1.272.102 1.36.828 2.822 1.266 4.39 1.266 1.567 0 3.03-.438 4.39-1.266.406-.247.846-.321 1.272-.102 1.367.703 2.805 1.186 4.29 1.127.424-.017.78-.251.817-.653.033-.361-.226-.615-.643-.687-1.265-.219-2.573-.61-3.663-1.487-.484-.39-.7-.918-.48-1.382.117-.245.34-.414.625-.433 1.697-.112 3.153-.895 3.535-2.052.106-.323.154-.727-.13-1.047-.305-.343-.859-.543-1.385-.733-.619-.223-1.197-.47-1.282-.89-.05-.248.076-.474.28-.704 1.052-1.19 1.57-3.003 1.57-4.708C20.23 3.738 17.712 0 12.007 0z" />
    </svg>
  );
}

function SvgSpotify(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.49 17.306c-.215.352-.676.463-1.028.247-2.823-1.725-6.376-2.114-10.562-1.157-.402.092-.803-.16-.895-.562-.092-.403.159-.804.562-.896 4.585-1.047 8.52-.601 11.676 1.34.352.216.463.676.247 1.028zm1.464-3.257c-.27.44-.848.577-1.288.307-3.232-1.986-8.158-2.56-11.981-1.399-.496.15-1.023-.133-1.173-.629-.15-.496.133-1.023.629-1.173 4.373-1.327 9.808-.684 13.506 1.586.44.27.577.848.307 1.288zm.126-3.41c-3.876-2.302-10.27-2.514-13.978-1.389-.594.18-1.224-.162-1.404-.756-.18-.594.162-1.224.756-1.404 4.254-1.292 11.31-1.045 15.776 1.606.534.317.708 1.01.391 1.544-.317.534-1.01.708-1.541.399z" />
    </svg>
  );
}

function SvgPinterest(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M12 0a12 12 0 0 0-4.37 23.18c-.07-.94-.13-2.39.03-3.42.14-.94.94-3.99.94-3.99s-.24-.48-.24-1.19c0-1.12.65-1.95 1.46-1.95.69 0 1.02.52 1.02 1.14 0 .69-.44 1.73-.67 2.69-.19.8.4 1.46 1.19 1.46 1.43 0 2.53-1.51 2.53-3.69 0-1.93-1.39-3.28-3.37-3.28-2.46 0-3.9 1.85-3.9 3.75 0 .74.29 1.54.64 1.97.07.09.08.16.06.25-.07.28-.22.89-.25 1.01-.04.17-.14.21-.32.13-1.19-.55-1.93-2.29-1.93-3.69 0-3 2.18-5.76 6.29-5.76 3.3 0 5.87 2.35 5.87 5.5 0 3.28-2.07 5.92-4.94 5.92-.96 0-1.87-.5-2.18-1.09l-.59 2.27c-.22.83-.8 1.87-1.19 2.51A11.996 11.996 0 0 0 12 24c6.63 0 12-5.37 12-12S18.63 0 12 0z" />
    </svg>
  );
}

function SvgGithub(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function SvgTwitch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" {...props}>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

type IconRenderer = LucideIcon | React.ComponentType<React.SVGProps<SVGSVGElement>>;

const blockTypeIcons: Partial<Record<PageBlock["type"], IconRenderer>> = {
  whatsapp: SvgWhatsApp,
  telegram: SvgTelegram,
  messenger: MessageCircle,
  instagram: SvgInstagram,
  facebook: SvgFacebook,
  youtube: SvgYouTube,
  email: Mail,
  phone: Phone,
  website: Globe2,
  link: Link2,
  spacer: MoveVertical,
  socials: Share2,
};

const curatedIcons: Record<string, IconRenderer> = {
  // Brand & social platforms
  facebook: SvgFacebook,
  instagram: SvgInstagram,
  whatsapp: SvgWhatsApp,
  telegram: SvgTelegram,
  youtube: SvgYouTube,
  twitter: SvgTwitterX,
  x: SvgTwitterX,
  tiktok: SvgTikTok,
  linkedin: SvgLinkedIn,
  discord: SvgDiscord,
  snapchat: SvgSnapchat,
  spotify: SvgSpotify,
  pinterest: SvgPinterest,
  github: SvgGithub,
  twitch: SvgTwitch,
  messenger: MessageCircle,

  // Action, contact, and UI icons
  link: Link2,
  globe: Globe2,
  mail: Mail,
  email: Mail,
  phone: Phone,
  message: MessageSquare,
  send: Send,
  share: Share2,
  spacer: MoveVertical,
  space: MoveVertical,
  home: Home,
  user: User,
  users: Users,
  star: Star,
  heart: Heart,
  thumbsup: ThumbsUp,
  smile: Smile,
  crown: Crown,
  flame: Flame,
  zap: Zap,
  sparkles: Sparkles,
  gift: Gift,
  ticket: Ticket,
  tag: Tag,
  cart: ShoppingCart,
  "shopping-bag": ShoppingBag,
  wallet: Wallet,
  card: CreditCard,
  "map-pin": MapPin,
  navigation: Navigation,
  compass: Compass,
  music: Music2,
  podcast: Podcast,
  mic: Mic,
  headphones: Headphones,
  radio: Radio,
  video: Video,
  tv: Tv,
  camera: Camera,
  image: ImageIcon,
  calendar: Calendar,
  clock: Clock,
  file: FileText,
  news: Newspaper,
  megaphone: Megaphone,
  shield: ShieldCheck,
  lock: Lock,
  moon: Moon,
  help: HelpCircle,
  info: Info,
  layers: Layers,
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
