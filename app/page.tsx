"use client";

import { useEffect, useMemo, useState } from "react";

type LinkTone = "ink" | "paper" | "sky" | "mint" | "sun";
type Tab = "content" | "style" | "links" | "commerce" | "insights" | "inbox";

type LinkItem = {
  id: number;
  label: string;
  url: string;
  description: string;
  tone: LinkTone;
  clicks: number;
  enabled: boolean;
};

type Product = {
  id: number;
  name: string;
  price: string;
  active: boolean;
};

type RequestItem = {
  id: number;
  title: string;
  source: string;
  status: "New" | "Contacted" | "Won";
};

type Profile = {
  id: number;
  name: string;
  slug: string;
  headline: string;
  bio: string;
  location: string;
  initials: string;
  brandColor: string;
  accentColor: string;
  backgroundUrl: string;
  featuredTitle: string;
  featuredNote: string;
  published: boolean;
  views: number;
  links: LinkItem[];
  products: Product[];
  requests: RequestItem[];
};

const storageKey = "nord-linktree-builder";

const seedProfiles: Profile[] = [
  {
    id: 1,
    name: "Jeetbuzz Affiliate NPR",
    slug: "jeetbuzz-affiliate-npr",
    headline: "Jeetbuzz Affiliate NPR",
    bio: "One tap hub for signup, Telegram updates, WhatsApp help, and commission resources.",
    location: "Nepal partner desk",
    initials: "JA",
    brandColor: "#162217",
    accentColor: "#f8a01c",
    backgroundUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80",
    featuredTitle: "Start free. Earn lifetime commission.",
    featuredNote: "Add your onboarding video, pinned offer, or campaign note here.",
    published: true,
    views: 4218,
    links: [
      {
        id: 1,
        label: "Signup link",
        url: "https://example.com/signup",
        description: "Main partner registration",
        tone: "ink",
        clicks: 984,
        enabled: true,
      },
      {
        id: 2,
        label: "Telegram channel",
        url: "https://t.me/example",
        description: "Daily updates and creatives",
        tone: "sky",
        clicks: 612,
        enabled: true,
      },
      {
        id: 3,
        label: "WhatsApp support",
        url: "https://wa.me/10000000000",
        description: "Fast approval help",
        tone: "mint",
        clicks: 438,
        enabled: true,
      },
    ],
    products: [
      { id: 1, name: "Affiliate starter pack", price: "Free", active: true },
      { id: 2, name: "VIP onboarding", price: "Invite only", active: true },
    ],
    requests: [
      { id: 1, title: "NPR signup approval", source: "Telegram", status: "New" },
      { id: 2, title: "Landing page copy", source: "WhatsApp", status: "Contacted" },
      { id: 3, title: "Commission proof", source: "Direct link", status: "Won" },
    ],
  },
  {
    id: 2,
    name: "Creator Stack",
    slug: "creator-stack",
    headline: "Mira Sol",
    bio: "Design systems, templates, and short notes for creative operators.",
    location: "Remote studio",
    initials: "MS",
    brandColor: "#23324a",
    accentColor: "#2fb8a0",
    backgroundUrl:
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1600&q=80",
    featuredTitle: "Fresh templates every Friday.",
    featuredNote: "Keep your highest-value offer at the top of the public page.",
    published: false,
    views: 1694,
    links: [
      {
        id: 1,
        label: "Download templates",
        url: "https://example.com/templates",
        description: "Free design resources",
        tone: "sun",
        clicks: 309,
        enabled: true,
      },
      {
        id: 2,
        label: "Book a consult",
        url: "https://example.com/book",
        description: "30 minute strategy call",
        tone: "paper",
        clicks: 144,
        enabled: true,
      },
    ],
    products: [{ id: 1, name: "Template vault", price: "$29", active: true }],
    requests: [{ id: 1, title: "Portfolio review", source: "Booking", status: "New" }],
  },
];

const tabs: { id: Tab; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "style", label: "Style" },
  { id: "links", label: "Links" },
  { id: "commerce", label: "Commerce" },
  { id: "insights", label: "Insights" },
  { id: "inbox", label: "Inbox" },
];

const linkTones: { id: LinkTone; label: string }[] = [
  { id: "ink", label: "Ink" },
  { id: "paper", label: "Paper" },
  { id: "sky", label: "Sky" },
  { id: "mint", label: "Mint" },
  { id: "sun", label: "Sun" },
];

export default function Home() {
  const [profiles, setProfiles] = useState(seedProfiles);
  const [activeId, setActiveId] = useState(seedProfiles[0].id);
  const [tab, setTab] = useState<Tab>("content");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Profile[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.setTimeout(() => {
          setProfiles(parsed);
          setActiveId(parsed[0].id);
        }, 0);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(profiles));
  }, [profiles]);

  const profile = useMemo(
    () => profiles.find((item) => item.id === activeId) ?? profiles[0],
    [activeId, profiles],
  );

  const activeLinks = profile.links.filter((link) => link.enabled);
  const totalClicks = profile.links.reduce((sum, link) => sum + link.clicks, 0);
  const clickRate = Math.max(1, Math.round((totalClicks / profile.views) * 100));

  function updateProfile(patch: Partial<Profile>) {
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? { ...item, ...patch } : item)),
    );
  }

  function updateLink(id: number, patch: Partial<LinkItem>) {
    updateProfile({
      links: profile.links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    });
  }

  function updateProduct(id: number, patch: Partial<Product>) {
    updateProfile({
      products: profile.products.map((product) =>
        product.id === id ? { ...product, ...patch } : product,
      ),
    });
  }

  function addProfile() {
    const id = Date.now();
    setProfiles((current) => [
      ...current,
      {
        ...seedProfiles[0],
        id,
        name: "New link page",
        slug: `page-${id}`,
        headline: "New link page",
        published: false,
        views: 0,
        requests: [],
        links: [
          {
            id: id + 1,
            label: "My first link",
            url: "https://example.com",
            description: "Add a short description",
            tone: "ink",
            clicks: 0,
            enabled: true,
          },
        ],
        products: [],
      },
    ]);
    setActiveId(id);
    setTab("content");
  }

  function addLink() {
    updateProfile({
      links: [
        ...profile.links,
        {
          id: Date.now(),
          label: "New link",
          url: "https://example.com",
          description: "What visitors get after tapping",
          tone: "paper",
          clicks: 0,
          enabled: true,
        },
      ],
    });
  }

  function addProduct() {
    updateProfile({
      products: [
        ...profile.products,
        { id: Date.now(), name: "New offer", price: "Free", active: true },
      ],
    });
  }

  function trackClick(id: number) {
    updateProfile({
      views: profile.views + 1,
      links: profile.links.map((link) =>
        link.id === id ? { ...link, clicks: link.clicks + 1 } : link,
      ),
    });
  }

  return (
    <main className="appShell">
      <section className="topBar" aria-label="Workspace summary">
        <div>
          <p>Link page builder</p>
          <h1>Launch beautiful bio pages without code.</h1>
        </div>
        <div className="topActions">
          <span>{profile.published ? "Published" : "Draft"}</span>
          <button type="button" onClick={() => updateProfile({ published: !profile.published })}>
            {profile.published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar" aria-label="Link pages">
          <div className="brand">
            <div className="brandMark">NL</div>
            <div>
              <strong>NordLink</strong>
              <span>Node + Next builder</span>
            </div>
          </div>

          <button type="button" className="newPageButton" onClick={addProfile}>
            + New page
          </button>

          <div className="profileCards">
            {profiles.map((item) => (
              <button
                type="button"
                className={`profileCard ${item.id === profile.id ? "selected" : ""}`}
                key={item.id}
                onClick={() => setActiveId(item.id)}
              >
                <span>{item.initials}</span>
                <strong>{item.name}</strong>
                <small>{item.slug}.nordlink.app</small>
                <em>{item.published ? "Live" : "Draft"}</em>
              </button>
            ))}
          </div>
        </aside>

        <section className="previewPanel" aria-label="Live public page preview">
          <div className="previewToolbar">
            <span>{profile.slug}.nordlink.app</span>
            <button type="button" onClick={() => updateProfile({ views: profile.views + 1 })}>
              Preview visit
            </button>
          </div>

          <article className="phone" style={{ "--brand": profile.brandColor, "--accent": profile.accentColor } as React.CSSProperties}>
            <div
              className="publicHero"
              style={{
                backgroundImage: `linear-gradient(160deg, ${profile.brandColor}f7 0%, ${profile.brandColor}bf 54%, ${profile.accentColor}9e 100%), url(${profile.backgroundUrl})`,
              }}
            >
              <div className="publicNav">
                <span>{profile.published ? "Live" : "Draft"}</span>
                <span>{profile.location}</span>
              </div>
              <div className="avatar">{profile.initials}</div>
              <h2>{profile.headline}</h2>
              <p>{profile.bio}</p>
            </div>

            <div className="featured">
              <span>Featured</span>
              <strong>{profile.featuredTitle}</strong>
              <p>{profile.featuredNote}</p>
            </div>

            <div className="publicLinks">
              {activeLinks.map((link) => (
                <a
                  className={`publicLink ${link.tone}`}
                  href={link.url}
                  key={link.id}
                  onClick={() => trackClick(link.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{link.label.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{link.label}</strong>
                    <small>{link.description}</small>
                  </div>
                  <em>↗</em>
                </a>
              ))}
            </div>

            <div className="storeStrip">
              {profile.products
                .filter((product) => product.active)
                .map((product) => (
                  <div key={product.id}>
                    <span>{product.name}</span>
                    <strong>{product.price}</strong>
                  </div>
                ))}
            </div>
          </article>
        </section>

        <section className="editorPanel" aria-label="Page editor">
          <header className="editorHeader">
            <div>
              <p>Editing</p>
              <h2>{profile.name}</h2>
            </div>
            <button type="button" onClick={() => updateProfile({ published: !profile.published })}>
              {profile.published ? "Live" : "Publish"}
            </button>
          </header>

          <nav className="tabs" aria-label="Editor tabs">
            {tabs.map((item) => (
              <button
                type="button"
                className={tab === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {tab === "content" && (
            <div className="formStack">
              <Field label="Page name">
                <input
                  value={profile.name}
                  onChange={(event) =>
                    updateProfile({ name: event.target.value, headline: event.target.value })
                  }
                />
              </Field>
              <Field label="Bio">
                <textarea value={profile.bio} onChange={(event) => updateProfile({ bio: event.target.value })} />
              </Field>
              <Field label="Location or audience">
                <input value={profile.location} onChange={(event) => updateProfile({ location: event.target.value })} />
              </Field>
              <Field label="Featured headline">
                <input
                  value={profile.featuredTitle}
                  onChange={(event) => updateProfile({ featuredTitle: event.target.value })}
                />
              </Field>
              <Field label="Featured note">
                <textarea
                  value={profile.featuredNote}
                  onChange={(event) => updateProfile({ featuredNote: event.target.value })}
                />
              </Field>
            </div>
          )}

          {tab === "style" && (
            <div className="formStack">
              <Field label="Slug">
                <input
                  value={profile.slug}
                  onChange={(event) =>
                    updateProfile({
                      slug: event.target.value
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, ""),
                    })
                  }
                />
              </Field>
              <div className="colorGrid">
                <Field label="Brand color">
                  <input
                    type="color"
                    value={profile.brandColor}
                    onChange={(event) => updateProfile({ brandColor: event.target.value })}
                  />
                </Field>
                <Field label="Accent color">
                  <input
                    type="color"
                    value={profile.accentColor}
                    onChange={(event) => updateProfile({ accentColor: event.target.value })}
                  />
                </Field>
                <Field label="Initials">
                  <input
                    maxLength={3}
                    value={profile.initials}
                    onChange={(event) => updateProfile({ initials: event.target.value.toUpperCase() })}
                  />
                </Field>
              </div>
              <Field label="Hero image URL">
                <input
                  value={profile.backgroundUrl}
                  onChange={(event) => updateProfile({ backgroundUrl: event.target.value })}
                />
              </Field>
            </div>
          )}

          {tab === "links" && (
            <div className="formStack">
              <div className="sectionTitle">
                <h3>Links</h3>
                <button type="button" onClick={addLink}>
                  Add link
                </button>
              </div>
              {profile.links.map((link) => (
                <div className="linkEditor" key={link.id}>
                  <div className="linkEditorTop">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={link.enabled}
                        onChange={(event) => updateLink(link.id, { enabled: event.target.checked })}
                      />
                      <span />
                    </label>
                    <strong>{link.clicks.toLocaleString()} clicks</strong>
                  </div>
                  <input
                    aria-label="Link label"
                    value={link.label}
                    onChange={(event) => updateLink(link.id, { label: event.target.value })}
                  />
                  <input
                    aria-label="Link URL"
                    value={link.url}
                    onChange={(event) => updateLink(link.id, { url: event.target.value })}
                  />
                  <input
                    aria-label="Link description"
                    value={link.description}
                    onChange={(event) => updateLink(link.id, { description: event.target.value })}
                  />
                  <select
                    aria-label="Link style"
                    value={link.tone}
                    onChange={(event) => updateLink(link.id, { tone: event.target.value as LinkTone })}
                  >
                    {linkTones.map((tone) => (
                      <option value={tone.id} key={tone.id}>
                        {tone.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {tab === "commerce" && (
            <div className="formStack">
              <div className="sectionTitle">
                <h3>Offers</h3>
                <button type="button" onClick={addProduct}>
                  Add offer
                </button>
              </div>
              {profile.products.map((product) => (
                <div className="productEditor" key={product.id}>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={product.active}
                      onChange={(event) => updateProduct(product.id, { active: event.target.checked })}
                    />
                    <span />
                  </label>
                  <input
                    aria-label="Offer name"
                    value={product.name}
                    onChange={(event) => updateProduct(product.id, { name: event.target.value })}
                  />
                  <input
                    aria-label="Offer price"
                    value={product.price}
                    onChange={(event) => updateProduct(product.id, { price: event.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          {tab === "insights" && (
            <div className="insights">
              <Metric label="Views" value={profile.views.toLocaleString()} />
              <Metric label="Clicks" value={totalClicks.toLocaleString()} />
              <Metric label="Click rate" value={`${clickRate}%`} />
              <Metric label="Live links" value={activeLinks.length.toString()} />
              <div className="chart" aria-label="Weekly engagement chart">
                {[42, 64, 48, 77, 59, 88, 72].map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          )}

          {tab === "inbox" && (
            <div className="requests">
              {profile.requests.map((request) => (
                <div key={request.id}>
                  <strong>{request.title}</strong>
                  <span>{request.source}</span>
                  <em>{request.status}</em>
                </div>
              ))}
              {profile.requests.length === 0 && (
                <div className="emptyState">
                  <strong>No requests yet</strong>
                  <span>Visitor requests will appear here once the page is live.</span>
                </div>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
