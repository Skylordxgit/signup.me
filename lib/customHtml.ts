import sanitizeHtml from "sanitize-html";
import type { CustomHtmlSettings } from "./types";

const MAX_HTML_BYTES = 750_000;
const allowedSchemes = ["http", "https", "mailto", "tel"];

const allowedCssProperties = [
  "color", "background", "background-color", "background-image", "background-size", "background-position", "background-repeat",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-decoration", "text-transform",
  "display", "flex", "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "gap", "grid", "grid-template-columns", "grid-template-rows", "grid-gap",
  "width", "min-width", "max-width", "height", "min-height", "max-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-top", "border-right", "border-bottom", "border-left", "border-radius", "border-color", "border-width", "border-style",
  "box-shadow", "text-shadow", "opacity", "overflow", "overflow-x", "overflow-y", "position", "top", "right", "bottom", "left", "z-index", "transform", "transition", "cursor",
];
const allowedStylesMap: Record<string, RegExp[]> = {};
for (const prop of allowedCssProperties) {
  allowedStylesMap[prop] = [/.*/];
}

function sanitizeCss(value: string) {
  return value
    .replace(/@import\s+(?:url\()?[^;]+;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "none")
    .replace(/(?:behavior|-moz-binding)\s*:[^;}]+[;}]/gi, "")
    .replace(/url\(\s*["']?\s*(?:javascript|vbscript|file):[^)]*\)/gi, "none")
    .replace(/[a-z-]+\s*:\s*(?:;|\s*$)/gi, "")
    .trim();
}

function warningCount(input: string, output: string, pattern: RegExp, label: string, warnings: string[]) {
  const before = (input.match(pattern) || []).length;
  const after = (output.match(pattern) || []).length;
  if (before > after) warnings.push(`${before - after} ${label} removed.`);
}

/**
 * Sanitizes at the server boundary with sanitize-html's parser, never by
 * executing source or relying on the browser preview. CSS is separately
 * constrained because style attributes are opaque to HTML sanitizers.
 */
export function sanitizeCustomHtml(input: string) {
  if (Buffer.byteLength(input, "utf8") > MAX_HTML_BYTES) throw new Error("HTML is limited to 750 KB.");
  const source = input.trim();
  if (!source) throw new Error("HTML content is required.");
  const warnings: string[] = [];
  let html = sanitizeHtml(source, {
    allowedTags: ["html", "head", "body", "title", "meta", "link", "style", "div", "span", "main", "section", "article", "header", "footer", "nav", "aside", "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "strong", "em", "b", "i", "u", "small", "mark", "blockquote", "pre", "code", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "figure", "figcaption", "picture", "source", "img", "a", "video", "audio", "track", "canvas", "svg", "path", "circle", "rect", "line", "polygon", "g", "use"],
    allowedAttributes: {
      "*": ["class", "id", "style", "title", "role", "aria-label", "aria-hidden", "data-*"],
      a: ["href", "target", "rel", "download"],
      img: ["src", "srcset", "alt", "width", "height", "loading", "decoding"],
      source: ["src", "srcset", "type", "media"],
      link: ["rel", "href", "media", "type"],
      meta: ["name", "property", "content", "charset"],
      video: ["src", "poster", "controls", "autoplay", "muted", "loop", "playsinline", "preload", "width", "height"],
      audio: ["src", "controls", "autoplay", "muted", "loop", "preload"],
      track: ["src", "kind", "srclang", "label", "default"],
      svg: ["viewBox", "width", "height", "fill", "stroke", "xmlns"],
      path: ["d", "fill", "stroke", "stroke-width"],
    },
    allowedSchemes,
    allowedSchemesByTag: { img: ["http", "https"], source: ["http", "https"], video: ["http", "https"], audio: ["http", "https"], track: ["http", "https"] },
    allowProtocolRelative: false,
    allowVulnerableTags: true,
    allowedStyles: {
      "*": allowedStylesMap,
    },
    parser: { lowerCaseAttributeNames: true },
    transformTags: {
      "*": (_tag, attrs) => {
        if (attrs.style) attrs.style = sanitizeCss(attrs.style);
        return { tagName: _tag, attribs: attrs };
      },
    },
  });

  // Post-sanitize CSS content inside style tags
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, css: string) => `<style>${sanitizeCss(css)}</style>`);
  html = html.replace(/<meta\b[^>]+content=["'][^"']*url=[^"']*["'][^>]*>/gi, "");

  warningCount(source, html, /<script\b/gi, "script element(s)", warnings);
  warningCount(source, html, /<\/?(?:iframe|object|embed|applet|base|form|input|button|select|textarea)\b/gi, "unsafe embedded/form element(s)", warnings);
  warningCount(source, html, /\son[a-z]+\s*=/gi, "inline event handler(s)", warnings);
  warningCount(source, html, /(?:javascript|vbscript|file):/gi, "unsafe URL(s)", warnings);
  warningCount(source, html, /<meta\b[^>]+http-equiv\s*=\s*(?:"?refresh"?)/gi, "meta refresh element(s)", warnings);
  return { html, warnings: [...new Set(warnings)] };
}

export function emptyCustomHtml(): CustomHtmlSettings {
  return { sourceHtml: "", draftHtml: "", publishedHtml: "", warnings: [], draftVersion: 0, publishedVersion: 0, versions: [] };
}

export function extractUploadedMetadata(html: string): CustomHtmlSettings["uploadedMetadata"] {
  const clean = sanitizeHtml(html, { allowedTags: ["title", "meta", "link"], allowedAttributes: { meta: ["name", "property", "content"], link: ["rel", "href"] }, allowedSchemes: ["http", "https"] });
  const value = (pattern: RegExp) => clean.match(pattern)?.[1]?.trim();
  return {
    title: value(/<title>([\s\S]*?)<\/title>/i),
    description: value(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i),
    socialTitle: value(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i),
    socialDescription: value(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i),
    ogImage: value(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i),
    canonicalUrl: value(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i),
  };
}

export function createCustomHtmlDraft(current: CustomHtmlSettings | undefined, sourceHtml: string) {
  const { html, warnings } = sanitizeCustomHtml(sourceHtml);
  const now = new Date().toISOString();
  const version = (current?.draftVersion || current?.publishedVersion || 0) + 1;
  return { sourceHtml, draftHtml: html, publishedHtml: current?.publishedHtml || "", uploadedMetadata: extractUploadedMetadata(sourceHtml), warnings, draftVersion: version, publishedVersion: current?.publishedVersion || 0, versions: [...(current?.versions || []), { version, sourceHtml, sanitizedHtml: html, createdAt: now, warnings }].slice(-20) };
}

export function publishCustomHtml(current: CustomHtmlSettings) {
  if (!current.draftHtml) throw new Error("Add HTML content before publishing.");
  const now = new Date().toISOString();
  return { ...current, publishedHtml: current.draftHtml, publishedVersion: current.draftVersion, versions: current.versions.map(version => version.version === current.draftVersion ? { ...version, publishedAt: now } : version) };
}

export function restoreCustomHtmlDraft(current: CustomHtmlSettings, version: number) {
  const snapshot = current.versions.find(item => item.version === version);
  if (!snapshot) throw new Error("Version not found.");
  return createCustomHtmlDraft(current, snapshot.sourceHtml);
}
