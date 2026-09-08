import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageRenderer } from "../components/PageRenderer";
import { defaultTheme, seedPages } from "../lib/defaults";
import { applyThemeDefinition, themeCssVariables, themeLibrary } from "../lib/themes";
import type { PageBlock, SmartPage } from "../lib/types";

function fixture(): SmartPage {
  const page = seedPages()[0];
  return { ...page, theme: { ...defaultTheme, backgroundImage: "/uploads/banner.webp" }, profileImage: "/uploads/profile.webp" };
}

test("the public page contains only the configured profile and content", () => {
  const page = fixture();
  const html = renderToStaticMarkup(<PageRenderer page={page} />);
  assert.match(html, /data-layout="hero"/);
  assert.match(html, /data-align="left"/);
  assert.match(html, /class="pageCover"/);
  assert.match(html, /src="\/uploads\/profile.webp"/);
  assert.match(html, /class="pageVideo"/);
  assert.doesNotMatch(html, /pageShare|Edit profile|pageBlockRow|Download QR/);
});

test("missing profile content does not create public placeholders", () => {
  const page = { ...fixture(), title: "", bio: "", profileImage: "", theme: { ...defaultTheme }, blocks: [] };
  const html = renderToStaticMarkup(<PageRenderer page={page} />);
  assert.doesNotMatch(html, /class="pageCover"|pageAvatar|pageProfile|pageTitle|pageBio|pageBlocks|pageShare/);
});

test("saved profile layouts are respected in the editor and public view", () => {
  for (const layout of ["hero", "centered", "avatar", "none"] as const) {
    for (const preview of [false, true]) {
      const page = fixture();
      page.theme.profileLayout = layout;
      const html = renderToStaticMarkup(<PageRenderer page={page} preview={preview} />);
      assert.equal(html.includes('class="pageCover"'), layout === "hero" || layout === "centered");
      assert.equal(html.includes('class="pageAvatar"'), layout !== "none");
      assert.ok(html.includes(page.title));
    }
  }
});

test("hidden blocks stay in the builder but are excluded from both visitor previews", () => {
  const page = fixture();
  page.blocks[0].isActive = false;
  page.blocks[0].title = "Private draft block";
  for (const preview of [false, true]) {
    assert.doesNotMatch(renderToStaticMarkup(<PageRenderer page={page} preview={preview} />), /Private draft block/);
  }
  const edit = { selectedBlockId: null, onSelectBlock() {}, onEditProfile() {} };
  const editor = renderToStaticMarkup(<PageRenderer page={page} edit={edit} />);
  assert.match(editor, /Private draft block/);
  assert.match(editor, /pageBlockHidden/);
});

test("links, consecutive social icons, and videos keep their saved order", () => {
  const page = fixture();
  const block = page.blocks[1];
  page.blocks = [
    { ...block, id: 3, sortOrder: 3, type: "socials", title: "Second social" },
    { ...block, id: 4, sortOrder: 4, type: "heading", title: "Last heading" },
    { ...block, id: 1, sortOrder: 1, title: "First link" },
    { ...block, id: 2, sortOrder: 2, type: "socials", title: "First social" },
  ] as PageBlock[];
  const html = renderToStaticMarkup(<PageRenderer page={page} />);
  const positions = ["First link", "First social", "Second social", "Last heading"].map((title) => html.indexOf(title));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.equal((html.match(/class="pageSocials"/g) || []).length, 1);
  assert.deepEqual(page.blocks.map(({ id }) => id), [3, 4, 1, 2]);
});

test("youtube blocks render as embedded video players", () => {
  const page = fixture();
  const block = page.blocks[0];
  page.blocks = [{
    ...block,
    id: 9,
    type: "youtube",
    title: "YouTube",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    videoUrl: "",
    sortOrder: 1,
  }];
  const html = renderToStaticMarkup(<PageRenderer page={page} />);
  assert.match(html, /class="pageVideo"/);
  assert.match(html, /https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ/);
  assert.doesNotMatch(html, /class="pageButton/);
});

test("Share is shown only when enabled, including pages without a cover", () => {
  for (const backgroundImage of ["", "/uploads/banner.webp"]) {
    const page = fixture();
    page.theme = { ...page.theme, backgroundImage, showShareButton: true };
    const html = renderToStaticMarkup(<PageRenderer page={page} />);
    assert.equal((html.match(/class="pageShare"/g) || []).length, 1);
  }
});

test("changing themes preserves the uploaded cover and profile choices", () => {
  const theme = { ...fixture().theme, profileLayout: "avatar" as const, profileAlignment: "right" as const, showShareButton: true };
  for (const definition of themeLibrary) {
    const result = applyThemeDefinition(definition, theme);
    assert.equal(result.backgroundImage, theme.backgroundImage);
    assert.equal(result.profileLayout, "avatar");
    assert.equal(result.profileAlignment, "right");
    assert.equal(result.showShareButton, true);
  }
});

test("saved background color and font reach the shared renderer", () => {
  const theme = { ...defaultTheme, backgroundColor: "#123456", font: "serif" as const };
  const variables = themeCssVariables(theme) as Record<string, string>;
  assert.equal(variables["--page-background"], "#123456");
  assert.match(variables["--page-font"], /Georgia/);
  const gradient = themeCssVariables({ ...theme, backgroundStyle: "gradient", gradientFrom: "#ff0000", gradientTo: "#000000" }) as Record<string, string>;
  assert.equal(gradient["--page-background"], "linear-gradient(135deg, #ff0000, #000000)");
});
