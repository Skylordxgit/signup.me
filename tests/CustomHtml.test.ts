import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { sanitizeCustomHtml, createCustomHtmlDraft, publishCustomHtml, restoreCustomHtmlDraft, extractUploadedMetadata } from "../lib/customHtml";
import { rewriteUrls } from "../app/api/pages/[id]/custom-html/upload/route";
import { createCustomHtmlPage, saveCustomHtmlDraft, getPageById, deletePage, duplicatePage, trackCustomHtmlLinkClick, analyticsForPage, updatePage } from "../lib/store";
import { publicPageMetadata } from "../lib/domainRouting";
import { resolveNotificationPromptTheme } from "../lib/notificationPrompt";
import { ownCustomHtmlAssets, duplicateCustomHtmlAssetOwnership, removeCustomHtmlAssetOwnership, getCustomHtmlAssetsForPage } from "../lib/uploads";
import type { SmartPage } from "../lib/types";

test("Sanitizer: removes scripts, event handlers, unsafe schemes, embeds, and unsafe CSS", () => {
  // 1. Script tags (standard, mixed-case, whitespace)
  const scriptTest = sanitizeCustomHtml('<div><h1>Hello</h1><script>alert("xss")</script><ScRiPt src="evil.js"></sCrIpT></div>');
  assert.equal(scriptTest.html.includes("script"), false);
  assert.equal(scriptTest.html.includes("alert"), false);
  assert.ok(scriptTest.warnings.some(w => w.includes("script element(s) removed")));

  // 2. Inline event attributes (onclick, onerror, onload, etc.)
  const eventTest = sanitizeCustomHtml('<img src="https://example.com/pic.jpg" onerror="alert(1)" onload="alert(2)"><button onclick="steal()">Click</button>');
  assert.equal(eventTest.html.includes("onerror"), false);
  assert.equal(eventTest.html.includes("onload"), false);
  assert.equal(eventTest.html.includes("onclick"), false);
  assert.equal(eventTest.html.includes("button"), false); // form buttons stripped in secure html
  assert.ok(eventTest.html.includes('src="https://example.com/pic.jpg"'));

  // 3. Unsafe URL schemes (javascript:, vbscript:, file:)
  const urlTest = sanitizeCustomHtml('<a href="javascript:alert(1)">JS</a><a href="vbscript:msgbox(1)">VB</a><a href="file:///etc/passwd">File</a><a href="https://example.com">Safe</a><a href="mailto:info@example.com">Mail</a><a href="tel:+123456789">Tel</a><a href="#hero">Anchor</a>');
  assert.equal(urlTest.html.includes("javascript:"), false);
  assert.equal(urlTest.html.includes("vbscript:"), false);
  assert.equal(urlTest.html.includes("file:"), false);
  assert.ok(urlTest.html.includes('href="https://example.com"'));
  assert.ok(urlTest.html.includes('href="mailto:info@example.com"'));
  assert.ok(urlTest.html.includes('href="tel:+123456789"'));

  // 4. Meta refresh redirects & embeds
  const embedTest = sanitizeCustomHtml('<meta http-equiv="refresh" content="0;url=http://evil.com"><iframe src="https://evil.com"></iframe><object data="bad.swf"></object><embed src="bad.swf">');
  assert.equal(embedTest.html.includes("refresh"), false);
  assert.equal(embedTest.html.includes("iframe"), false);
  assert.equal(embedTest.html.includes("object"), false);
  assert.equal(embedTest.html.includes("embed"), false);

  // 5. CSS expression, javascript url, and @import
  const cssTest = sanitizeCustomHtml('<style>body { background: expression(alert(1)); background-image: url(javascript:alert(2)); } @import url("http://evil.com/bad.css");</style><div style="background: expression(alert(3)); color: red;">Styled</div>');
  assert.equal(cssTest.html.includes("expression"), false);
  assert.equal(cssTest.html.includes("javascript:"), false);
  assert.equal(cssTest.html.includes("@import"), false);
  assert.ok(/color:\s*red/i.test(cssTest.html));

  // 6. Safe HTML & responsive CSS allowed
  const safeDoc = '<div class="container" style="max-width: 1200px; display: flex;"><header><h1>Title</h1><p>Welcome</p></header><main><img src="https://images.unsplash.com/photo-1" alt="Hero" width="800" height="600" loading="lazy"></main></div>';
  const clean = sanitizeCustomHtml(safeDoc);
  assert.ok(clean.html.includes('class="container"'));
  assert.ok(/max-width:\s*1200px/i.test(clean.html));
  assert.ok(clean.html.includes('loading="lazy"'));
});

test("ZIP URL rewriting: resolves relative paths and preserves query strings and fragments", () => {
  const assets = new Map<string, string>([
    ["images/banner.png", "/uploads/asset/banner-123.png"],
    ["images/logo.png", "/uploads/asset/logo-456.png"],
    ["fonts/inter.woff2", "/uploads/asset/inter-789.woff2"],
    ["css/style.css", "/uploads/asset/style-999.css"],
  ]);

  const html = `
    <link rel="stylesheet" href="./css/style.css?v=1.2">
    <img src="images/banner.png?v=4#hero" alt="Banner">
    <img src="./images/logo.png#top" alt="Logo">
    <img srcset="images/logo.png 1x, images/banner.png 2x">
    <a href="https://external.com/page?ref=123">External</a>
    <a href="#section-1">Section</a>
    <div style="background: url('images/banner.png?cache=1');">Banner</div>
  `;

  const rewritten = rewriteUrls(html, assets);
  assert.ok(rewritten.includes('href="/uploads/asset/style-999.css?v=1.2"'));
  assert.ok(rewritten.includes('src="/uploads/asset/banner-123.png?v=4#hero"'));
  assert.ok(rewritten.includes('src="/uploads/asset/logo-456.png#top"'));
  assert.ok(rewritten.includes('/uploads/asset/logo-456.png 1x, /uploads/asset/banner-123.png 2x'));
  assert.ok(rewritten.includes('href="https://external.com/page?ref=123"')); // Not touched
  assert.ok(rewritten.includes('href="#section-1"')); // Not touched
  assert.ok(rewritten.includes("url('/uploads/asset/banner-123.png?cache=1')"));

  // CSS relative to subfolder
  const css = `
    @font-face {
      font-family: 'Inter';
      src: url('../fonts/inter.woff2?v=3') format('woff2');
    }
    .hero { background-image: url('../images/banner.png#main'); }
  `;
  const rewrittenCss = rewriteUrls(css, assets, "css");
  assert.ok(rewrittenCss.includes("url('/uploads/asset/inter-789.woff2?v=3')"));
  assert.ok(rewrittenCss.includes("url('/uploads/asset/banner-123.png#main')"));
});

test("Custom HTML page lifecycle: draft vs published isolation, version restore, duplicate, and delete", async () => {
  const ws = "custom-test-ws-" + Date.now();
  const slug = "promo-test-" + Date.now();

  // 1. Create Custom HTML page
  const created = await createCustomHtmlPage({
    name: "Summer Promo",
    slug,
    title: "Summer Promo 2026",
    workspaceId: ws,
  });
  assert.equal(created.pageType, "custom_html");
  assert.equal(created.status, "draft");

  // 2. Save Draft Version 1
  const v1Html = "<h1>Version 1 Draft</h1><p>Welcome to sale</p>";
  const draft1 = createCustomHtmlDraft(created.customHtml, v1Html);
  const savedV1 = await saveCustomHtmlDraft(created.id, draft1);
  assert.equal(savedV1?.customHtml?.draftVersion, 1);
  assert.equal(savedV1?.customHtml?.publishedVersion, 0); // Not published yet
  assert.equal(savedV1?.customHtml?.publishedHtml, "");

  // 3. Publish Version 1
  const pub1 = publishCustomHtml(savedV1!.customHtml!);
  const publishedV1 = await saveCustomHtmlDraft(created.id, pub1);
  assert.equal(publishedV1?.customHtml?.publishedVersion, 1);
  assert.ok(publishedV1?.customHtml?.publishedHtml.includes("Version 1 Draft"));

  // 4. Edit Draft Version 2 - published version MUST remain Version 1
  const v2Html = "<h1>Version 2 Draft</h1><p>Special VIP sale</p>";
  const draft2 = createCustomHtmlDraft(publishedV1!.customHtml, v2Html);
  const savedV2 = await saveCustomHtmlDraft(created.id, draft2);
  assert.equal(savedV2?.customHtml?.draftVersion, 2);
  assert.equal(savedV2?.customHtml?.publishedVersion, 1); // Live version is STILL 1
  assert.ok(savedV2?.customHtml?.publishedHtml.includes("Version 1 Draft")); // Live content unchanged

  // 5. Restore Version 1 as Draft
  const restoredDraft = restoreCustomHtmlDraft(savedV2!.customHtml!, 1);
  const savedRestored = await saveCustomHtmlDraft(created.id, restoredDraft);
  assert.equal(savedRestored?.customHtml?.draftVersion, 3);
  assert.ok(savedRestored?.customHtml?.draftHtml.includes("Version 1 Draft"));
  assert.equal(savedRestored?.customHtml?.publishedVersion, 1);

  // 6. Duplicate page
  const duplicated = await duplicatePage(created.id);
  assert.ok(duplicated);
  assert.equal(duplicated?.pageType, "custom_html");
  assert.equal(duplicated?.status, "draft");
  assert.notEqual(duplicated?.id, created.id);
  assert.ok(duplicated?.slug.startsWith(slug));

  // 7. Delete pages
  const delOriginal = await deletePage(created.id);
  const delDup = await deletePage(duplicated!.id);
  assert.equal(delOriginal, true);
  assert.equal(delDup, true);
  assert.equal(await getPageById(created.id), null);
});

test("Asset lifecycle: page-owned asset registration, duplication sharing, and orphan cleanup", async () => {
  const ws = "asset-ws-" + Date.now();
  const pageA = 1001;
  const pageB = 1002;
  const sharedAsset = "/uploads/asset/shared-image.png";
  const uniqueAssetA = "/uploads/asset/unique-a.png";

  // Register assets for page A
  await ownCustomHtmlAssets(pageA, ws, [sharedAsset, uniqueAssetA]);
  const assetsA = await getCustomHtmlAssetsForPage(pageA, ws);
  assert.ok(assetsA.includes(sharedAsset));
  assert.ok(assetsA.includes(uniqueAssetA));

  // Duplicate ownership to page B
  await duplicateCustomHtmlAssetOwnership(pageA, pageB, ws);
  const assetsB = await getCustomHtmlAssetsForPage(pageB, ws);
  assert.ok(assetsB.includes(sharedAsset));
  assert.ok(assetsB.includes(uniqueAssetA));

  // Remove ownership of page A
  await removeCustomHtmlAssetOwnership(pageA, ws);
  const afterDelA = await getCustomHtmlAssetsForPage(pageA, ws);
  assert.equal(afterDelA.length, 0);

  // Page B should still own the assets
  const stillOwnedB = await getCustomHtmlAssetsForPage(pageB, ws);
  assert.ok(stillOwnedB.includes(sharedAsset));
  assert.ok(stillOwnedB.includes(uniqueAssetA));

  // Clean up page B
  await removeCustomHtmlAssetOwnership(pageB, ws);
  const afterDelB = await getCustomHtmlAssetsForPage(pageB, ws);
  assert.equal(afterDelB.length, 0);
});

test("SEO precedence: Platform SEO overrides uploaded HTML metadata fallback", () => {
  const uploadedHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Uploaded HTML Title</title>
        <meta name="description" content="Uploaded HTML Meta Description">
        <meta property="og:title" content="Uploaded Social Title">
        <meta property="og:description" content="Uploaded Social Description">
        <meta property="og:image" content="https://example.com/uploaded-og.jpg">
        <link rel="canonical" href="https://example.com/canonical-source">
      </head>
      <body><h1>Content</h1></body>
    </html>
  `;
  const uploadedMeta = extractUploadedMetadata(uploadedHtml);
  assert.equal(uploadedMeta?.title, "Uploaded HTML Title");
  assert.equal(uploadedMeta?.description, "Uploaded HTML Meta Description");

  // Case 1: Platform SEO fields are blank -> falls back to uploaded HTML metadata
  const pageWithFallback: SmartPage = {
    id: 1,
    workspaceId: "ws-1",
    name: "Fallback Test",
    slug: "fallback-test",
    title: "",
    bio: "",
    profileImage: "",
    logoImage: "",
    status: "published",
    pageType: "custom_html",
    customHtml: {
      sourceHtml: uploadedHtml,
      draftHtml: uploadedHtml,
      publishedHtml: uploadedHtml,
      uploadedMetadata: uploadedMeta,
      draftVersion: 1,
      publishedVersion: 1,
      warnings: [],
      versions: [],
    },
    theme: {} as any,
    seo: {
      seoTitle: "",
      metaDescription: "",
      socialTitle: "",
      socialDescription: "",
      ogImage: "",
      favicon: "",
    },
    integrations: { metaPixelId: "", gtmId: "" },
    views: 0,
    uniqueVisitors: 0,
    createdAt: "",
    updatedAt: "",
    blocks: [],
  };

  const metaFallback = publicPageMetadata(pageWithFallback, { kind: "platform", hostname: "localhost" });
  assert.equal(metaFallback.title, "Uploaded HTML Title");
  assert.equal(metaFallback.description, "Uploaded HTML Meta Description");
  assert.equal(metaFallback.openGraph?.title, "Uploaded Social Title");

  // Case 2: Platform SEO fields are filled -> platform SEO WINS
  const pageWithPlatformSeo: SmartPage = {
    ...pageWithFallback,
    seo: {
      seoTitle: "Platform Wins Title",
      metaDescription: "Platform Wins Description",
      socialTitle: "Platform Wins Social",
      socialDescription: "Platform Wins Social Desc",
      ogImage: "https://example.com/platform.jpg",
      favicon: "https://example.com/platform-favicon.ico",
      canonicalUrl: "https://custom-canonical.com/page",
      noindex: true,
    },
  };

  const metaPlatform = publicPageMetadata(pageWithPlatformSeo, { kind: "platform", hostname: "localhost" });
  assert.equal(metaPlatform.title, "Platform Wins Title");
  assert.equal(metaPlatform.description, "Platform Wins Description");
  assert.equal(metaPlatform.openGraph?.title, "Platform Wins Social");
  assert.equal(metaPlatform.alternates?.canonical, "https://custom-canonical.com/page");
  assert.deepEqual(metaPlatform.robots, { index: false, follow: false });
});

test("Notifications: widget configuration properties and theme resolution", () => {
  const theme = resolveNotificationPromptTheme({
    enabled: true,
    widgetType: "pill",
    position: "top-right",
    offsetX: 35,
    offsetY: 45,
    iconMode: "custom",
    iconUrl: "https://example.com/icon.png",
    buttonColor: "#10b981",
    buttonTextColor: "#ffffff",
    cardBackground: "#18181b",
    textColor: "#fafafa",
    borderRadius: 24,
    shadow: 40,
    size: 18,
    showDesktop: true,
    showTablet: false,
    showMobile: true,
    notNowLabel: "Skip for now",
  });

  assert.equal(theme.widgetType, "pill");
  assert.equal(theme.position, "top-right");
  assert.equal(theme.offsetX, 35);
  assert.equal(theme.offsetY, 45);
  assert.equal(theme.iconMode, "custom");
  assert.equal(theme.iconUrl, "https://example.com/icon.png");
  assert.equal(theme.buttonColor, "#10b981");
  assert.equal(theme.cardBackground, "#18181b");
  assert.equal(theme.borderRadius, 24);
  assert.equal(theme.showTablet, false);
  assert.equal(theme.notNowLabel, "Skip for now");
});

test("Custom HTML link analytics: persists click events and aggregates in reports", async () => {
  const ws = "analytics-ws-" + Date.now();
  const slug = "click-test-" + Date.now();
  const page = await createCustomHtmlPage({ name: "Click Test", slug, workspaceId: ws });
  await updatePage(page.id, { status: "published" });

  // Track clicks on custom HTML links
  await trackCustomHtmlLinkClick(page.id, "https://whatsapp.com/chat/123", "Mozilla/5.0 (iPhone)", "https://google.com", "India", "Mumbai", "Mumbai, India", ws);
  await trackCustomHtmlLinkClick(page.id, "https://whatsapp.com/chat/123", "Mozilla/5.0 (Macintosh)", "Direct", "India", "Mumbai", "Mumbai, India", ws);
  await trackCustomHtmlLinkClick(page.id, "https://telegram.me/channel", "Mozilla/5.0 (Windows)", "https://t.co", "Bangladesh", "Dhaka", "Dhaka, Bangladesh", ws);

  const report = await analyticsForPage(page.id, 30);
  assert.ok(report);
  assert.equal(report?.clicks, 3);
  const waMetric = report?.customHtmlLinks?.find(l => l.href === "https://whatsapp.com/chat/123");
  const tgMetric = report?.customHtmlLinks?.find(l => l.href === "https://telegram.me/channel");
  assert.equal(waMetric?.clicks, 2);
  assert.equal(tgMetric?.clicks, 1);

  await deletePage(page.id);
});
