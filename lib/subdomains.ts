function configuredBaseHost() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) return "";

  try {
    return new URL(configuredUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function pageSlugFromHost(host: string | null) {
  if (!host) return null;

  const hostname = host.split(":")[0].toLowerCase();
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") return null;

  if (hostname.endsWith(".localhost")) {
    const slug = hostname.slice(0, -".localhost".length);
    return /^[a-z][a-z0-9-]*$/.test(slug) ? slug : null;
  }

  const baseHost = configuredBaseHost();
  if (!baseHost || hostname === baseHost || !hostname.endsWith(`.${baseHost}`)) return null;

  const slug = hostname.slice(0, -(baseHost.length + 1));
  if (["admin", "www"].includes(slug) || slug.includes(".")) return null;
  return /^[a-z][a-z0-9-]*$/.test(slug) ? slug : null;
}

export function publicSubdomainUrl(slug: string, origin?: string) {
  const base = origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const url = new URL(base);
    url.hostname = url.hostname === "localhost" ? `${slug}.localhost` : `${slug}.${url.hostname}`;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return `/${slug}`;
  }
}
