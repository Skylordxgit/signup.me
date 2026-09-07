"use client";

import { useEffect, useMemo, useState } from "react";

type LinkItem = {
  id: number;
  label: string;
  url: string;
  tone: "dark" | "light" | "blue" | "green";
  icon: string;
};

type Product = {
  id: number;
  name: string;
  price: string;
  active: boolean;
};

type Profile = {
  id: number;
  name: string;
  slug: string;
  headline: string;
  subtitle: string;
  bannerText: string;
  bannerSubtext: string;
  avatarText: string;
  brandColor: string;
  accentColor: string;
  backgroundUrl: string;
  videoTitle: string;
  videoNote: string;
  published: boolean;
  links: LinkItem[];
  products: Product[];
};

const profilesSeed: Profile[] = [
  {
    id: 1,
    name: "Jeetbuzz Affiliate NPR",
    slug: "jeetbuzz-affiliate-npr",
    headline: "Jeetbuzz Affiliate NPR",
    subtitle: "We Welcome Affiliates From All Over The World",
    bannerText: "Start free. Earn lifetime commission.",
    bannerSubtext: "One page for signup, Telegram, WhatsApp, video guides, and support.",
    avatarText: "JA",
    brandColor: "#10180d",
    accentColor: "#ff9d22",
    backgroundUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80",
    videoTitle: "Signup walkthrough",
    videoNote: "Add your training video link or embed after launch.",
    published: true,
    links: [
      { id: 1, label: "Signup Link...!!!", url: "https://example.com/signup", tone: "dark", icon: "Web" },
      { id: 2, label: "Telegram", url: "https://t.me/example", tone: "blue", icon: "TG" },
      { id: 3, label: "WhatsApp Support", url: "https://wa.me/10000000000", tone: "green", icon: "WA" },
    ],
    products: [
      { id: 1, name: "NPR Affiliate Pack", price: "Free", active: true },
      { id: 2, name: "VIP onboarding", price: "Invite only", active: true },
    ],
  },
  {
    id: 2,
    name: "Baji Affiliate NPR",
    slug: "baji-affiliate-npr",
    headline: "Baji Affiliate NPR",
    subtitle: "50% Weekly Commission",
    bannerText: "IPL traffic page for fast signup.",
    bannerSubtext: "A clean mobile page for affiliate signups and messenger support.",
    avatarText: "BA",
    brandColor: "#263325",
    accentColor: "#ff405e",
    backgroundUrl:
      "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1400&q=80",
    videoTitle: "Signup video in Nepali",
    videoNote: "Place your explainer or YouTube embed here.",
    published: false,
    links: [
      { id: 1, label: "Signup Link.....!!!", url: "https://example.com/baji", tone: "light", icon: "Web" },
      { id: 2, label: "Telegram", url: "https://t.me/example", tone: "blue", icon: "TG" },
      { id: 3, label: "WhatsApp", url: "https://wa.me/10000000000", tone: "green", icon: "WA" },
    ],
    products: [{ id: 1, name: "Weekly commission guide", price: "Free", active: true }],
  },
  {
    id: 3,
    name: "JeetBuzz Affiliate PKR",
    slug: "jeetbuzz-affiliate-pkr",
    headline: "JeetBuzz Affiliate PKR",
    subtitle: "Pakistan traffic and partner links",
    bannerText: "All signup links in one place.",
    bannerSubtext: "Publish a focused profile for each country or currency.",
    avatarText: "JP",
    brandColor: "#10180d",
    accentColor: "#24b36b",
    backgroundUrl:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=80",
    videoTitle: "Partner onboarding",
    videoNote: "Use this space for instructions, rules, or a short video.",
    published: false,
    links: [
      { id: 1, label: "Signup Link", url: "https://example.com/pkr", tone: "dark", icon: "Web" },
      { id: 2, label: "Telegram Channel", url: "https://t.me/example", tone: "blue", icon: "TG" },
    ],
    products: [{ id: 1, name: "PKR starter guide", price: "Free", active: true }],
  },
];

const tones = {
  dark: "linkDark",
  light: "linkLight",
  blue: "linkBlue",
  green: "linkGreen",
};

export default function Home() {
  const [profiles, setProfiles] = useState<Profile[]>(profilesSeed);
  const [activeId, setActiveId] = useState(1);
  const [tab, setTab] = useState("edit");
  const [views, setViews] = useState(1284);
  const [clicks, setClicks] = useState(367);

  useEffect(() => {
    const saved = window.localStorage.getItem("linkstudio-profiles");
    if (saved) {
      setProfiles(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("linkstudio-profiles", JSON.stringify(profiles));
  }, [profiles]);

  const profile = useMemo(
    () => profiles.find((item) => item.id === activeId) ?? profiles[0],
    [activeId, profiles],
  );

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

  function addLink() {
    updateProfile({
      links: [
        ...profile.links,
        {
          id: Date.now(),
          label: "New link",
          url: "https://example.com",
          tone: "dark",
          icon: "URL",
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

  function trackClick() {
    setClicks((value) => value + 1);
    setViews((value) => value + 2);
  }

  return (
    <main className="appShell">
      <section className="workspace">
        <aside className="siteList" aria-label="Websites">
          <div className="brand">
            <div className="brandMark">LS</div>
            <span>LinkStudio</span>
          </div>
          <div className="listHeader">
            <h1>My Websites</h1>
            <button
              type="button"
              aria-label="Create new website"
              onClick={() => {
                const id = Date.now();
                setProfiles((current) => [
                  ...current,
                  {
                    ...profilesSeed[0],
                    id,
                    name: "New Affiliate Page",
                    headline: "New Affiliate Page",
                    slug: `page-${id}`,
                    published: false,
                  },
                ]);
                setActiveId(id);
                setTab("edit");
              }}
            >
              +
            </button>
          </div>
          <div className="profileCards">
            {profiles.map((item) => (
              <button
                type="button"
                className={`profileCard ${item.id === profile.id ? "selected" : ""}`}
                key={item.id}
                onClick={() => setActiveId(item.id)}
              >
                <strong>{item.name}</strong>
                <span>{item.slug}.linkstudio.local</span>
                <em>{item.published ? "Published" : "Not published"}</em>
              </button>
            ))}
          </div>
        </aside>

        <section className="phoneWrap" aria-label="Public link page preview">
          <div className="phoneTop">
            <span>{profile.slug}.linkstudio.local</span>
            <button type="button" onClick={() => updateProfile({ published: !profile.published })}>
              {profile.published ? "Unpublish" : "Publish"}
            </button>
          </div>
          <div className="phone">
            <div
              className="hero"
              style={{
                backgroundImage: `linear-gradient(90deg, ${profile.brandColor}f2, ${profile.brandColor}b8), url(${profile.backgroundUrl})`,
              }}
            >
              <div className="heroMock">
                <span>50%</span>
                <small>weekly commission</small>
              </div>
              <div>
                <p>Affiliate hub</p>
                <h2>{profile.bannerText}</h2>
                <span>{profile.bannerSubtext}</span>
              </div>
            </div>
            <div className="identity">
              <div className="avatar" style={{ backgroundColor: profile.brandColor }}>
                {profile.avatarText}
              </div>
              <div>
                <h2>{profile.headline}</h2>
                <p>{profile.subtitle}</p>
              </div>
            </div>
            <div className="publicLinks">
              {profile.links.map((link) => (
                <a
                  key={link.id}
                  className={tones[link.tone]}
                  href={link.url}
                  onClick={trackClick}
                  target="_blank"
                >
                  <span>{link.icon}</span>
                  <strong>{link.label}</strong>
                </a>
              ))}
            </div>
            <div className="videoBlock">
              <div>
                <span className="play">▶</span>
                <h3>{profile.videoTitle}</h3>
                <p>{profile.videoNote}</p>
              </div>
            </div>
            <div className="productStrip">
              {profile.products
                .filter((item) => item.active)
                .map((item) => (
                  <div key={item.id}>
                    <strong>{item.name}</strong>
                    <span>{item.price}</span>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className="adminPanel" aria-label="Admin panel">
          <header>
            <button type="button" className="backButton" aria-label="Back to websites">
              ‹
            </button>
            <div>
              <h2>{profile.name}</h2>
              <span>{profile.published ? "Live page" : "Draft page"}</span>
            </div>
            <button
              type="button"
              className="publishButton"
              onClick={() => updateProfile({ published: !profile.published })}
            >
              {profile.published ? "Live" : "Publish"}
            </button>
          </header>

          <nav className="tabs" aria-label="Admin sections">
            {["edit", "audience", "analytics", "requests", "products", "settings"].map((item) => (
              <button
                type="button"
                className={tab === item ? "active" : ""}
                key={item}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </nav>

          {tab === "edit" && (
            <div className="panelStack">
              <label>
                Page title
                <input value={profile.headline} onChange={(event) => updateProfile({ headline: event.target.value, name: event.target.value })} />
              </label>
              <label>
                Subtitle
                <input value={profile.subtitle} onChange={(event) => updateProfile({ subtitle: event.target.value })} />
              </label>
              <label>
                Banner headline
                <textarea value={profile.bannerText} onChange={(event) => updateProfile({ bannerText: event.target.value })} />
              </label>
              <div className="sectionTitle">
                <h3>Links</h3>
                <button type="button" onClick={addLink}>Add link</button>
              </div>
              {profile.links.map((link) => (
                <div className="linkEditor" key={link.id}>
                  <input value={link.icon} aria-label="Link icon label" onChange={(event) => updateLink(link.id, { icon: event.target.value })} />
                  <input value={link.label} aria-label="Link label" onChange={(event) => updateLink(link.id, { label: event.target.value })} />
                  <select value={link.tone} aria-label="Link style" onChange={(event) => updateLink(link.id, { tone: event.target.value as LinkItem["tone"] })}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="blue">Blue</option>
                    <option value="green">Green</option>
                  </select>
                </div>
              ))}
            </div>
          )}

          {tab === "audience" && (
            <div className="metricGrid">
              <Metric label="Subscribers" value="2,418" />
              <Metric label="Countries" value="11" />
              <Metric label="Returning users" value="42%" />
              <Metric label="Top source" value="Telegram" />
            </div>
          )}

          {tab === "analytics" && (
            <div className="analytics">
              <Metric label="Profile views" value={views.toLocaleString()} />
              <Metric label="Link clicks" value={clicks.toLocaleString()} />
              <Metric label="Click rate" value={`${Math.round((clicks / views) * 100)}%`} />
              <div className="chart" aria-label="Seven day click chart">
                {[44, 62, 57, 78, 71, 86, 96].map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          )}

          {tab === "requests" && (
            <div className="requests">
              {["NPR signup approval", "Telegram access", "Commission proof"].map((item, index) => (
                <div key={item}>
                  <strong>{item}</strong>
                  <span>{index + 3} waiting</span>
                  <button type="button">Review</button>
                </div>
              ))}
            </div>
          )}

          {tab === "products" && (
            <div className="panelStack">
              <div className="sectionTitle">
                <h3>Products</h3>
                <button type="button" onClick={addProduct}>Add product</button>
              </div>
              {profile.products.map((product) => (
                <label className="productEditor" key={product.id}>
                  <input
                    type="checkbox"
                    checked={product.active}
                    onChange={(event) =>
                      updateProfile({
                        products: profile.products.map((item) =>
                          item.id === product.id ? { ...item, active: event.target.checked } : item,
                        ),
                      })
                    }
                  />
                  <span>{product.name}</span>
                  <em>{product.price}</em>
                </label>
              ))}
            </div>
          )}

          {tab === "settings" && (
            <div className="panelStack">
              <label>
                Slug
                <input value={profile.slug} onChange={(event) => updateProfile({ slug: event.target.value.toLowerCase().replaceAll(" ", "-") })} />
              </label>
              <label>
                Brand color
                <input type="color" value={profile.brandColor} onChange={(event) => updateProfile({ brandColor: event.target.value })} />
              </label>
              <label>
                Accent color
                <input type="color" value={profile.accentColor} onChange={(event) => updateProfile({ accentColor: event.target.value })} />
              </label>
              <label>
                Hero image URL
                <input value={profile.backgroundUrl} onChange={(event) => updateProfile({ backgroundUrl: event.target.value })} />
              </label>
            </div>
          )}
        </section>
      </section>
    </main>
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
